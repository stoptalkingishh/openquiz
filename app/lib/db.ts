import { WordProgress } from './satTypes'
import { assetPath, BASE_PATH } from './paths'

/**
 * Pure browser-local data layer for the static (GitHub Pages) build.
 *
 * Every function intentionally keeps the same signature the Supabase version
 * used so the rest of the app is unaware of the backend. Later this file can
 * be swapped for (or layered over) Supabase to add Google sign-in and
 * cross-device sync without touching any UI code.
 */

const PROGRESS_KEY = 'oquiz:progress'
const CUSTOM_QUIZZES_KEY = 'oquiz:custom_quizzes'
const DAILY_STATS_KEY = 'oquiz:daily_stats'

const MANIFEST_PATH = '/sat/quiz-sets.json'

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

export async function getWordProgress(userId: string): Promise<Record<string, WordProgress>> {
    return readJson<Record<string, WordProgress>>(PROGRESS_KEY, {})
}

export async function saveWordProgress(userId: string, word: string, progress: WordProgress) {
    const all = await getWordProgress(userId)
    all[word] = progress
    writeJson(PROGRESS_KEY, all)
}

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

export async function getCustomQuizzes(userId: string) {
    const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    return all.filter(q => q.user_id === userId)
}

export async function getPublicQuizzes(excludeUserId?: string) {
    const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    return all.filter(q => q.is_public && q.user_id !== excludeUserId)
}

export async function getCustomQuizById(quizId: string) {
    const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    return all.find(q => q.id === quizId) || null
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

    const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    all.unshift(quiz)
    writeJson(CUSTOM_QUIZZES_KEY, all)

    return quiz
}

export async function deleteCustomQuiz(quizId: string) {
    const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    writeJson(CUSTOM_QUIZZES_KEY, all.filter(q => q.id !== quizId))
}

function getBaseUrl(): string {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}${BASE_PATH}`
}

export async function updateDailyStats(userId: string, stats: {
    wordsLearned?: number
    wordsDrilled?: number
    wordsExamined?: number
    mistakesCount?: number
    accuracy?: number
}) {
    const today = new Date().toISOString().split('T')[0]
    const all = readJson<Record<string, any>>(DAILY_STATS_KEY, {})
    all[`${userId}:${today}`] = {
        user_id: userId,
        date: today,
        words_learned: stats.wordsLearned || 0,
        words_drilled: stats.wordsDrilled || 0,
        words_examined: stats.wordsExamined || 0,
        mistakes_count: stats.mistakesCount || 0,
        accuracy: stats.accuracy || 0,
        updated_at: new Date().toISOString()
    }
    writeJson(DAILY_STATS_KEY, all)
}

export async function getDailyStats(userId: string, date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0]
    const all = readJson<Record<string, any>>(DAILY_STATS_KEY, {})
    return all[`${userId}:${targetDate}`] || null
}

export async function getStreak(userId: string): Promise<number> {
    const progress = await getWordProgress(userId)
    if (!progress || Object.keys(progress).length === 0) return 0

    const activeDates = new Set<string>()
    for (const p of Object.values(progress)) {
        if (!p.lastSeen) continue
        activeDates.add(new Date(p.lastSeen).toISOString().split('T')[0])
    }

    let streak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = 0; i < 365; i++) {
        const checkDate = new Date(today)
        checkDate.setDate(today.getDate() - i)
        const dateStr = checkDate.toISOString().split('T')[0]
        if (activeDates.has(dateStr)) {
            streak++
        } else if (i > 0) {
            break
        }
    }

    return streak
}