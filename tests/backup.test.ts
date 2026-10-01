import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

// Mirrors the cloud mock in db.test.ts so a restore can be exercised with and
// without Drive.
const cloud = vi.hoisted(() => ({
    owner: 'alice',
    configured: false,
    remote: {} as Record<string, any>,
    failWrite: false,
    failRead: false
}))
vi.mock('../app/lib/drive', () => ({
    getDriveUser: () => (cloud.owner === 'guest' ? null : { id: cloud.owner }),
    isDriveConfigured: () => cloud.configured,
    hasLiveToken: () => cloud.configured,
    readDriveFile: vi.fn(async (name: string) => {
        if (cloud.failRead) throw new Error('network unavailable')
        return cloud.remote[name] ?? null
    }),
    writeDriveFile: vi.fn(async (name: string, value: any) => {
        if (cloud.failWrite) return false
        cloud.remote[name] = value
        return true
    }),
    readSharedDriveQuiz: vi.fn(async () => ({ content: '[]', file: {} }))
}))

import {
    exportAccountBackup,
    importAccountBackup,
    inspectAccountBackup,
    createCustomQuiz,
    createFolder,
    setQuizInFolder,
    getCustomQuizzes,
    getFolders,
    getWordProgress,
    saveWordProgress,
    recordQuizSession,
    getRecentActivity,
    getDailyStats,
    updateDailyStats
} from '../app/lib/db'
import { BACKUP_FORMAT, BACKUP_VERSION, mergeBackupData, serializeBackup, validateBackup } from '../app/lib/backup'
import { accountKey } from '../app/lib/storage'

let store: Map<string, string>

beforeEach(() => {
    store = new Map()
    cloud.owner = 'alice'
    cloud.configured = false
    cloud.remote = {}
    cloud.failWrite = false
    cloud.failRead = false
    vi.clearAllMocks()
    vi.stubGlobal('window', {
        localStorage: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => { store.set(key, value) }
        },
        dispatchEvent: vi.fn()
    })
})
afterEach(() => vi.unstubAllGlobals())

function local(key: string): any {
    const raw = store.get(accountKey(key))
    return raw ? JSON.parse(raw) : undefined
}

/** Populate an account with one record of every backup category. */
async function seedAccount(userId: string) {
    const quiz = await createCustomQuiz(userId, 'French basics', 'desc', [{ word: 'chat', ru: 'кошка' }])
    const folder = await createFolder(userId, 'Vocab')
    await setQuizInFolder(folder.id, quiz.id)
    await saveWordProgress(userId, '/sat/1.json::chat', {
        word: 'chat', status: 'learning', strength: 0.6, seenCount: 4, lastSeen: 1_700_000_000_000
    } as any)
    await recordQuizSession(quiz.id, quiz.name, { correct: 3, total: 5, seconds: 42, id: 'session-1' })
    await updateDailyStats(userId, { wordsLearned: 7, accuracy: 80 })
    return { quiz, folder }
}

describe('complete account backup (issue #51)', () => {
    it('writes a versioned envelope carrying every user-owned category', async () => {
        const { quiz, folder } = await seedAccount('alice')
        const { json } = await exportAccountBackup('alice')
        const parsed = JSON.parse(json)

        expect(parsed.format).toBe(BACKUP_FORMAT)
        expect(parsed.version).toBe(BACKUP_VERSION)
        expect(parsed.accountId).toBe('alice')
        expect(parsed.data.quizzes.map((q: any) => q.id)).toEqual([quiz.id])
        expect(parsed.data.folders.map((f: any) => f.id)).toEqual([folder.id])
        expect(parsed.data.folders[0].quiz_ids).toEqual([quiz.id])
        // The quiz-scoped progress key survives export verbatim.
        expect(Object.keys(parsed.data.progress)).toEqual(['/sat/1.json::chat'])
        expect(Object.keys(parsed.data.quizStats)).toEqual([quiz.id])
        expect(parsed.data.quizStats[quiz.id].history).toHaveLength(1)
        expect(Object.keys(parsed.data.dailyStats)).toHaveLength(1)
    })

    it('round-trips every category onto a fresh profile', async () => {
        const { quiz, folder } = await seedAccount('alice')
        const { json } = await exportAccountBackup('alice')

        // A different device: nothing local yet.
        store = new Map()
        cloud.owner = 'bob'

        const result = await importAccountBackup('bob', json, 'merge')
        expect(result.ok).toBe(true)
        expect(result.counts).toEqual({ quizzes: 1, folders: 1, progress: 1, dailyStats: 1, quizStats: 1 })

        expect((await getCustomQuizzes('bob')).map(q => q.id)).toEqual([quiz.id])
        // Imported quizzes are rebound to the restoring account.
        expect((await getCustomQuizzes('bob'))[0].user_id).toBe('bob')

        const folders = await getFolders()
        expect(folders.map(f => f.name)).toEqual(['Vocab'])
        expect(folders[0].user_id).toBe('bob')
        expect(folders[0].quiz_ids).toEqual([quiz.id])

        const progress = await getWordProgress('bob')
        expect(progress['/sat/1.json::chat']?.strength).toBe(0.6)

        const activity = await getRecentActivity(10)
        expect(activity).toHaveLength(1)
        expect(activity[0].correct).toBe(3)
        expect(activity[0].total).toBe(5)
        expect(activity[0].seconds).toBe(42)
        expect((await getDailyStats('bob'))?.words_learned).toBe(7)
    })

    it('merges without dropping data already on the device', async () => {
        await seedAccount('alice')
        const { json } = await exportAccountBackup('alice')
        await createCustomQuiz('alice', 'Local only', '', [])

        const result = await importAccountBackup('alice', json, 'merge')
        expect(result.ok).toBe(true)
        const names = (await getCustomQuizzes('alice')).map(q => q.name).sort()
        expect(names).toEqual(['French basics', 'Local only'])
    })

    it('replace discards the account current data first', async () => {
        await seedAccount('alice')
        const { json } = await exportAccountBackup('alice')
        await createCustomQuiz('alice', 'Local only', '', [])
        await createFolder('alice', 'Stale folder')

        const result = await importAccountBackup('alice', json, 'replace')
        expect(result.ok).toBe(true)
        expect((await getCustomQuizzes('alice')).map(q => q.name)).toEqual(['French basics'])
        expect((await getFolders()).map(f => f.name)).toEqual(['Vocab'])
    })

    it('uploads the restored data when cloud sync is active', async () => {
        await seedAccount('alice')
        const { json } = await exportAccountBackup('alice')
        cloud.configured = true
        store = new Map()

        expect((await importAccountBackup('alice', json, 'merge')).ok).toBe(true)
        expect(cloud.remote['folders.json']).toHaveLength(1)
        expect(cloud.remote['quiz_stats.json']).toHaveProperty(Object.keys(cloud.remote['quiz_stats.json'])[0])
        expect(Object.keys(cloud.remote['progress.json'])).toEqual(['/sat/1.json::chat'])
    })
})

describe('backup validation', () => {
    it('rejects invalid JSON with a readable message and writes nothing', async () => {
        const result = await importAccountBackup('alice', 'not json {')
        expect(result.ok).toBe(false)
        expect(result.errors[0]).toContain('Invalid JSON')
        expect(store.size).toBe(0)
    })

    it('rejects a non-object payload', async () => {
        expect((await importAccountBackup('alice', '[1,2,3]')).ok).toBe(false)
        expect((await importAccountBackup('alice', '"a string"')).ok).toBe(false)
    })

    it('rejects a file that is not an OpenQuiz backup', async () => {
        const result = await importAccountBackup('alice', JSON.stringify({ hello: 'world' }))
        expect(result.ok).toBe(false)
        expect(result.errors[0]).toContain('not an OpenQuiz backup')
    })

    it('rejects a backup from a newer format version', async () => {
        const { json } = await exportAccountBackup('alice')
        const future = { ...JSON.parse(json), version: BACKUP_VERSION + 1 }
        const result = await importAccountBackup('alice', JSON.stringify(future))
        expect(result.ok).toBe(false)
        expect(result.errors[0]).toContain('newer OpenQuiz')
        expect(store.size).toBe(0)
    })

    it('rejects a missing or non-numeric version', async () => {
        const { json } = await exportAccountBackup('alice')
        const parsed = JSON.parse(json)
        delete parsed.version
        expect((await importAccountBackup('alice', JSON.stringify(parsed))).ok).toBe(false)
        expect((await importAccountBackup('alice', JSON.stringify({ ...JSON.parse(json), version: 'two' }))).ok).toBe(false)
    })

    it('rejects structurally broken categories instead of a partial restore', async () => {
        const { json } = await exportAccountBackup('alice')
        const parsed = JSON.parse(json)

        parsed.data.quizzes = [{ name: 'no id' }]
        expect((await importAccountBackup('alice', JSON.stringify(parsed))).ok).toBe(false)

        parsed.data.quizzes = []
        parsed.data.folders = 'nope'
        expect((await importAccountBackup('alice', JSON.stringify(parsed))).ok).toBe(false)

        parsed.data.folders = []
        parsed.data.progress = ['a', 'b']
        expect((await importAccountBackup('alice', JSON.stringify(parsed))).ok).toBe(false)

        parsed.data.progress = {}
        parsed.data.quizStats = { [quizKey()]: 'not-an-object' }
        expect((await importAccountBackup('alice', JSON.stringify(parsed))).ok).toBe(false)
        // Nothing was written by any of the rejected attempts.
        expect(store.size).toBe(0)
    })

    function quizKey() { return 'quiz-1' }

    it('accepts a legacy quizzes-and-progress export but says what is missing', async () => {
        const legacy = JSON.stringify({ quizzes: [{ id: 'q1', user_id: 'alice', name: 'Old', words: [] }], progress: {} })
        const result = await importAccountBackup('alice', legacy)
        expect(result.ok).toBe(true)
        expect(result.warnings.join(' ')).toContain('legacy export')
        expect((await getCustomQuizzes('alice')).map(q => q.name)).toEqual(['Old'])
    })

    it('upgrades an older envelope version with a warning', () => {
        const validation = validateBackup(JSON.stringify({
            format: BACKUP_FORMAT,
            version: 1,
            data: { quizzes: [], folders: [], progress: {}, dailyStats: {}, quizStats: {}, deletedIds: { quizzes: [], folders: [] } }
        }), 'alice')
        expect(validation.ok).toBe(true)
        expect(validation.backup?.version).toBe(BACKUP_VERSION)
        expect(validation.warnings.join(' ')).toContain('v1')
    })

    it('previews a backup without touching storage', async () => {
        const { json } = await exportAccountBackup('alice')
        store = new Map()
        const preview = inspectAccountBackup(json, 'bob')
        expect(preview.ok).toBe(true)
        expect(preview.warnings.some(w => w.includes('different account'))).toBe(true)
        expect(store.size).toBe(0)
    })
})

describe('backup account isolation', () => {
    it('rebinds restored records to the restoring account and stores them in its slot', async () => {
        await seedAccount('alice')
        const { json } = await exportAccountBackup('alice')
        const parsed = JSON.parse(json)
        const originalId = parsed.data.quizzes[0].id
        // A tampered file cannot smuggle records that stay owned by someone else.
        parsed.data.quizzes.push({ id: 'x-quiz', user_id: 'mallory', name: 'Not yours', words: [] })
        parsed.data.folders.push({ id: 'x-folder', user_id: 'mallory', name: 'Theirs', quiz_ids: ['x-quiz'] })
        parsed.data.dailyStats['mallory:2026-01-01'] = { user_id: 'mallory', date: '2026-01-01', words_learned: 99 }

        const result = await importAccountBackup('alice', JSON.stringify(parsed), 'replace')
        expect(result.ok).toBe(true)

        const quizzes = await getCustomQuizzes('alice')
        // The importing account owns everything it restored...
        expect(quizzes.every(q => q.user_id === 'alice')).toBe(true)
        expect((await getFolders()).every(f => f.user_id === 'alice')).toBe(true)
        // ...including the records the file claimed belonged to another account.
        expect(quizzes.map(q => q.id).sort()).toEqual(['x-quiz', originalId].sort())
        // Daily stats are re-keyed, so they still count for this account.
        expect((await getDailyStats('alice', '2026-01-01'))?.user_id).toBe('alice')
        expect((await getDailyStats('alice', '2026-01-01'))?.words_learned).toBe(99)
    })

    it('writes only into the current account storage slot', async () => {
        const { json } = await exportAccountBackup('alice')
        store = new Map()
        cloud.owner = 'bob'

        expect((await importAccountBackup('bob', json)).ok).toBe(true)
        expect(store.get(accountKey('oquiz:custom_quizzes', 'alice'))).toBeUndefined()
        expect(store.get(accountKey('oquiz:progress', 'alice'))).toBeUndefined()
        expect(local('oquiz:custom_quizzes').every((q: any) => q.user_id === 'bob')).toBe(true)
    })

    it('keeps a restored account from reading another account data', async () => {
        await seedAccount('alice')
        const { json } = await exportAccountBackup('alice')

        // The store keeps both accounts' slots; only the signed-in one changes.
        cloud.owner = 'bob'
        await createCustomQuiz('bob', 'Theirs', '', [])
        await importAccountBackup('bob', json, 'merge')

        // Bob sees his own data plus the restore, and only that.
        expect((await getCustomQuizzes('bob')).map(q => q.name).sort()).toEqual(['French basics', 'Theirs'])
        // Alice's own view is untouched by anything Bob did.
        cloud.owner = 'alice'
        expect((await getCustomQuizzes('alice')).map(q => q.name)).toEqual(['French basics'])
        // Each account has its own progress slot, and a read only ever returns
        // the caller's own.
        cloud.owner = 'bob'
        expect(Object.keys(await getWordProgress('bob'))).toEqual(['/sat/1.json::chat'])
        expect(await getWordProgress('alice')).toEqual({})
    })

    it('refuses to import after the account changes mid-restore', async () => {
        const { json } = await exportAccountBackup('alice')
        cloud.owner = 'bob'
        await expect(importAccountBackup('alice', json)).rejects.toThrow(/Account changed/)
    })

    it('never exports another account data into this account backup', async () => {
        await createCustomQuiz('alice', 'Mine', '', [])
        cloud.owner = 'bob'
        await createCustomQuiz('bob', 'Theirs', '', [])
        await importAccountBackup('bob', await exportAccountBackup('bob').then(r => r.json), 'replace')

        cloud.owner = 'alice'
        const { json } = await exportAccountBackup('alice')
        expect(json).toContain('Mine')
        expect(json).not.toContain('Theirs')
    })
})

describe('mergeBackupData', () => {
    const bucket = () => ({
        quizzes: [], folders: [], progress: {}, dailyStats: {}, quizStats: {},
        deletedIds: { quizzes: [], folders: [] }
    })

    it('keeps the newer record per quiz id', () => {
        const current = { ...bucket(), quizzes: [{ id: 'q1', name: 'new', updatedAt: 200 }] }
        const incoming = { ...bucket(), quizzes: [{ id: 'q1', name: 'old', updatedAt: 100 }, { id: 'q2', name: 'new quiz', updatedAt: 50 }] }
        const merged = mergeBackupData(current, incoming, 'merge')
        expect(merged.quizzes.map(q => q.name).sort()).toEqual(['new', 'new quiz'])
    })

    it('unions folder membership so an older backup cannot drop filed quizzes', () => {
        const current = { ...bucket(), folders: [{ id: 'f1', name: 'F', quiz_ids: ['a'] }] }
        const incoming = { ...bucket(), folders: [{ id: 'f1', name: 'F', quiz_ids: ['b'] }] }
        expect(mergeBackupData(current, incoming, 'merge').folders[0].quiz_ids.sort()).toEqual(['a', 'b'])
    })

    it('keeps the more advanced progress record per scoped key', () => {
        const current = { ...bucket(), progress: { '/sat/1.json::x': { strength: 0.2, lastSeen: 1 } } }
        const incoming = { ...bucket(), progress: { '/sat/1.json::x': { strength: 0.9, lastSeen: 2 } } }
        expect(mergeBackupData(current, incoming, 'merge').progress['/sat/1.json::x'].strength).toBe(0.9)
    })

    it('deduplicates quiz history by session id and keeps the best scores', () => {
        const entry = { id: 's1', date: '2026-01-01', correct: 3, total: 5 }
        const current = { ...bucket(), quizStats: { q1: { plays: 2, bestCorrect: 4, bestAccuracy: 80, lastStudied: '2026-01-01', history: [entry] } } }
        const incoming = { ...bucket(), quizStats: { q1: { plays: 1, bestCorrect: 3, bestAccuracy: 60, lastStudied: '2026-01-02', history: [entry] } } }
        const merged = mergeBackupData(current, incoming, 'merge').quizStats.q1
        expect(merged.history).toHaveLength(1)
        expect(merged.bestCorrect).toBe(4)
        expect(merged.lastStudied).toBe('2026-01-02')
    })

    it('serializes to a re-readable envelope', () => {
        const data = { ...bucket(), quizzes: [{ id: 'q1', user_id: 'alice', name: 'Q' }] }
        const text = serializeBackup('alice', data)
        expect(validateBackup(text, 'alice').ok).toBe(true)
        expect(JSON.parse(text).data.quizzes[0].name).toBe('Q')
    })
})