import { supabase, isSupabaseConfigured } from './supabase'
import { WordProgress } from './satTypes'
import { assetPath } from './paths'

/**
 * Hybrid data layer for the static (GitHub Pages) build.
 *
 * When Supabase keys are configured at build time, quizzes, progress and
 * stats are stored in the cloud (per signed-in user). Otherwise everything
 * is persisted to localStorage — the site works identically with no backend.
 * Every function keeps the same signature in both modes, so callers don't
 * know (or care) which backend is active.
 */

const PROGRESS_KEY = 'oquiz:progress'
const CUSTOM_QUIZZES_KEY = 'oquiz:custom_quizzes'
const DAILY_STATS_KEY = 'oquiz:daily_stats'

const MANIFEST_PATH = '/sat/quiz-sets.json'

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
    if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
            .from('word_progress')
            .select('*')
            .eq('user_id', userId)

        if (error) {
            console.error('Error fetching progress:', error)
            return {}
        }

        const progressMap: Record<string, WordProgress> = {}
        data?.forEach((item: any) => {
            progressMap[item.word] = {
                word: item.word,
                strength: item.strength,
                lastSeen: new Date(item.last_seen).getTime(),
                nextDue: new Date(item.next_due).getTime(),
                seenCount: item.seen_count,
                wrongStreak: item.wrong_streak,
                status: item.status
            }
        })
        return progressMap
    }

    return readJson<Record<string, WordProgress>>(PROGRESS_KEY, {})
}

export async function saveWordProgress(userId: string, word: string, progress: WordProgress) {
    if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
            .from('word_progress')
            .upsert({
                user_id: userId,
                word: progress.word,
                strength: progress.strength,
                last_seen: new Date(progress.lastSeen).toISOString(),
                next_due: progress.nextDue ? new Date(progress.nextDue).toISOString() : null,
                seen_count: progress.seenCount,
                wrong_streak: progress.wrongStreak,
                status: progress.status,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,word'
            })

        if (error) {
            console.error('Error saving progress:', error)
            throw error
        }
        return
    }

    const all = await getWordProgress(userId)
    all[word] = progress
    writeJson(PROGRESS_KEY, all)
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
    if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
            .from('custom_quizzes')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching custom quizzes:', error)
            return []
        }
        return data || []
    }

    const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    return all.filter(q => q.user_id === userId)
}

export async function getPublicQuizzes(excludeUserId?: string) {
    if (isSupabaseConfigured && supabase) {
        let query = supabase
            .from('custom_quizzes')
            .select('*')
            .eq('is_public', true)
            .order('created_at', { ascending: false })

        if (excludeUserId) {
            query = query.neq('user_id', excludeUserId)
        }

        const { data, error } = await query
        if (error) {
            console.error('Error fetching public quizzes:', error)
            return []
        }
        return data || []
    }

    const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    return all.filter(q => q.is_public && q.user_id !== excludeUserId)
}

export async function getCustomQuizById(quizId: string) {
    if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
            .from('custom_quizzes')
            .select('*')
            .eq('id', quizId)
            .maybeSingle()

        if (error) {
            console.error('Error fetching custom quiz:', error)
            return null
        }
        return data
    }

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
    if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
            .from('custom_quizzes')
            .insert({
                user_id: userId,
                name,
                description,
                words,
                is_public: isPublic,
                author_name: authorName || null
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating custom quiz:', error)
            throw error
        }
        return data
    }

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
    if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
            .from('custom_quizzes')
            .delete()
            .eq('id', quizId)

        if (error) {
            console.error('Error deleting custom quiz:', error)
            throw error
        }
        return
    }

    const all = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    writeJson(CUSTOM_QUIZZES_KEY, all.filter(q => q.id !== quizId))
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

    if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
            .from('daily_stats')
            .upsert({
                user_id: userId,
                date: today,
                words_learned: stats.wordsLearned || 0,
                words_drilled: stats.wordsDrilled || 0,
                words_examined: stats.wordsExamined || 0,
                mistakes_count: stats.mistakesCount || 0,
                accuracy: stats.accuracy || 0,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,date'
            })

        if (error) {
            console.error('Error updating daily stats:', error)
            throw error
        }
        return
    }

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

    if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
            .from('daily_stats')
            .select('*')
            .eq('user_id', userId)
            .eq('date', targetDate)
            .maybeSingle()

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching daily stats:', error)
            return null
        }
        return data
    }

    const all = readJson<Record<string, any>>(DAILY_STATS_KEY, {})
    return all[`${userId}:${targetDate}`] || null
}

export async function getStreak(userId: string): Promise<number> {
    let dates: string[] = []

    if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
            .from('daily_stats')
            .select('date')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .limit(365)

        if (error) {
            console.error('Error fetching streak:', error)
            return 0
        }
        dates = (data || []).map((d: any) => d.date)
    } else {
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
// One-time migration of guest (localStorage) data into the user's cloud
// account. Called after a successful sign-in when Supabase is configured.
// ---------------------------------------------------------------------------

export async function syncLocalToCloud(userId: string) {
    if (!isSupabaseConfigured || !supabase) return false
    if (typeof window === 'undefined') return false

    const localQuizzes = readJson<any[]>(CUSTOM_QUIZZES_KEY, [])
    const localProgress = readJson<Record<string, WordProgress>>(PROGRESS_KEY, {})

    try {
        if (Array.isArray(localQuizzes) && localQuizzes.length > 0) {
            for (const q of localQuizzes) {
                await supabase
                    .from('custom_quizzes')
                    .upsert({
                        id: q.id,
                        user_id: userId,
                        name: q.name,
                        description: q.description || '',
                        words: q.words || [],
                        is_public: q.is_public === true,
                        author_name: q.author_name || null,
                        created_at: q.created_at || new Date().toISOString()
                    }, { onConflict: 'id' })
            }
            window.localStorage.removeItem(CUSTOM_QUIZZES_KEY)
        }

        const entries = Object.entries(localProgress)
        if (entries.length > 0) {
            for (const [word, p] of entries) {
                await supabase
                    .from('word_progress')
                    .upsert({
                        user_id: userId,
                        word: p.word || word,
                        strength: p.strength,
                        last_seen: new Date(p.lastSeen || Date.now()).toISOString(),
                        next_due: p.nextDue ? new Date(p.nextDue).toISOString() : null,
                        seen_count: p.seenCount,
                        wrong_streak: p.wrongStreak,
                        status: p.status,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id,word' })
            }
            window.localStorage.removeItem(PROGRESS_KEY)
        }

        return true
    } catch (error) {
        console.error('Local->cloud sync failed (local data preserved):', error)
        return false
    }
}