import { WordProgress, QuizQuestion, SimulationStep, Word, Folder, QuizStats, CustomQuiz } from './satTypes'
import { assetPath } from './paths'
import { isDriveConfigured, readDriveFile as readRemoteFile, writeDriveFile as writeRemoteFile, getDriveUser } from './drive'
import { readAccountData, writeAccountData, currentAccountId, assertAccount, setSyncMessage } from './storage'

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
const DELETED_IDS_KEY = 'oquiz:deleted_ids'

const MAX_HISTORY_ENTRIES = 200

const PROGRESS_FILE = 'progress.json'
const CUSTOM_QUIZZES_FILE = 'custom_quizzes.json'
const DAILY_STATS_FILE = 'daily_stats.json'
const FOLDERS_FILE = 'folders.json'
const QUIZ_STATS_FILE = 'quiz_stats.json'

const MANIFEST_PATH = '/sat/quiz-sets.json'

// Drive owns token refresh. Keep attempting sync for signed-in accounts even
// after token expiry, so failures are visible instead of silently becoming local-only.
function isCloudActive(): boolean {
    return isDriveConfigured() && typeof window !== 'undefined' && Boolean(getDriveUser())
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function readJson<T>(key: string, fallback: T): T {
    return readAccountData(key, fallback)
}

function writeJson(key: string, value: unknown) {
    writeAccountData(key, value)
}

async function readDriveFile<T>(name: string): Promise<T | null> {
    const owner = currentAccountId()
    try {
        const value = await readRemoteFile<T>(name)
        assertAccount(owner)
        return value
    } catch (error) {
        setSyncMessage('Cloud sync failed. Your local data is available; reconnect and retry.', owner)
        throw error
    }
}

async function writeDriveFile(name: string, value: unknown): Promise<void> {
    const owner = currentAccountId()
    if (!await writeRemoteFile(name, value)) {
        setSyncMessage('Saved in this browser. Cloud sync failed; reconnect and retry.', owner)
        throw new Error('Saved locally, but cloud sync failed. Retry sync from Profile.')
    }
    assertAccount(owner)
}

// A failed read must never be mistaken for a missing remote file by writers.
// Only display reads may fall back to the account's local snapshot.
async function readForDisplay<T>(name: string): Promise<T | null> {
    const owner = currentAccountId()
    try { return await readDriveFile<T>(name) }
    catch { assertAccount(owner); return null }
}

export function localDate(date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Serialize read-modify-write cycles per storage key so overlapping saves
// (rapid answers, streak updates) can't clobber each other's updates.
const localWriteQueues = new Map<string, Promise<unknown>>()

function queueLocalWrite<T>(key: string, fn: () => T | Promise<T>): Promise<T> {
    const owner = currentAccountId()
    // Serialize the entire read/merge/write operation, including migration.
    const queueKey = owner
    const prev = localWriteQueues.get(queueKey) || Promise.resolve()
    const next = prev.catch(() => {}).then(() => { assertAccount(owner); return fn() })
    localWriteQueues.set(queueKey, next)
    return next
}

function withoutDeleted<T extends { id: string }>(kind: 'quizzes' | 'folders', items: T[]): T[] {
    const deleted = readJson<Record<string, string[]>>(DELETED_IDS_KEY, {})[kind] || []
    return items.filter(item => !deleted.includes(item.id))
}

function markDeleted(kind: 'quizzes' | 'folders', id: string) {
    const deleted = readJson<Record<string, string[]>>(DELETED_IDS_KEY, {})
    deleted[kind] = Array.from(new Set([...(deleted[kind] || []), id]))
    writeJson(DELETED_IDS_KEY, deleted)
}

// Parse a boolean-ish value from imported JSON (`true`/`false`, `t`/`f`,
// `yes`/`no`, `1`/`0`, or an actual boolean).
function parseTrueFalse(value: unknown): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    return /^(true|t|yes|y|1)$/i.test(String(value ?? '').trim())
}

// ---------------------------------------------------------------------------
// Word progress
// ---------------------------------------------------------------------------
//
// Progress is stored as a nested map: { [userId]: { [word]: WordProgress } }.
// Older builds stored a flat { [word]: WordProgress } map; on first read we
// detect and migrate that into the "guest" bucket so nothing is lost.

type ProgressMap = Record<string, WordProgress>
type ProgressStore = Record<string, ProgressMap>

function mergeProgress(local: ProgressMap, remote: ProgressMap): ProgressMap {
    const merged = { ...remote }
    for (const [key, value] of Object.entries(local)) {
        if (!merged[key] || (value.lastSeen || 0) >= (merged[key].lastSeen || 0)) merged[key] = value
    }
    return merged
}

// Newer builds persist progress under scoped keys (`${quizPath}::${questionId}`,
// e.g. `/sat/1.json::q1`) while older builds used the bare question id (`q1`).
// A question that only exists under a bare key would otherwise be invisible to
// scoped reads. Adopt each bare entry into its scoped key on read and drop the
// bare key so the migration runs once and the next write cannot recreate it.
function migrateScopedKeys(bucket: ProgressMap): ProgressMap {
    // Map each bare key to the single scoped key that owns it. When two scoped
    // keys share the same bare id (a question id reused across quizzes), the
    // mapping is ambiguous — leave the bare entry untouched rather than guess.
    const owners = new Map<string, string>()
    const ambiguous = new Set<string>()
    for (const scopedKey of Object.keys(bucket)) {
        const sep = scopedKey.lastIndexOf('::')
        if (sep < 0) continue
        const bareKey = scopedKey.slice(sep + 2)
        if (!bareKey) continue
        if (owners.has(bareKey)) ambiguous.add(bareKey)
        else owners.set(bareKey, scopedKey)
    }

    let changed = false
    const migrated: ProgressMap = { ...bucket }
    owners.forEach((scopedKey, bareKey) => {
        if (ambiguous.has(bareKey)) return
        const bareEntry = migrated[bareKey]
        const scopedEntry = migrated[scopedKey]
        if (!bareEntry || typeof bareEntry !== 'object' || Array.isArray(bareEntry)) return
        // The newer record wins field-by-field so a card mastered under the old
        // build is not overwritten by a fresh "new" answer written under the
        // scoped key (and vice-versa); fields unique to the older record survive.
        const scopedNewer = scopedEntry && (scopedEntry.lastSeen || 0) >= (bareEntry.lastSeen || 0)
        migrated[scopedKey] = scopedNewer ? { ...bareEntry, ...scopedEntry } : { ...scopedEntry, ...bareEntry }
        delete migrated[bareKey]
        changed = true
    })
    return changed ? migrated : bucket
}

function mergeQuizStats(local: Record<string, QuizStats>, remote: Record<string, QuizStats>) {
    const merged = { ...remote }
    for (const [key, value] of Object.entries(local)) {
        const other = remote[key]
        if (!other) { merged[key] = value; continue }
        const history = [...(other.history || []), ...(value.history || [])]
            .filter((entry, i, entries) => entries.findIndex(e => e.id && entry.id ? e.id === entry.id : e.date === entry.date && e.correct === entry.correct && e.total === entry.total) === i)
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-MAX_HISTORY_ENTRIES)
        merged[key] = {
            ...(value.lastStudied >= other.lastStudied ? value : other), history,
            plays: Math.max(value.plays, other.plays, history.length),
            bestCorrect: Math.max(value.bestCorrect, other.bestCorrect),
            bestAccuracy: Math.max(value.bestAccuracy, other.bestAccuracy),
        }
    }
    return merged
}

function readProgressStore(): ProgressStore {
    const raw = readJson<any>(PROGRESS_KEY, {})
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

    const values = Object.values(raw) as any[]
    const isFlat = values.some(v => v && typeof v === 'object' && typeof v.word === 'string')
    if (isFlat) {
        const store: ProgressStore = { guest: migrateScopedKeys(raw as ProgressMap) }
        try { writeJson(PROGRESS_KEY, store) } catch { /* ignore */ }
        return store
    }

    const store: ProgressStore = {}
    let changed = false
    for (const [key, value] of Object.entries(raw)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const migrated = migrateScopedKeys(value as ProgressMap)
            store[key] = migrated
            if (migrated !== value) changed = true
        }
    }
    if (changed) {
        try { writeJson(PROGRESS_KEY, store) } catch { /* ignore */ }
    }
    return store
}

export async function getWordProgress(userId: string): Promise<Record<string, WordProgress>> {
    if (userId !== currentAccountId()) return {}
    const store = readProgressStore()
    const local = store[userId] ?? {}

    if (isCloudActive()) {
        const remote = await readForDisplay<Record<string, WordProgress>>(PROGRESS_FILE)
        if (remote) return mergeProgress(local, remote)
    }

    return local
}

export async function saveWordProgress(userId: string, word: string, progress: WordProgress) {
    assertAccount(userId)
    return queueLocalWrite(PROGRESS_KEY, async () => {
        const store = readProgressStore()
        const bucket = store[userId] ?? {}
        bucket[word] = progress
        store[userId] = bucket
        writeJson(PROGRESS_KEY, store)

        if (isCloudActive()) {
            try {
                const remote = (await readDriveFile<Record<string, WordProgress>>(PROGRESS_FILE)) || {}
                remote[word] = progress
                await writeDriveFile(PROGRESS_FILE, remote)
            } catch { /* Local save succeeded; SyncNotice provides cloud retry. */ }
        }
    })
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
    if (userId !== currentAccountId()) return []
    const local = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
        .filter(q => q.user_id === userId)

    if (isCloudActive()) {
        const remote = await readForDisplay<any[]>(CUSTOM_QUIZZES_FILE)
        if (remote) return withoutDeleted('quizzes', [...local, ...remote.filter(q => !local.some(l => l.id === q.id))])
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
    if (!withoutDeleted('quizzes', [{ id: quizId }]).length) return null
    const local = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
        .find(q => q.id === quizId) || null

    if (isCloudActive()) {
        const remote = await readForDisplay<any[]>(CUSTOM_QUIZZES_FILE)
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

    // A vocabulary entry carries a `word` (or `ru`) and no explicit generic
    // question fields. Generic questions may optionally carry a display `word`
    // (see QuizQuestion.word), so explicit generic fields (kind/prompt/options/
    // answer/...) take precedence over the vocabulary shape.
    const isGeneric = (it: any) => it && typeof it === 'object' && (
        it.kind !== undefined || it.prompt !== undefined || it.question !== undefined || it.q !== undefined ||
        it.options !== undefined || it.answer !== undefined || it.correctAnswer !== undefined || it.correctIndex !== undefined
    )
    const isWord = (it: any) => it && typeof it === 'object' && !isGeneric(it) && ('word' in it || 'ru' in it)
    const looksLikeWords = items.every(isWord)

    // Study consumers choose words OR questions. Represent mixed input as
    // questions, preserving vocabulary definitions instead of silently dropping them.
    if (!looksLikeWords && items.some(isWord)) {
        const converted = items.map((it, index) => {
            if (!isWord(it)) return it
            const result = normalizeImportedQuizItems([it])
            if (result.errors.length) return it
            const word = result.words[0]
            return { id: it.id || `vocab-${index}-${word.word}`, kind: 'flashcard', prompt: word.word,
                answer: word.ru, image: word.image,
                explanation: [...word.simple_examples, word.advanced_example].filter(Boolean).join('\n') }
        })
        // Invalid vocabulary entries remain errors below, never a partial success.
        if (converted.some(isWord)) return { words: [], questions: [], errors: ['A vocabulary item is missing a word or definition.'] }
        return normalizeImportedQuizItems(converted)
    }

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

    const makeId = (it: any, i: number) => {
        if (it?.id) return String(it.id)
        let hash = 2166136261
        for (const c of JSON.stringify(it)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619)
        return `q-${i}-${(hash >>> 0).toString(36)}`
    }

    // Imported quizzes may reuse ids; ensure question ids stay unique so
    // progress/history keys never collide.
    const seenIds = new Set<string>()
    const uniqueId = (base: string): string => {
        let id = base
        let n = 1
        while (seenIds.has(id)) {
            id = `${base}-${n}`
            n += 1
        }
        seenIds.add(id)
        return id
    }

    const stripPrefix = (opt: unknown): string =>
        String(opt ?? '')
            .trim()
            .replace(/^(?:[A-Ea-e][.)\-:]|\d+[.)\-:])\s+/, '')
            .trim()

    const displayWord = (it: any): string | undefined =>
        it && typeof it.word === 'string' && it.word.trim() ? it.word.trim() : undefined

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
            if (!Array.isArray(it.steps) || !it.steps.length) {
                errors.push(`Item ${i + 1}: simulation requires at least one step`)
                return
            }
            const steps: SimulationStep[] = []
            for (let si = 0; si < it.steps.length; si++) {
                const s = it.steps[si]
                const title = String(s?.title ?? '').trim()
                if (!title) {
                    errors.push(`Item ${i + 1}, step ${si + 1}: missing a title`)
                    return
                }
                const kind = (s?.kind === 'choice' || s?.kind === 'checkbox' || s?.kind === 'config' || s?.kind === 'placement') ? s.kind : 'choice'
                if (kind === 'choice') {
                    const options = Array.isArray(s?.options) ? s.options.map(String) : []
                    if (options.length < 2) {
                        errors.push(`Item ${i + 1}, step ${si + 1}: choice requires at least two options`)
                        return
                    }
                    const correctIndex = Number.isInteger(s?.correctIndex) ? s.correctIndex : -1
                    if (correctIndex < 0 || correctIndex >= options.length) {
                        errors.push(`Item ${i + 1}, step ${si + 1}: invalid correctIndex`)
                        return
                    }
                    const step: SimulationStep = {
                        id: s?.id || `step-${makeId(it, i)}-${si}`,
                        kind: 'choice',
                        title,
                        explanation: s?.explanation ? String(s.explanation) : '',
                        options,
                        correctIndex
                    }
                    if (s?.image) step.image = String(s.image)
                    steps.push(step)
                } else if (kind === 'checkbox' || kind === 'config') {
                    const rawItems = kind === 'checkbox' ? s?.items : s?.config
                    if (!Array.isArray(rawItems) || !rawItems.length) {
                        errors.push(`Item ${i + 1}, step ${si + 1}: ${kind} requires at least one item`)
                        return
                    }
                    const items = rawItems.map((it2: any, ix: number) => ({
                        id: it2?.id || `it-${makeId(it, i)}-${ix}`,
                        label: String(it2?.label ?? '').trim(),
                        correct: !!it2?.correct
                    }))
                    if (items.some(item => !item.label)) {
                        errors.push(`Item ${i + 1}, step ${si + 1}: ${kind} items must have a non-empty label`)
                        return
                    }
                    const step: SimulationStep = {
                        id: s?.id || `step-${makeId(it, i)}-${si}`,
                        kind,
                        title,
                        explanation: s?.explanation ? String(s.explanation) : ''
                    }
                    if (kind === 'checkbox') step.items = items
                    else step.config = items
                    if (s?.image) step.image = String(s.image)
                    steps.push(step)
                } else {
                    const itemsToPlace = Array.isArray(s?.itemsToPlace) ? s.itemsToPlace.map(String) : []
                    const slots = Array.isArray(s?.slots) ? s.slots.map(String) : []
                    const correctMapping: number[] = Array.isArray(s?.correctMapping) ? s.correctMapping.map(Number) : []
                    if (!itemsToPlace.length) {
                        errors.push(`Item ${i + 1}, step ${si + 1}: placement requires itemsToPlace`)
                        return
                    }
                    if (!slots.length) {
                        errors.push(`Item ${i + 1}, step ${si + 1}: placement requires slots`)
                        return
                    }
                    if (correctMapping.length !== itemsToPlace.length || !correctMapping.every(m => Number.isInteger(m) && m >= 0 && m < slots.length)) {
                        errors.push(`Item ${i + 1}, step ${si + 1}: placement correctMapping must map each item to a slot`)
                        return
                    }
                    const step: SimulationStep = {
                        id: s?.id || `step-${makeId(it, i)}-${si}`,
                        kind: 'placement',
                        title,
                        explanation: s?.explanation ? String(s.explanation) : '',
                        itemsToPlace,
                        slots,
                        correctMapping
                    }
                    if (s?.image) step.image = String(s.image)
                    steps.push(step)
                }
            }
            const q: QuizQuestion = {
                id: uniqueId(makeId(it, i)),
                kind: 'simulation',
                prompt,
                steps,
                explanation: it.explanation ? String(it.explanation) : ''
            }
            const dw = displayWord(it)
            if (dw) q.word = dw
            if (it.image) q.image = String(it.image)
            questions.push(q)
            return
        }

        const options = Array.isArray(it.options)
            ? it.options.map(stripPrefix)
            : []

        if (Array.isArray(it.options) && (options.length < 2 || options.some((option: string) => !option))) {
            errors.push(`Item ${i + 1}: multiple-choice options must contain at least two non-empty answers`)
            return
        }

        if (options.length >= 2) {
            let correctIndex = -1
            if (Number.isInteger(it.correctIndex) && it.correctIndex >= 0 && it.correctIndex < options.length) {
                correctIndex = it.correctIndex
            } else if (it.answer != null) {
                const ans = String(it.answer).trim()
                const letterIdx = ans.length === 1 ? ans.toUpperCase().charCodeAt(0) - 65 : -1
                if (letterIdx >= 0 && letterIdx < options.length) {
                    correctIndex = letterIdx
                } else {
                    const match = options.findIndex((o: string) => o.toLowerCase() === ans.toLowerCase() || stripPrefix(ans).toLowerCase() === o.toLowerCase())
                    correctIndex = match
                }
            }
            if (correctIndex < 0) {
                errors.push(`Item ${i + 1}: missing or invalid correct answer`)
                return
            }
            const q: QuizQuestion = {
                id: uniqueId(makeId(it, i)),
                kind: 'multiple_choice',
                prompt,
                options,
                correctIndex,
                explanation: it.explanation ? String(it.explanation) : ''
            }
            const dw = displayWord(it)
            if (dw) q.word = dw
            if (it.image) q.image = String(it.image)
            questions.push(q)
        } else if (
            it.kind === 'true_false' ||
            typeof it.answer === 'boolean' ||
            typeof it.correctAnswer === 'boolean' ||
            /^(true|false|t|f)$/i.test(String(it.answer ?? '').trim()) ||
            /^(true|false|t|f)$/i.test(String(it.correctAnswer ?? '').trim())
        ) {
            const rawAnswer = it.correctAnswer !== undefined && it.correctAnswer !== null ? it.correctAnswer : it.answer
            const q: QuizQuestion = {
                id: uniqueId(makeId(it, i)),
                kind: 'true_false',
                prompt,
                correctAnswer: parseTrueFalse(rawAnswer),
                explanation: it.explanation ? String(it.explanation) : ''
            }
            const dw = displayWord(it)
            if (dw) q.word = dw
            if (it.image) q.image = String(it.image)
            questions.push(q)
        } else {
            const answer = String(it.answer ?? it.correct_answer ?? '').trim()
            if (!answer) {
                errors.push(`Item ${i + 1}: flashcard answer is required`)
                return
            }
            const q: QuizQuestion = {
                id: uniqueId(makeId(it, i)),
                kind: 'flashcard',
                prompt,
                answer,
                explanation: it.explanation ? String(it.explanation) : ''
            }
            const dw = displayWord(it)
            if (dw) q.word = dw
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

/**
 * Builds a standalone test from existing custom quizzes without modifying the
 * originals. Vocabulary items become flashcards so mixed quiz types can live
 * together in one assessment.
 */
export function combineCustomQuizQuestions(quizzes: CustomQuiz[], limit = 0): QuizQuestion[] {
    const groups = quizzes.map((quiz, quizIndex) => {
        const questionItems = (quiz.questions || []).map((question, itemIndex) => ({
            ...question,
            id: `combined-${quiz.id}-${quizIndex}-q-${itemIndex}`
        }))
        const vocabularyItems = (quiz.words || []).filter(word => word.word?.trim() && word.ru?.trim()).map((word, itemIndex): QuizQuestion => ({
            id: `combined-${quiz.id}-${quizIndex}-w-${itemIndex}`,
            kind: 'flashcard',
            prompt: word.word.trim(),
            answer: word.ru.trim(),
            word: word.word.trim()
        }))
        return [...questionItems, ...vocabularyItems]
    })
    const combined = groups.flat()
    if (!limit || limit >= combined.length) return combined
    // Round-robin selection keeps a shorter unit test representative of every
    // selected source instead of taking all of its first questions from one quiz.
    const result: QuizQuestion[] = []
    for (let itemIndex = 0; result.length < limit; itemIndex += 1) {
        let added = false
        for (const group of groups) {
            if (result.length >= limit) break
            if (group[itemIndex]) { result.push(group[itemIndex]); added = true }
        }
        if (!added) break
    }
    return result
}

export async function createCustomQuiz(
    userId: string,
    name: string,
    description: string,
    words: any[],
    isPublic: boolean = false,
    authorName?: string,
    questions?: QuizQuestion[],
    tags: string[] = [],
    aiSourcePrompt?: string
) {
    return queueLocalWrite('createCustomQuiz', async () => {
        assertAccount(userId)
        const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

        const quiz = {
            id,
            user_id: userId,
            name,
            description,
            tags: Array.isArray(tags) ? tags : [],
            words: Array.isArray(words) ? words : [],
            questions: Array.isArray(questions) && questions.length ? questions : undefined,
            ai_source_prompt: aiSourcePrompt?.trim() || undefined,
            is_public: isPublic,
            author_name: authorName || null,
            created_at: new Date().toISOString()
        }

        const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
        all.unshift(quiz)
        writeJson(CUSTOM_QUIZZES_KEY, all)

        if (isCloudActive()) {
            try {
                const remote = (await readDriveFile<any[]>(CUSTOM_QUIZZES_FILE)) || []
                remote.unshift(quiz)
                await writeDriveFile(CUSTOM_QUIZZES_FILE, remote)
            } catch { /* Local save succeeded; SyncNotice provides cloud retry. */ }
        }

        return quiz
    })
}

export async function updateCustomQuiz(
    quizId: string,
    changes: Pick<CustomQuiz, 'name' | 'description' | 'tags' | 'words' | 'questions' | 'is_public' | 'ai_source_prompt'>
): Promise<CustomQuiz> {
    return queueLocalWrite('updateCustomQuiz', async () => {
        const all = readJson<CustomQuiz[]>(CUSTOM_QUIZZES_KEY, [])
        const index = all.findIndex(quiz => quiz.id === quizId)
        if (index < 0) throw new Error('Quiz not found')
        if (all[index].user_id !== currentAccountId()) throw new Error('You can only edit your own quizzes')

        const name = String(changes.name || '').trim()
        if (!name) throw new Error('Quiz name is required')
        const updated: CustomQuiz = {
            ...all[index],
            name,
            description: String(changes.description || '').trim(),
            tags: Array.from(new Set((changes.tags || []).map(tag => String(tag).trim()).filter(Boolean))),
            words: Array.isArray(changes.words) ? changes.words : [],
            questions: Array.isArray(changes.questions) && changes.questions.length ? changes.questions : undefined,
            ai_source_prompt: String(changes.ai_source_prompt || '').trim() || undefined,
            is_public: Boolean(changes.is_public)
        }
        all[index] = updated
        writeJson(CUSTOM_QUIZZES_KEY, all)

        if (isCloudActive()) {
            try {
                const remote = (await readDriveFile<CustomQuiz[]>(CUSTOM_QUIZZES_FILE)) || []
                const remoteIndex = remote.findIndex(quiz => quiz.id === quizId)
                if (remoteIndex >= 0) remote[remoteIndex] = updated
                else remote.unshift(updated)
                await writeDriveFile(CUSTOM_QUIZZES_FILE, remote)
            } catch { /* Local save succeeded; SyncNotice provides cloud retry. */ }
        }
        return updated
    })
}

export async function deleteCustomQuiz(quizId: string) {
    return queueLocalWrite('deleteCustomQuiz', async () => {
        markDeleted('quizzes', quizId)
        const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
        writeJson(CUSTOM_QUIZZES_KEY, all.filter(q => q.id !== quizId))

        if (isCloudActive()) {
            try {
                const remote = (await readDriveFile<any[]>(CUSTOM_QUIZZES_FILE)) || []
                await writeDriveFile(CUSTOM_QUIZZES_FILE, remote.filter(q => q.id !== quizId))
            } catch { /* Local save succeeded; SyncNotice provides cloud retry. */ }
        }
    })
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
    return queueLocalWrite(DAILY_STATS_KEY, async () => {
        assertAccount(userId)
        const today = localDate()
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
            try {
                const remote = (await readDriveFile<Record<string, any>>(DAILY_STATS_FILE)) || {}
                remote[`${userId}:${today}`] = next
                await writeDriveFile(DAILY_STATS_FILE, remote)
            } catch { /* Local save succeeded; SyncNotice provides cloud retry. */ }
        }
    })
}

export async function getDailyStats(userId: string, date?: string) {
    if (userId !== currentAccountId()) return null
    const targetDate = date || localDate()
    const all = await getAllDailyStats()
    return all[`${userId}:${targetDate}`] || null
}

export async function getStreak(userId: string): Promise<number> {
    const analytics = await getStudyAnalytics(userId)
    const active = new Set(analytics.studyDays.filter(d => d.count > 0).map(d => d.date))
    const progress = await getWordProgress(userId)
    for (const p of Object.values(progress)) if (p.lastSeen) active.add(localDate(new Date(p.lastSeen)))
    const day = new Date()
    // Yesterday's streak remains alive until today's study opportunity ends.
    if (!active.has(localDate(day))) day.setDate(day.getDate() - 1)
    let streak = 0
    while (active.has(localDate(day))) {
        streak++
        day.setDate(day.getDate() - 1)
    }
    return streak
}

// ---------------------------------------------------------------------------
// Folders (organize quizzes)
// ---------------------------------------------------------------------------

export async function getFolders(): Promise<Folder[]> {
    const local = readJson<Folder[]>(FOLDERS_KEY, [])

    if (isCloudActive()) {
        const remote = await readForDisplay<Folder[]>(FOLDERS_FILE)
        if (remote) return withoutDeleted('folders', [...local, ...remote.filter(f => !local.some(l => l.id === f.id))])
    }

    return local
}

export async function createFolder(userId: string, name: string): Promise<Folder> {
    return queueLocalWrite('createFolder', async () => {
        assertAccount(userId)
    const folder: Folder = {
        id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `folder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        user_id: userId,
        name: name.trim(),
        quiz_ids: [],
        created_at: new Date().toISOString()
    }

    const all = readJson<Folder[]>(FOLDERS_KEY, [])
    all.push(folder)
    writeJson(FOLDERS_KEY, all)

    if (isCloudActive()) {
        try {
            const remote = await readDriveFile<Folder[]>(FOLDERS_FILE) || []
            await writeDriveFile(FOLDERS_FILE, [...all, ...remote.filter(f => !all.some(l => l.id === f.id))])
        } catch { /* Local save succeeded; SyncNotice provides cloud retry. */ }
    }

        return folder
    })
}

export async function renameFolder(folderId: string, name: string) {
    return queueLocalWrite('renameFolder', async () => {
        const all = readJson<Folder[]>(FOLDERS_KEY, []).map(f =>
            f.id === folderId ? { ...f, name: name.trim() } : f
        )
        writeJson(FOLDERS_KEY, all)

        if (isCloudActive()) {
            try {
                const remote = (await readDriveFile<Folder[]>(FOLDERS_FILE)) || []
                await writeDriveFile(FOLDERS_FILE, remote.map(f =>
                    f.id === folderId ? { ...f, name: name.trim() } : f
                ))
            } catch { /* Local save succeeded; SyncNotice provides cloud retry. */ }
        }
    })
}

export async function deleteFolder(folderId: string) {
    return queueLocalWrite('deleteFolder', async () => {
        markDeleted('folders', folderId)
        const all = readJson<Folder[]>(FOLDERS_KEY, []).filter(f => f.id !== folderId)
        writeJson(FOLDERS_KEY, all)

        if (isCloudActive()) {
            try {
                const remote = (await readDriveFile<Folder[]>(FOLDERS_FILE)) || []
                await writeDriveFile(FOLDERS_FILE, remote.filter(f => f.id !== folderId))
            } catch { /* Local save succeeded; SyncNotice provides cloud retry. */ }
        }
    })
}

export async function setQuizInFolder(folderId: string | null, quizId: string) {
    return queueLocalWrite('setQuizInFolder', async () => {
        const all = readJson<Folder[]>(FOLDERS_KEY, []).map(f => {
            const has = f.quiz_ids.includes(quizId)
            if (f.id === folderId && !has) return { ...f, quiz_ids: [...f.quiz_ids, quizId] }
            if (f.id !== folderId && has) return { ...f, quiz_ids: f.quiz_ids.filter(id => id !== quizId) }
            return f
        })
        writeJson(FOLDERS_KEY, all)

        if (isCloudActive()) {
            try {
                const remote = (await readDriveFile<Folder[]>(FOLDERS_FILE)) || []
                await writeDriveFile(FOLDERS_FILE, remote.map(f => {
                    const has = f.quiz_ids.includes(quizId)
                    if (f.id === folderId && !has) return { ...f, quiz_ids: [...f.quiz_ids, quizId] }
                    if (f.id !== folderId && has) return { ...f, quiz_ids: f.quiz_ids.filter(id => id !== quizId) }
                    return f
                }))
            } catch { /* Local save succeeded; SyncNotice provides cloud retry. */ }
        }
    })
}

// ---------------------------------------------------------------------------
// Per-quiz study stats and history
// ---------------------------------------------------------------------------

export async function getQuizStats(quizId: string): Promise<QuizStats | null> {
    const local = readJson<Record<string, QuizStats>>(QUIZ_STATS_KEY, {})

    if (isCloudActive()) {
        const remote = await readForDisplay<Record<string, QuizStats>>(QUIZ_STATS_FILE)
        if (remote?.[quizId]) return mergeQuizStats(local, remote)[quizId]
    }

    return local[quizId] || null
}

export async function recordQuizSession(
    quizId: string,
    quizName: string,
    result: { correct: number; total: number; seconds?: number; id?: string }
): Promise<void> {
    if (quizId === 'guest' || !result.total) return

    await queueLocalWrite(QUIZ_STATS_KEY, async () => {
        const now = new Date().toISOString()
        const all = readJson<Record<string, QuizStats>>(QUIZ_STATS_KEY, {})
        const accuracy = Math.round((result.correct / result.total) * 100)

        // Commit locally before attempting cloud reads so outages cannot lose a result.
        const localExisting = all[quizId]
        if (result.id && localExisting?.history.some(h => h.id === result.id)) return
        const priorHistory = localExisting?.history || []

        const stats: QuizStats = {
            plays: (localExisting?.plays || 0) + 1,
            bestCorrect: Math.max(localExisting?.bestCorrect || 0, result.correct),
            bestAccuracy: Math.max(localExisting?.bestAccuracy || 0, accuracy),
            lastStudied: now,
            quizName,
            history: [
                ...priorHistory,
                {
                    id: result.id || crypto.randomUUID(),
                    date: now,
                    correct: result.correct,
                    total: result.total,
                    seconds: result.seconds
                }
            ].slice(-MAX_HISTORY_ENTRIES)
        }

        all[quizId] = stats
        writeJson(QUIZ_STATS_KEY, all)

        if (isCloudActive()) {
            try {
                const cloud = (await readDriveFile<Record<string, QuizStats>>(QUIZ_STATS_FILE)) || {}
                const merged = mergeQuizStats(all, cloud)
                await writeDriveFile(QUIZ_STATS_FILE, merged)
                writeJson(QUIZ_STATS_KEY, merged)
            } catch { /* Already saved locally; the sync notice offers a retry. */ }
        }
    })
}

export async function getRecentActivity(limit = 10): Promise<{ quizId: string; quizName: string; correct: number; total: number; seconds?: number; date: string }[]> {
    const merged = await getAllQuizStats()
    return flattenActivity(merged).slice(0, limit)
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

async function getAllQuizStats(): Promise<Record<string, QuizStats>> {
    const local = readJson<Record<string, QuizStats>>(QUIZ_STATS_KEY, {})
    if (!isCloudActive()) return local
    const remote = await readForDisplay<Record<string, QuizStats>>(QUIZ_STATS_FILE)
    if (!remote) return local
    return mergeQuizStats(local, remote)
}

async function getAllDailyStats(): Promise<Record<string, any>> {
    const local = readJson<Record<string, any>>(DAILY_STATS_KEY, {})
    if (!isCloudActive()) return local
    const remote = await readForDisplay<Record<string, any>>(DAILY_STATS_FILE)
    const merged = { ...remote }
    for (const [key, value] of Object.entries(local)) {
        if (!merged[key] || (value.updated_at || '') >= (merged[key].updated_at || '')) merged[key] = value
    }
    return merged
}

export interface StudyAnalytics {
    studyDays: { date: string; count: number }[]
    totals: { sessions: number; correct: number; total: number; accuracy: number }
    weakestWords: { word: string; strength: number; wrongStreak: number }[]
    activity: { quizName: string; date: string; correct: number; total: number }[]
}

export async function getStudyAnalytics(userId: string): Promise<StudyAnalytics> {
    const quizStats = await getAllQuizStats()
    const dailyStats = await getAllDailyStats()

    const countsByDate = new Map<string, number>()
    for (const stats of Object.values(quizStats)) {
        for (const h of stats.history || []) {
            const date = h.date ? localDate(new Date(h.date)) : ''
            if (!date) continue
            countsByDate.set(date, (countsByDate.get(date) || 0) + (h.total || 0))
        }
    }
    for (const entry of Object.values(dailyStats)) {
        if (!entry || entry.user_id !== userId) continue
        const date = String(entry.date || '').slice(0, 10)
        if (!date) continue
        const answers = (Number(entry.words_learned) || 0) + (Number(entry.words_drilled) || 0) + (Number(entry.words_examined) || 0)
        countsByDate.set(date, Math.max(countsByDate.get(date) || 0, answers))
    }

    let sessions = 0
    let correct = 0
    let total = 0
    for (const stats of Object.values(quizStats)) {
        for (const h of stats.history || []) {
            sessions += 1
            correct += h.correct || 0
            total += h.total || 0
        }
    }
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

    const progress = await getWordProgress(userId)
    const weakestWords = Object.entries(progress || {})
        .map(([key, p]) => ({
            word: p?.word || key,
            strength: typeof p?.strength === 'number' ? p.strength : 0,
            wrongStreak: p?.wrongStreak || 0
        }))
        .sort((a, b) => a.strength - b.strength || b.wrongStreak - a.wrongStreak)
        .slice(0, 8)

    const activity = flattenActivity(quizStats)
        .slice(0, 10)
        .map(e => ({ quizName: e.quizName, date: e.date, correct: e.correct, total: e.total }))

    const studyDays: { date: string; count: number }[] = []
    const today = new Date()
    for (let i = 89; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        const date = localDate(d)
        studyDays.push({ date, count: countsByDate.get(date) || 0 })
    }

    return {
        studyDays,
        totals: { sessions, correct, total, accuracy },
        weakestWords,
        activity
    }
}

// ---------------------------------------------------------------------------
// Sync only the current account's data. Guest and unowned legacy data stay
// separate. Reads must succeed before any remote file can be replaced.
// ---------------------------------------------------------------------------

export async function syncLocalToCloud(): Promise<boolean> {
    if (!isCloudActive() || typeof window === 'undefined') return false
    const owner = currentAccountId()
    let synced = false
    try {
        await queueLocalWrite('sync', async () => {
            const localQuizzes = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
            const localProgress = readProgressStore()[owner] || {}
            const localStats = readJson<Record<string, any>>(DAILY_STATS_KEY, {})
            const localFolders = readJson<Folder[]>(FOLDERS_KEY, [])
            const localQuizStats = readJson<Record<string, QuizStats>>(QUIZ_STATS_KEY, {})
            const remoteQuizzes = await readDriveFile<any[]>(CUSTOM_QUIZZES_FILE) || []
            const remoteProgress = await readDriveFile<ProgressMap>(PROGRESS_FILE) || {}
            const remoteStats = await readDriveFile<Record<string, any>>(DAILY_STATS_FILE) || {}
            const remoteFolders = await readDriveFile<Folder[]>(FOLDERS_FILE) || []
            const remoteQuizStats = await readDriveFile<Record<string, QuizStats>>(QUIZ_STATS_FILE) || {}
            const mergedQuizzes = withoutDeleted('quizzes', [...localQuizzes, ...remoteQuizzes.filter(q => !localQuizzes.some(l => l.id === q.id))])
            const mergedProgress = mergeProgress(localProgress, remoteProgress)
            const mergedStats = { ...remoteStats }
            for (const [key, value] of Object.entries(localStats)) {
                if (!mergedStats[key] || (value.updated_at || '') >= (mergedStats[key].updated_at || '')) mergedStats[key] = value
            }
            const mergedFolders = withoutDeleted('folders', [...localFolders, ...remoteFolders.filter(f => !localFolders.some(l => l.id === f.id))])
            const mergedQuizStats = mergeQuizStats(localQuizStats, remoteQuizStats)
            await writeDriveFile(CUSTOM_QUIZZES_FILE, mergedQuizzes)
            await writeDriveFile(PROGRESS_FILE, mergedProgress)
            await writeDriveFile(DAILY_STATS_FILE, mergedStats)
            await writeDriveFile(FOLDERS_FILE, mergedFolders)
            await writeDriveFile(QUIZ_STATS_FILE, mergedQuizStats)
            assertAccount(owner)
            writeJson(CUSTOM_QUIZZES_KEY, mergedQuizzes)
            writeJson(PROGRESS_KEY, { [owner]: mergedProgress })
            writeJson(DAILY_STATS_KEY, mergedStats)
            writeJson(FOLDERS_KEY, mergedFolders)
            writeJson(QUIZ_STATS_KEY, mergedQuizStats)
            setSyncMessage('', owner)
            synced = true
        })
    } catch {
        setSyncMessage('Cloud sync failed. Your local data is preserved; reconnect and retry.', owner)
    }
    return synced
}

// ---------------------------------------------------------------------------
// Import / export helpers (JSON + CSV)
// ---------------------------------------------------------------------------

const CSV_HEADER = ['word', 'ru', 'synonyms', 'simple_examples', 'advanced_example', 'confusions']

function csvEscape(value: string): string {
    if (/[,"\n\r]/.test(value)) {
        return '"' + value.replace(/"/g, '""') + '"'
    }
    return value
}

function parseCSV(text: string): string[][] {
    const rows: string[][] = []
    let field = ''
    let row: string[] = []
    let inQuotes = false

    const endField = () => { row.push(field); field = '' }
    const endRow = () => { endField(); rows.push(row); row = [] }

    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++ }
                else inQuotes = false
            } else {
                field += c
            }
        } else if (c === '"') {
            inQuotes = true
        } else if (c === ',') {
            endField()
        } else if (c === '\n') {
            endRow()
        } else if (c === '\r') {
            if (text[i + 1] === '\n') i++
            endRow()
        } else {
            field += c
        }
    }

    if (field !== '' || row.length > 0) endRow()

    return rows
}

function splitList(value: string): string[] {
    return String(value ?? '').split(';').map(s => s.trim()).filter(Boolean)
}

/**
 * Serialize vocabulary words to CSV. Arrays are joined with "; " and values
 * containing commas, quotes or newlines are quoted and escaped.
 */
export function wordsToCSV(words: Word[]): string {
    const joinList = (list?: string[]) => (Array.isArray(list) ? list : []).join('; ')
    const rows = words.map(w =>
        [
            w.word,
            w.ru,
            joinList(w.synonyms),
            joinList(w.simple_examples),
            w.advanced_example || '',
            joinList(w.confusions)
        ].map(csvEscape).join(',')
    )
    return [CSV_HEADER.join(','), ...rows].join('\n')
}

export function csvToWords(text: string): { words: Word[]; errors: string[] } {
    const rows = parseCSV(text).filter(r => r.some(c => c.trim() !== ''))
    const errors: string[] = []
    const words: Word[] = []

    if (!rows.length) return { words, errors: ['No rows found'] }

    const isHeader = rows[0][0]?.trim().toLowerCase() === 'word'
    const start = isHeader ? 1 : 0

    for (let i = start; i < rows.length; i++) {
        const row = rows[i]
        const word = String(row[0] ?? '').trim()
        const ru = String(row[1] ?? '').trim()
        if (!word || !ru) {
            errors.push(`Row ${i + 1}: missing ${!word ? '"word"' : '"ru"'}`)
            continue
        }
        words.push({
            word,
            ru,
            synonyms: splitList(row[2]),
            simple_examples: splitList(row[3]),
            advanced_example: String(row[4] ?? '').trim(),
            confusions: splitList(row[5])
        })
    }

    return { words, errors }
}

export function delimitedToWords(text: string): { words: Word[]; errors: string[] } {
    const errors: string[] = []
    const words: Word[] = []

    text.split(/\r?\n/).forEach((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return

        let word = ''
        let ru = ''
        const tabIdx = trimmed.indexOf('\t')
        const dashIdx = trimmed.indexOf(' - ')
        if (tabIdx >= 0) {
            word = trimmed.slice(0, tabIdx).trim()
            ru = trimmed.slice(tabIdx + 1).trim()
        } else if (dashIdx >= 0) {
            word = trimmed.slice(0, dashIdx).trim()
            ru = trimmed.slice(dashIdx + 3).trim()
        } else {
            errors.push(`Line ${i + 1}: expected "word - definition" or "word<TAB>definition"`)
            return
        }

        if (!word || !ru) {
            errors.push(`Line ${i + 1}: missing ${!word ? 'word' : 'definition'}`)
            return
        }

        words.push({ word, ru, synonyms: [], simple_examples: [], advanced_example: '', confusions: [] })
    })

    return { words, errors }
}

export async function exportQuizData(userId: string): Promise<{ quizzes: CustomQuiz[]; progress: Record<string, WordProgress>; json: string }> {
    const [quizzes, progress] = await Promise.all([
        getCustomQuizzes(userId),
        getWordProgress(userId)
    ])
    const json = JSON.stringify({ quizzes, progress }, null, 2)
    return { quizzes, progress, json }
}
