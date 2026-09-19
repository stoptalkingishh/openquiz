import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ owner: 'alice', cloud: false, remote: {} as Record<string, any>, failRead: false }))
vi.mock('../app/lib/drive', () => ({
    getDriveUser: () => state.owner === 'guest' ? null : { id: state.owner },
    isDriveConfigured: () => state.cloud,
    hasLiveToken: () => state.cloud,
    readDriveFile: vi.fn(async (name: string) => {
        if (state.failRead) throw new Error('network unavailable')
        return state.remote[name] ?? null
    }),
    writeDriveFile: vi.fn(async (name: string, value: any) => { state.remote[name] = value; return true }),
}))
import { createCustomQuiz, deleteCustomQuiz, createFolder, getCustomQuizzes, getWordProgress, saveWordProgress, recordQuizSession, getRecentActivity, syncLocalToCloud, updateDailyStats, getDailyStats, localDate } from '../app/lib/db'
import { accountKey } from '../app/lib/storage'
import { writeDriveFile } from '../app/lib/drive'

let data: Map<string, string>
let failWrites = false
beforeEach(() => {
    data = new Map()
    state.owner = 'alice'; state.cloud = false; state.remote = {}; state.failRead = false; failWrites = false
    vi.clearAllMocks()
    vi.stubGlobal('window', {
        localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { if (failWrites) throw new Error('quota'); data.set(key, value) } },
        dispatchEvent: vi.fn(),
    })
})
afterEach(() => vi.unstubAllGlobals())

describe('account storage and failed saves', () => {
    it('rejects stale account daily writes and shows newer offline stats', async () => {
        await expect(updateDailyStats('bob', { wordsLearned: 1 })).rejects.toThrow('Account changed')
        await updateDailyStats('alice', { wordsLearned: 5 })
        state.remote['daily_stats.json'] = { [`alice:${localDate()}`]: { user_id: 'alice', date: localDate(), words_learned: 1, updated_at: '2020-01-01' } }
        state.cloud = true
        expect((await getDailyStats('alice')).words_learned).toBe(5)
        expect(await getDailyStats('bob')).toBeNull()
    })
    it('does not restore an offline deletion on the next sync', async () => {
        const quiz = await createCustomQuiz('alice', 'Delete me', '', [])
        state.remote['custom_quizzes.json'] = [quiz]
        await deleteCustomQuiz(quiz.id)
        state.cloud = true
        expect(await getCustomQuizzes('alice')).toEqual([])
        expect(await syncLocalToCloud()).toBe(true)
        expect(state.remote['custom_quizzes.json']).toEqual([])
    })
    it('does not overwrite remote folders after a failed listing', async () => {
        state.cloud = true; state.failRead = true
        await createFolder('alice', 'Local folder')
        expect(writeDriveFile).not.toHaveBeenCalled()
    })
    it('keeps quizzes, history and progress isolated when accounts switch', async () => {
        await createCustomQuiz('alice', 'Private A', '', [])
        await saveWordProgress('alice', 'cat', { word: 'cat', lastSeen: 10 })
        await recordQuizSession('quiz', 'Private A', { correct: 1, total: 1 })
        state.owner = 'bob'
        expect(await getCustomQuizzes('bob')).toEqual([])
        expect(await getWordProgress('bob')).toEqual({})
        expect(await getRecentActivity()).toEqual([])
        state.cloud = true
        expect(await syncLocalToCloud()).toBe(true)
        expect(state.remote['quiz_stats.json']).toEqual({})
        state.owner = 'alice'; state.cloud = false
        expect(await getCustomQuizzes('alice')).toHaveLength(1)
        expect(await getRecentActivity()).toHaveLength(1)
    })
    it('does not claim unowned legacy history for a newly signed-in account', async () => {
        data.set('oquiz:quiz_stats', JSON.stringify({ secret: { history: [{ date: '2026-09-18', correct: 1, total: 1 }] } }))
        expect(await getRecentActivity()).toEqual([])
        expect(data.has('oquiz:quiz_stats')).toBe(true)
    })
    it('rejects quota failures and allows a subsequent queued save to recover', async () => {
        failWrites = true
        await expect(createCustomQuiz('alice', 'Draft', '', [])).rejects.toThrow('Could not save')
        await expect(saveWordProgress('alice', 'cat', { word: 'cat', lastSeen: 10 })).rejects.toThrow('Could not save')
        failWrites = false
        await saveWordProgress('alice', 'dog', { word: 'dog', lastSeen: 20 })
        expect(Object.keys(await getWordProgress('alice'))).toEqual(['dog'])
    })
    it('preserves local sessions and never overwrites Drive after a failed remote read', async () => {
        state.cloud = true; state.failRead = true
        await recordQuizSession('quiz', 'Example', { id: 'session-1', correct: 2, total: 3 })
        await recordQuizSession('quiz', 'Example', { id: 'session-1', correct: 2, total: 3 })
        expect(await getRecentActivity()).toHaveLength(1)
        expect(await syncLocalToCloud()).toBe(false)
        expect(writeDriveFile).not.toHaveBeenCalled()
    })
    it('merges newer offline progress and distinct cloud history, then hydrates local storage', async () => {
        await saveWordProgress('alice', 'cat', { word: 'cat', lastSeen: 200, seenCount: 2 })
        await recordQuizSession('quiz', 'Example', { id: 'local', correct: 2, total: 3 })
        state.remote['progress.json'] = { cat: { word: 'cat', lastSeen: 100, seenCount: 1 } }
        state.remote['quiz_stats.json'] = { quiz: { plays: 1, bestCorrect: 1, bestAccuracy: 100, quizName: 'Example', lastStudied: '2026-09-17T12:00:00Z', history: [{ id: 'remote', date: '2026-09-17T12:00:00Z', correct: 1, total: 1 }] } }
        state.cloud = true
        expect(await syncLocalToCloud()).toBe(true)
        expect(state.remote['progress.json'].cat.lastSeen).toBe(200)
        expect(state.remote['quiz_stats.json'].quiz.history).toHaveLength(2)
        expect(JSON.parse(data.get(accountKey('oquiz:quiz_stats'))!).quiz.history).toHaveLength(2)
    })
})
