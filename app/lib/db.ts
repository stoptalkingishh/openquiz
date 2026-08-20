import { WordProgress } from './satTypes'
import { assetPath } from './paths'
import { isDriveConfigured, readDriveFile, writeDriveFile, getDriveUser } from './drive'

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

const PROGRESS_FILE = 'progress.json'
const CUSTOM_QUIZZES_FILE = 'custom_quizzes.json'
const DAILY_STATS_FILE = 'daily_stats.json'

const MANIFEST_PATH = '/sat/quiz-sets.json'

// A user is "cloud active" when Drive is configured and they're signed in.
// Drive is used as the source of truth (read/write), then mirrored to
// localStorage so the app still works offline.
function isCloudActive(): boolean {
    return isDriveConfigured() && typeof window !== 'undefined' && Boolean(getDriveUser())
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
        if (remoteQuiz) return remoteQuiz
    }

    return local
}

export async function createCustomQuiz(
    userId: string,
    name: string,
    description: string,
    words: any[],
    isPublic: boolean = false,
    authorName?: string
) {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    const quiz = {
        id,
        user_id: userId,
        name,
        description,
        words,
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
// One-time migration of guest (localStorage) data into the user's Drive
// account. Called after a successful sign-in. Drive always wins on conflict.
// ---------------------------------------------------------------------------

export async function syncLocalToCloud(): Promise<boolean> {
    if (!isCloudActive()) return false
    if (typeof window === 'undefined') return false

    const localQuizzes = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
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

        return true
    } catch (error) {
        console.error('Local->Drive sync failed (local data preserved):', error)
        return false
    }
}