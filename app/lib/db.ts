import { WordProgress, QuizQuestion, SimulationStep, Word, Folder, QuizStats } from './satTypes'
import { assetPath } from './paths'
import { isDriveConfigured, readDriveFile, writeDriveFile, getDriveUser, hasLiveToken } from './drive'

/**
 * Hybrid data layer for the static (GitHub Pages) build.
 *
 * When Google Drive keys are configured at build time AND the user is signed
 * in, quizzes, progress and stats are stored as JSON files in a per-user
 * "OpenQuiz" folder in their Google Drive. Otherwise everything is persisted
 * to localStorage — the site works identically with no backend. Every
 * function keeps the same signature in both modes, so callers don't know (or
 * care) which backend is active. Drive reads fall back to local data so guest
 * progress is never lost.
 */

const PROGRESS_KEY = 'oquiz:progress'
const CUSTOM_QUIZZES_KEY = 'oquiz:custom_quizzes'
const DAILY_STATS_KEY = 'oquiz:daily_stats'
const FOLDERS_KEY = 'oquiz:folders'
const QUIZ_STATS_KEY = 'oquiz:quiz_stats'

const PROGRESS_FILE = 'progress.json'
const CUSTOM_QUIZZES_FILE = 'custom_quizzes.json'
const DAILY_STATS_FILE = 'daily_stats.json'
const FOLDERS_FILE = 'folders.json'
const QUIZ_STATS_FILE = 'quiz_stats.json'

const MANIFEST_PATH = '/sat/quiz-sets.json'

// A user is "cloud active" when Drive is configured, they're signed in, AND a
// usable token is actually available. A stored profile alone is not enough: if
// the silent token restore failed, cloud reads/writes would silently no-op, so
// we fall back to localStorage and surface the truth.
function isCloudActive(): boolean {
    return isDriveConfigured() && typeof window !== 'undefined' && Boolean(getDriveUser()) && hasLiveToken()
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function readJson<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback
    try {
        const stored = window.localStorage.getItem(key)
        return stored ? (JSON.parse(stored) as T) : fallback
    } catch {
        return fallback
    }
}

function writeJson(key: string, value: unknown) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// Word progress
// ---------------------------------------------------------------------------

export async function getWordProgress(userId: string): Promise<Record<string, WordProgress>> {
    const local = readJson<Record<string, WordProgress>>(PROGRESS_KEY, {})

    if (isCloudActive()) {
        const remote = await readDriveFile<Record<string, WordProgress>>(PROGRESS_FILE)
        if (remote) return remote
    }

    return local
}

export async function saveWordProgress(userId: string, word: string, progress: WordProgress) {
    const all = await getWordProgress(userId)
    all[word] = progress
    writeJson(PROGRESS_KEY, all)

    if (isCloudActive()) {
        await writeDriveFile(PROGRESS_FILE, all)
    }
}

// ---------------------------------------------------------------------------
// Official quiz sets (static manifest — same in both modes)
// ---------------------------------------------------------------------------

async function getQuizSetManifest(): Promise<any[]> {
    try {
        const res = await fetch(assetPath(MANIFEST_PATH))
        if (!res.ok) return []
        const data = await res.json()
        return Array.isArray(data) ? data : []
    } catch {
        return []
    }
}

export async function getQuizSets() {
    return getQuizSetManifest()
}

export async function getQuizSetByPath(filePath: string) {
    const normalized = filePath.startsWith('/') ? filePath : `/${filePath}`
    const sets = await getQuizSetManifest()
    return sets.find(s => s.file_path === normalized) || null
}

/**
 * Load an official (pre-made) quiz content file. Files may be either
 * vocabulary-shaped (array of `Word` objects) OR question-shaped (array of
 * `prompt`/`options`/... quiz questions). We sniff the shape and split
 * accordingly so the same loader works for SAT vocab and Security+ practice.
 */
export async function loadOfficialQuiz(filePath: string): Promise<{ words: Word[]; questions: QuizQuestion[] }> {
    try {
        const res = await fetch(assetPath(filePath))
        if (!res.ok) return { words: [], questions: [] }
        const items = await res.json()
        return parseOfficialQuiz(items)
    } catch {
        return { words: [], questions: [] }
    }
}

export function parseOfficialQuiz(items: unknown): { words: Word[]; questions: QuizQuestion[] } {
    if (!Array.isArray(items)) return { words: [], questions: [] }
    const { words, questions } = normalizeImportedQuizItems(items)
    return { words, questions }
}

// ---------------------------------------------------------------------------
// Custom quizzes
// ---------------------------------------------------------------------------

export async function getCustomQuizzes(userId: string) {
    const local = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
        .filter(q => q.user_id === userId)

    if (isCloudActive()) {
        const remote = await readDriveFile<any[]>(CUSTOM_QUIZZES_FILE)
        if (remote) return remote
    }

    return local
}

export async function getPublicQuizzes(excludeUserId?: string) {
    // Public "community" quizzes are not shared via personal Drive storage.
    // Guests can still share quizzes with each other locally.
    const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    return all.filter(q => q.is_public && q.user_id !== excludeUserId)
}

export async function getCustomQuizById(quizId: string) {
    const local = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
        .find(q => q.id === quizId) || null

    if (isCloudActive()) {
        const remote = await readDriveFile<any[]>(CUSTOM_QUIZZES_FILE)
        const remoteQuiz = (remote || []).find(q => q.id === quizId)
        if (remoteQuiz) return repairQuizShape(remoteQuiz)
    }

    return repairQuizShape(local)
}

/**
 * Accept both vocabulary entries (`word`/`ru`) and manual questions
 * (`question`+`options`+`answer`, or `prompt`-style) in a single pasted
 * JSON. Returns which half the array is so callers store it correctly,
 * plus any per-item validation errors so the import UI can tell the user
 * exactly what won't load.
 */
export function normalizeImportedQuizItems(
    items: any[]
): { words: any[]; questions: QuizQuestion[]; errors: string[] } {
    if (!Array.isArray(items)) return { words: [], questions: [], errors: ['JSON must be an array'] }
    if (!items.length) return { words: [], questions: [], errors: ['No items to import'] }

    const looksLikeWords = items.some((it: any) =>
        it && typeof it === 'object' && typeof it.word === 'string' && typeof it.ru === 'string'
    )

    if (looksLikeWords) {
        const errors: string[] = []
        const words: any[] = []
        items.forEach((it: any, i: number) => {
            if (!it || typeof it !== 'object') {
                errors.push(`Item ${i + 1}: not an object`)
                return
            }
            if (!it.word || !String(it.word).trim()) {
                errors.push(`Item ${i + 1}: missing "word"`)
                return
            }
            if (!it.ru || !String(it.ru).trim()) {
                errors.push(`Item ${i + 1} ("${it.word}"): missing "ru"`)
                return
            }
            const clean: any = {
                word: String(it.word).trim(),
                ru: String(it.ru).trim(),
                synonyms: Array.isArray(it.synonyms) ? it.synonyms.map((s: any) => String(s)) : [],
                simple_examples: Array.isArray(it.simple_examples) ? it.simple_examples.map((s: any) => String(s)) : [],
                advanced_example: it.advanced_example ? String(it.advanced_example) : '',
                confusions: Array.isArray(it.confusions) ? it.confusions.map((s: any) => String(s)) : []
            }
            if (it.image) clean.image = String(it.image)
            words.push(clean)
        })
        return { words, questions: [], errors }
    }

    const makeId = (it: any, i: number) =>
        it?.id ? String(it.id) :
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `q-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    const stripPrefix = (opt: unknown): string =>
        String(opt ?? '')
            .trim()
            .replace(/^[A-Ea-e0-9][.)\-:]\s*/, '')
            .trim()

    const questions: QuizQuestion[] = []
    const errors: string[] = []
    items.forEach((it: any, i: number) => {
        if (!it || typeof it !== 'object') {
            errors.push(`Item ${i + 1}: not an object`)
            return
        }
        const prompt = String(it.prompt || it.question || it.q || '').trim()
        if (!prompt) {
            errors.push(`Item ${i + 1}: missing a question/prompt`)
            return
        }

        if (it.kind === 'simulation') {
            const steps = Array.isArray(it.steps) ? it.steps.map((s: any, si: number): SimulationStep => {
                const base: SimulationStep = {
                    id: s?.id || `step-${makeId(it, i)}-${si}`,
                    kind: (s?.kind === 'choice' || s?.kind === 'checkbox' || s?.kind === 'config' || s?.kind === 'placement') ? s.kind : 'choice',
                    title: String(s?.title || ''),
                    explanation: s?.explanation ? String(s.explanation) : ''
                }
                if (base.kind === 'choice') {
                    base.options = Array.isArray(s?.options) ? s.options.map(String) : []
                    base.correctIndex = Number.isInteger(s?.correctIndex) ? s.correctIndex : 0
                }
                if (base.kind === 'checkbox') {
                    base.items = Array.isArray(s?.items) ? s.items.map((it2: any, ix: number) => ({
                        id: it2?.id || `it-${makeId(it, i)}-${ix}`,
                        label: String(it2?.label || ''),
                        correct: !!it2?.correct
                    })) : []
                }
                if (base.kind === 'config') {
                    base.config = Array.isArray(s?.config) ? s.config.map((it2: any, ix: number) => ({
                        id: it2?.id || `it-${makeId(it, i)}-${ix}`,
                        label: String(it2?.label || ''),
                        correct: !!it2?.correct
                    })) : []
                }
                if (base.kind === 'placement') {
                    base.itemsToPlace = Array.isArray(s?.itemsToPlace) ? s.itemsToPlace.map(String) : []
                    base.slots = Array.isArray(s?.slots) ? s.slots.map(String) : []
                    base.correctMapping = Array.isArray(s?.correctMapping) ? s.correctMapping.map(Number) : []
                }
                if (s?.image) base.image = String(s.image)
                return base
            }) : []
            const q: QuizQuestion = {
                id: makeId(it, i),
                kind: 'simulation',
                prompt,
                steps,
                explanation: it.explanation ? String(it.explanation) : ''
            }
            if (it.image) q.image = String(it.image)
            questions.push(q)
            return
        }

        const options = Array.isArray(it.options)
            ? it.options.map(stripPrefix).filter(Boolean)
            : []

        if (options.length >= 2) {
            let correctIndex = 0
            if (Number.isInteger(it.correctIndex) && it.correctIndex >= 0 && it.correctIndex < options.length) {
                correctIndex = it.correctIndex
            } else if (it.answer != null) {
                const ans = String(it.answer).trim()
                const letterIdx = ans.length === 1 ? ans.toUpperCase().charCodeAt(0) - 65 : -1
                if (letterIdx >= 0 && letterIdx < options.length) {
                    correctIndex = letterIdx
                } else {
                    const match = options.findIndex((o: string) => o.toLowerCase() === ans.toLowerCase() || stripPrefix(ans).toLowerCase() === o.toLowerCase())
                    correctIndex = match >= 0 ? match : 0
                }
            }
            const q: QuizQuestion = {
                id: makeId(it, i),
                kind: 'multiple_choice',
                prompt,
                options,
                correctIndex,
                explanation: it.explanation ? String(it.explanation) : ''
            }
            if (it.image) q.image = String(it.image)
            questions.push(q)
        } else if (it.kind === 'true_false' || typeof it.answer === 'boolean' || /^(true|false|t|f)$/i.test(String(it.answer ?? '').trim())) {
            const q: QuizQuestion = {
                id: makeId(it, i),
                kind: 'true_false',
                prompt,
                correctAnswer: it.correctAnswer === true || it.answer === true || /^(true|t)$/i.test(String(it.answer).trim()),
                explanation: it.explanation ? String(it.explanation) : ''
            }
            if (it.image) q.image = String(it.image)
            questions.push(q)
        } else {
            const answer = String(it.answer ?? it.correct_answer ?? '').trim()
            const q: QuizQuestion = {
                id: makeId(it, i),
                kind: 'flashcard',
                prompt,
                answer,
                explanation: it.explanation ? String(it.explanation) : ''
            }
            if (it.image) q.image = String(it.image)
            questions.push(q)
        }
    })

    return { words: [], questions, errors }
}

/**
 * Some quizzes were imported before question-shaped JSON was supported and
 * ended up stored inside `words`. Repair on read: if there are no `questions`
 * but `words` contains question-shaped entries, move them into `questions`.
 */
export function repairQuizShape(quiz: any): any {
    if (!quiz) return quiz
    if (Array.isArray(quiz.questions) && quiz.questions.length) return quiz
    const items = Array.isArray(quiz.words) ? quiz.words : []
    const hasWords = items.some((w: any) =>
        w && typeof w === 'object' && typeof w.word === 'string' && typeof w.ru === 'string'
    )
    if (hasWords || !items.length) return quiz
    const { questions } = normalizeImportedQuizItems(items)
    return { ...quiz, words: [], questions }
}

/**
 * Human-friendly summary of what was wrong with a pasted JSON payload.
 * Returns a block of error strings (empty = valid) plus how many usable
 * items were parsed.
 */
export function validateQuizJSON(jsonText: string): { ok: boolean; errors: string[]; count: number } {
    let parsed: any
    try {
        parsed = JSON.parse(jsonText)
    } catch (err: any) {
        return { ok: false, errors: [`Invalid JSON: ${err?.message || 'could not be parsed'}`], count: 0 }
    }

    if (!Array.isArray(parsed)) {
        return { ok: false, errors: ['JSON must be an array of items'], count: 0 }
    }

    const { words, questions, errors } = normalizeImportedQuizItems(parsed)
    if (errors.length) {
        return { ok: false, errors: errors.slice(0, 10), count: words.length + questions.length }
    }
    return { ok: true, errors: [], count: words.length + questions.length }
}

export async function createCustomQuiz(
    userId: string,
    name: string,
    description: string,
    words: any[],
    isPublic: boolean = false,
    authorName?: string,
    questions?: QuizQuestion[]
) {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    const quiz = {
        id,
        user_id: userId,
        name,
        description,
        words: Array.isArray(words) ? words : [],
        questions: Array.isArray(questions) && questions.length ? questions : undefined,
        is_public: isPublic,
        author_name: authorName || null,
        created_at: new Date().toISOString()
    }

    const all = await getCustomQuizzes(userId)
    all.unshift(quiz)
    writeJson(CUSTOM_QUIZZES_KEY, all)

    if (isCloudActive()) {
        await writeDriveFile(CUSTOM_QUIZZES_FILE, all)
    }

    return quiz
}

export async function deleteCustomQuiz(quizId: string) {
    const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    writeJson(CUSTOM_QUIZZES_KEY, all.filter(q => q.id !== quizId))

    if (isCloudActive()) {
        const remote = (await readDriveFile<any[]>(CUSTOM_QUIZZES_FILE)) || []
        await writeDriveFile(CUSTOM_QUIZZES_FILE, remote.filter(q => q.id !== quizId))
    }
}

// ---------------------------------------------------------------------------
// Daily stats / streak
// ---------------------------------------------------------------------------

export async function updateDailyStats(userId: string, stats: {
    wordsLearned?: number
    wordsDrilled?: number
    wordsExamined?: number
    mistakesCount?: number
    accuracy?: number
}) {
    const today = new Date().toISOString().split('T')[0]
    const next = {
        user_id: userId,
        date: today,
        words_learned: stats.wordsLearned || 0,
        words_drilled: stats.wordsDrilled || 0,
        words_examined: stats.wordsExamined || 0,
        mistakes_count: stats.mistakesCount || 0,
        accuracy: stats.accuracy || 0,
        updated_at: new Date().toISOString()
    }

    const all = readJson<Record<string, any>>(DAILY_STATS_KEY, {})
    all[`${userId}:${today}`] = next
    writeJson(DAILY_STATS_KEY, all)

    if (isCloudActive()) {
        const remote = (await readDriveFile<Record<string, any>>(DAILY_STATS_FILE)) || {}
        remote[`${userId}:${today}`] = next
        await writeDriveFile(DAILY_STATS_FILE, remote)
    }
}

export async function getDailyStats(userId: string, date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0]

    if (isCloudActive()) {
        const remote = await readDriveFile<Record<string, any>>(DAILY_STATS_FILE)
        if (remote?.[`${userId}:${targetDate}`]) return remote[`${userId}:${targetDate}`]
    }

    const all = readJson<Record<string, any>>(DAILY_STATS_KEY, {})
    return all[`${userId}:${targetDate}`] || null
}

export async function getStreak(userId: string): Promise<number> {
    let dates: string[] = []

    if (isCloudActive()) {
        const remote = await readDriveFile<Record<string, any>>(DAILY_STATS_FILE)
        if (remote) {
            dates = Object.values(remote)
                .filter(d => d?.user_id === userId && d.date)
                .map(d => d.date)
                .sort()
                .reverse()
        }
    }

    if (dates.length === 0) {
        const all = readJson<Record<string, any>>(DAILY_STATS_KEY, {})
        dates = Object.values(all)
            .filter(d => d?.user_id === userId && d.date)
            .map(d => d.date)
            .sort()
            .reverse()
    }

    if (dates.length === 0) {
        // Fall back to activity dates derived from word progress.
        const progress = await getWordProgress(userId)
        if (!progress || Object.keys(progress).length === 0) return 0
        const activeDates = new Set<string>()
        for (const p of Object.values(progress)) {
            if (!p.lastSeen) continue
            activeDates.add(new Date(p.lastSeen).toISOString().split('T')[0])
        }
        dates = Array.from(activeDates).sort().reverse()
    }

    if (dates.length === 0) return 0

    let streak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i < dates.length; i++) {
        const statDate = new Date(dates[i])
        statDate.setHours(0, 0, 0, 0)

        const expectedDate = new Date(today)
        expectedDate.setDate(today.getDate() - i)
        expectedDate.setHours(0, 0, 0, 0)

        if (statDate.getTime() === expectedDate.getTime()) {
            streak++
        } else {
            break
        }
    }

    return streak
}

// ---------------------------------------------------------------------------
// Folders (organize quizzes)
// ---------------------------------------------------------------------------

export async function getFolders(): Promise<Folder[]> {
    const local = readJson<Folder[]>(FOLDERS_KEY, [])

    if (isCloudActive()) {
        const remote = await readDriveFile<Folder[]>(FOLDERS_FILE)
        if (remote) return remote
    }

    return local
}

export async function createFolder(userId: string, name: string): Promise<Folder> {
    const folder: Folder = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        user_id: userId,
        name: name.trim(),
        quiz_ids: [],
        created_at: new Date().toISOString()
    }

    const all = await getFolders()
    all.push(folder)
    writeJson(FOLDERS_KEY, all)

    if (isCloudActive()) {
        await writeDriveFile(FOLDERS_FILE, all)
    }

    return folder
}

export async function renameFolder(folderId: string, name: string) {
    const all = readJson<Folder[]>(FOLDERS_KEY, []).map(f =>
        f.id === folderId ? { ...f, name: name.trim() } : f
    )
    writeJson(FOLDERS_KEY, all)

    if (isCloudActive()) {
        const remote = (await readDriveFile<Folder[]>(FOLDERS_FILE)) || []
        await writeDriveFile(FOLDERS_FILE, remote.map(f =>
            f.id === folderId ? { ...f, name: name.trim() } : f
        ))
    }
}

export async function deleteFolder(folderId: string) {
    const all = readJson<Folder[]>(FOLDERS_KEY, []).filter(f => f.id !== folderId)
    writeJson(FOLDERS_KEY, all)

    if (isCloudActive()) {
        const remote = (await readDriveFile<Folder[]>(FOLDERS_FILE)) || []
        await writeDriveFile(FOLDERS_FILE, remote.filter(f => f.id !== folderId))
    }
}

export async function setQuizInFolder(folderId: string | null, quizId: string) {
    const all = readJson<Folder[]>(FOLDERS_KEY, []).map(f => {
        const has = f.quiz_ids.includes(quizId)
        if (f.id === folderId && !has) return { ...f, quiz_ids: [...f.quiz_ids, quizId] }
        if (f.id !== folderId && has) return { ...f, quiz_ids: f.quiz_ids.filter(id => id !== quizId) }
        return f
    })
    writeJson(FOLDERS_KEY, all)

    if (isCloudActive()) {
        const remote = (await readDriveFile<Folder[]>(FOLDERS_FILE)) || []
        await writeDriveFile(FOLDERS_FILE, remote.map(f => {
            const has = f.quiz_ids.includes(quizId)
            if (f.id === folderId && !has) return { ...f, quiz_ids: [...f.quiz_ids, quizId] }
            if (f.id !== folderId && has) return { ...f, quiz_ids: f.quiz_ids.filter(id => id !== quizId) }
            return f
        }))
    }
}

// ---------------------------------------------------------------------------
// Per-quiz study stats and history
// ---------------------------------------------------------------------------

export async function getQuizStats(quizId: string): Promise<QuizStats | null> {
    const local = readJson<Record<string, QuizStats>>(QUIZ_STATS_KEY, {})

    if (isCloudActive()) {
        const remote = await readDriveFile<Record<string, QuizStats>>(QUIZ_STATS_FILE)
        if (remote?.[quizId]) return remote[quizId]
    }

    return local[quizId] || null
}

export async function recordQuizSession(
    quizId: string,
    quizName: string,
    result: { correct: number; total: number; seconds?: number }
): Promise<void> {
    if (quizId === 'guest' || !result.total) return

    const now = new Date().toISOString()
    const all = readJson<Record<string, QuizStats>>(QUIZ_STATS_KEY, {})
    const accuracy = Math.round((result.correct / result.total) * 100)

    // A new device may have an empty local cache while Drive already has
    // history. Read both sides before building the replacement record.
    const remote = isCloudActive()
        ? ((await readDriveFile<Record<string, QuizStats>>(QUIZ_STATS_FILE)) || {})
        : {}
    const localExisting = all[quizId]
    const remoteExisting = remote[quizId]
    const existing = localExisting || remoteExisting
    const priorHistory = [...(localExisting?.history || []), ...(remoteExisting?.history || [])]
        .filter((entry, index, entries) => entries.findIndex(other => other.date === entry.date && other.correct === entry.correct && other.total === entry.total) === index)
        .sort((a, b) => a.date.localeCompare(b.date))

    const stats: QuizStats = {
        plays: Math.max(localExisting?.plays || 0, remoteExisting?.plays || 0) + 1,
        bestCorrect: Math.max(localExisting?.bestCorrect || 0, remoteExisting?.bestCorrect || 0, result.correct),
        bestAccuracy: Math.max(localExisting?.bestAccuracy || 0, remoteExisting?.bestAccuracy || 0, accuracy),
        lastStudied: now,
        quizName,
        history: [
            ...priorHistory,
            {
                date: now,
                correct: result.correct,
                total: result.total,
                seconds: result.seconds
            }
        ].slice(-30)
    }

    all[quizId] = stats
    writeJson(QUIZ_STATS_KEY, all)

    if (isCloudActive()) {
        remote[quizId] = stats
        await writeDriveFile(QUIZ_STATS_FILE, remote)
    }
}

export async function getRecentActivity(limit = 10): Promise<{ quizId: string; quizName: string; correct: number; total: number; seconds?: number; date: string }[]> {
    const all = readJson<Record<string, QuizStats>>(QUIZ_STATS_KEY, {})
    if (!Object.keys(all).length && isCloudActive()) {
        const remote = await readDriveFile<Record<string, QuizStats>>(QUIZ_STATS_FILE)
        if (remote) {
            const merged = { ...all, ...remote }
            return flattenActivity(merged).slice(0, limit)
        }
    }
    return flattenActivity(all).slice(0, limit)
}

function flattenActivity(all: Record<string, QuizStats>) {
    const entries: { quizId: string; quizName: string; correct: number; total: number; seconds?: number; date: string }[] = []
    for (const [quizId, stats] of Object.entries(all)) {
        for (const h of stats.history || []) {
            entries.push({ quizId, quizName: stats.quizName, correct: h.correct, total: h.total, seconds: h.seconds, date: h.date })
        }
    }
    return entries.sort((a, b) => b.date.localeCompare(a.date))
}

// ---------------------------------------------------------------------------
// One-time migration of guest (localStorage) data into the user's Drive
// account. Called after a successful sign-in. Drive always wins on conflict.
// ---------------------------------------------------------------------------

export async function syncLocalToCloud(): Promise<boolean> {
    if (!isCloudActive()) return false
    if (typeof window === 'undefined') return false

    const currentUserId = getDriveUser()?.id
    const localQuizzes = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
        .filter(q => q.user_id === 'guest' || q.user_id === currentUserId)
    const localProgress = readJson<Record<string, WordProgress>>(PROGRESS_KEY, {})
    const localStats = readJson<Record<string, any>>(DAILY_STATS_KEY, {})

    try {
        // Quizzes: merge non-duplicates, Drive wins by id.
        const remoteQuizzes = (await readDriveFile<any[]>(CUSTOM_QUIZZES_FILE)) || []
        const remoteIds = new Set(remoteQuizzes.map(q => q.id))
        const mergedQuizzes = [...remoteQuizzes, ...localQuizzes.filter(q => !remoteIds.has(q.id))]
        if (remoteQuizzes.length || localQuizzes.length) {
            await writeDriveFile(CUSTOM_QUIZZES_FILE, mergedQuizzes)
        }

        // Progress: Drive wins per word.
        const remoteProgress = (await readDriveFile<Record<string, WordProgress>>(PROGRESS_FILE)) || {}
        const mergedProgress = { ...localProgress, ...remoteProgress }
        if (Object.keys(localProgress).length || Object.keys(remoteProgress).length) {
            await writeDriveFile(PROGRESS_FILE, mergedProgress)
        }

        // Stats: Drive wins per user/date key.
        const remoteStats = (await readDriveFile<Record<string, any>>(DAILY_STATS_FILE)) || {}
        const mergedStats = { ...localStats, ...remoteStats }
        if (Object.keys(localStats).length || Object.keys(remoteStats).length) {
            await writeDriveFile(DAILY_STATS_FILE, mergedStats)
        }

        // Folders: Drive wins by id.
        const localFolders = readJson<Folder[]>(FOLDERS_KEY, [])
            .filter(f => f.user_id === 'guest' || f.user_id === currentUserId)
        const remoteFolders = (await readDriveFile<Folder[]>(FOLDERS_FILE)) || []
        const remoteFolderIds = new Set(remoteFolders.map(f => f.id))
        const mergedFolders = [...remoteFolders, ...localFolders.filter(f => !remoteFolderIds.has(f.id))]
        if (remoteFolders.length || localFolders.length) {
            await writeDriveFile(FOLDERS_FILE, mergedFolders)
        }

        // Quiz stats: Drive wins per quiz id.
        const localQuizStats = readJson<Record<string, QuizStats>>(QUIZ_STATS_KEY, {})
        const remoteQuizStats = (await readDriveFile<Record<string, QuizStats>>(QUIZ_STATS_FILE)) || {}
        const mergedQuizStats = { ...localQuizStats, ...remoteQuizStats }
        if (Object.keys(localQuizStats).length || Object.keys(remoteQuizStats).length) {
            await writeDriveFile(QUIZ_STATS_FILE, mergedQuizStats)
        }

        return true
    } catch (error) {
        console.error('Local->Drive sync failed (local data preserved):', error)
        return false
    }
}
