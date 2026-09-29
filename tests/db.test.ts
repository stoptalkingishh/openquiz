import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

const cloud = vi.hoisted(() => ({
    owner: 'alice',
    configured: false,
    remote: {} as Record<string, any>,
    failWrite: false,
    failRead: false
}))
vi.mock('../app/lib/drive', () => ({
    getDriveUser: () => cloud.owner === 'guest' ? null : { id: cloud.owner },
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
    })
}))

import {
    normalizeImportedQuizItems,
    validateQuizJSON,
    createCustomQuiz,
    updateCustomQuiz,
    getCustomQuizzes,
    getCustomQuizById,
    syncLocalToCloud
} from '../app/lib/db'
import { accountKey } from '../app/lib/storage'
import type { CustomQuiz } from '../app/lib/satTypes'

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

function localQuizzes(): any[] {
    const raw = store.get(accountKey('oquiz:custom_quizzes'))
    return raw ? JSON.parse(raw) : []
}

describe('normalizeImportedQuizItems', () => {
    it('preserves mixed vocabulary and generic questions with stable identifiers', () => {
        const items = [{ word: 'cat', ru: 'кошка' }, { prompt: 'Pick', options: ['a', 'b'], correctIndex: 1 }]
        const result = normalizeImportedQuizItems(items)
        expect(result.errors).toEqual([])
        expect(result.words).toEqual([])
        expect(result.questions).toHaveLength(2)
        expect(result.questions[0].answer).toBe('кошка')
        expect(normalizeImportedQuizItems(items).questions).toEqual(result.questions)
    })
    it('rejects blank choices instead of shifting the correct answer', () => {
        const result = normalizeImportedQuizItems([{ prompt: 'Pick C', options: ['A', '', 'C', 'D'], correctIndex: 2 }])
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.questions).toEqual([])
    })
    it('rejects an absent answer key instead of silently grading option zero', () => {
        expect(normalizeImportedQuizItems([{ prompt: 'Pick', options: ['A', 'B'] }]).errors.length).toBeGreaterThan(0)
    })
    it('returns words (and no questions) for a word-shaped array', () => {
        const { words, questions } = normalizeImportedQuizItems([
            { word: 'cat', ru: 'кошка', synonyms: ['kitten'] }
        ])
        expect(words).toHaveLength(1)
        expect(words[0].word).toBe('cat')
        expect(words[0].synonyms).toEqual(['kitten'])
        expect(questions).toEqual([])
    })

    it('parses multiple_choice, true_false and flashcard questions', () => {
        const { words, questions, errors } = normalizeImportedQuizItems([
            { prompt: 'Pick one', options: ['a', 'b', 'c'], correctIndex: 1 },
            { prompt: 'Boolean?', answer: true },
            { prompt: 'String true?', correctAnswer: 'true' },
            { prompt: 'Spell it', answer: 'Paris' }
        ])
        expect(words).toEqual([])
        expect(errors).toEqual([])
        expect(questions).toHaveLength(4)
        expect(questions[0].kind).toBe('multiple_choice')
        expect(questions[0].correctIndex).toBe(1)
        expect(questions[1].kind).toBe('true_false')
        expect(questions[1].correctAnswer).toBe(true)
        expect(questions[2].kind).toBe('true_false')
        expect(questions[2].correctAnswer).toBe(true)
        expect(questions[3].kind).toBe('flashcard')
        expect(questions[3].answer).toBe('Paris')
    })

    it('parses simulation steps', () => {
        const { questions } = normalizeImportedQuizItems([
            {
                kind: 'simulation',
                prompt: 'Set it up',
                steps: [
                    { kind: 'choice', title: 'Pick', options: ['a', 'b'], correctIndex: 0 },
                    { kind: 'checkbox', title: 'Toggle', items: [{ id: 'i1', label: 'x', correct: true }] }
                ]
            }
        ])
        expect(questions[0].kind).toBe('simulation')
        expect(questions[0].steps).toHaveLength(2)
        expect(questions[0].steps?.[0].kind).toBe('choice')
        expect(questions[0].steps?.[0].options).toEqual(['a', 'b'])
        expect(questions[0].steps?.[1].kind).toBe('checkbox')
    })

    it('deduplicates repeated ids', () => {
        const { questions } = normalizeImportedQuizItems([
            { id: 'q1', prompt: 'A?', options: ['x', 'y'], correctIndex: 0 },
            { id: 'q1', prompt: 'B?', options: ['x', 'y'], correctIndex: 0 }
        ])
        expect(questions.map(q => q.id)).toEqual(['q1', 'q1-1'])
    })

    it('preserves a display word on a flashcard', () => {
        const result = normalizeImportedQuizItems([{ kind: 'flashcard', word: 'NAT', prompt: 'What does NAT do?', answer: 'Translates addresses' }])
        expect(result.errors).toEqual([])
        expect(result.questions).toHaveLength(1)
        expect(result.questions[0].word).toBe('NAT')
        expect(result.questions[0].kind).toBe('flashcard')
    })

    it('preserves decimal options instead of stripping their digits', () => {
        const result = normalizeImportedQuizItems([{ prompt: 'p', options: ['1.5', '2.5'], correctIndex: 0 }])
        expect(result.questions[0].options).toEqual(['1.5', '2.5'])
    })

    it('strips labeled options', () => {
        const result = normalizeImportedQuizItems([{ prompt: 'p', options: ['A. Apple', 'B. Banana'], correctIndex: 0 }])
        expect(result.questions[0].options).toEqual(['Apple', 'Banana'])
    })

    it('rejects a simulation with no steps', () => {
        const result = normalizeImportedQuizItems([{ kind: 'simulation', prompt: 's', steps: [] }])
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.questions).toEqual([])
    })

    it('rejects a simulation choice step missing options', () => {
        const result = normalizeImportedQuizItems([{ kind: 'simulation', prompt: 's', steps: [{ kind: 'choice', title: 'Pick' }] }])
        expect(result.errors.length).toBeGreaterThan(0)
    })

    it('rejects a flashcard with an empty answer', () => {
        expect(normalizeImportedQuizItems([{ prompt: 'p', answer: '' }]).errors.length).toBeGreaterThan(0)
        expect(normalizeImportedQuizItems([{ prompt: 'p', answer: '   ' }]).errors.length).toBeGreaterThan(0)
    })
})

describe('validateQuizJSON', () => {
    it('rejects invalid JSON', () => {
        const result = validateQuizJSON('not json {')
        expect(result.ok).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
    })

    it('rejects items missing a word', () => {
        const result = validateQuizJSON('[{"word":"","ru":"кошка"}]')
        expect(result.ok).toBe(false)
        expect(result.errors.some(e => e.includes('missing "word"'))).toBe(true)
    })

    it('rejects items missing ru', () => {
        const result = validateQuizJSON('[{"word":"cat","ru":"кошка"},{"word":"dog"}]')
        expect(result.ok).toBe(false)
        expect(result.errors.some(e => e.includes('missing "ru"'))).toBe(true)
    })

    it('rejects items missing a prompt', () => {
        const result = validateQuizJSON('[{"foo":"bar"}]')
        expect(result.ok).toBe(false)
        expect(result.errors.some(e => e.includes('prompt'))).toBe(true)
    })

    it('accepts a valid word array', () => {
        const result = validateQuizJSON('[{"word":"cat","ru":"кошка"}]')
        expect(result.ok).toBe(true)
        expect(result.count).toBe(1)
    })
})

// Regression cover for audit finding A-02: cloud sync could overwrite or hide
// quiz edits without any conflict signal, because quiz records carried no
// revision. Both sides now resolve by `updatedAt`, and a genuinely divergent
// edit keeps the losing version as a conflict copy instead of dropping it.
describe('quiz revisions and sync conflicts', () => {
    // updateCustomQuiz replaces the full editable field set, so a test that
    // changes one field must restate the rest from the stored record.
    const patchOf = (changes: Partial<CustomQuiz>): Pick<CustomQuiz, 'name' | 'description' | 'tags' | 'words' | 'questions' | 'is_public' | 'ai_source_prompt'> => {
        const current = localQuizzes()[0]
        return {
            name: current?.name ?? 'Quiz',
            description: current?.description ?? '',
            tags: current?.tags ?? [],
            words: current?.words ?? [],
            questions: current?.questions,
            is_public: current?.is_public ?? false,
            ai_source_prompt: current?.ai_source_prompt,
            ...changes
        }
    }

    it('keeps an offline edit whose cloud write failed and wins the next read', async () => {
        const quiz = await createCustomQuiz('alice', 'Draft', '', [])
        // Drive still holds the copy from the last successful sync.
        cloud.remote['custom_quizzes.json'] = [{ ...quiz }]
        cloud.configured = true
        cloud.failWrite = true

        const edited = await updateCustomQuiz(quiz.id, patchOf({ description: 'edited offline' }))
        expect(edited?.description).toBe('edited offline')
        // The upload was attempted and rejected, so the remote edit never landed.
        expect(cloud.remote['custom_quizzes.json'][0].description).toBe('')

        cloud.failWrite = false
        expect((await getCustomQuizById(quiz.id))?.description).toBe('edited offline')
        // An unwritten edit is not a concurrent edit, so no conflict copy appears.
        expect(localQuizzes()).toHaveLength(1)
    })

    it('does not let a stale remote record replace a newer local record', async () => {
        const quiz = await createCustomQuiz('alice', 'Shared', '', [])
        // Drive still holds the copy from the last successful sync.
        cloud.remote['custom_quizzes.json'] = [{ ...quiz }]
        cloud.configured = true
        cloud.failWrite = true
        await updateCustomQuiz(quiz.id, patchOf({ name: 'Newest local' }))
        cloud.failWrite = false
        expect(cloud.remote['custom_quizzes.json'][0].name).toBe('Shared')

        expect((await getCustomQuizById(quiz.id))?.name).toBe('Newest local')
        const list = await getCustomQuizzes('alice')
        expect(list.map(q => q.name)).toEqual(['Newest local'])
        expect(localQuizzes()).toHaveLength(1)
    })

    it('still adopts a newer remote record over a stale local copy', async () => {
        const quiz = await createCustomQuiz('alice', 'Shared', '', [])
        cloud.configured = true
        // Another device edited the same quiz after this device last saw it.
        cloud.remote['custom_quizzes.json'] = [{
            ...quiz,
            name: 'Newer remote',
            updatedAt: quiz.updatedAt + 60_000,
            lineage: [quiz.updatedAt]
        }]

        expect((await getCustomQuizById(quiz.id))?.name).toBe('Newer remote')
        expect(localQuizzes()).toHaveLength(1)
    })

    it('preserves both versions when two devices diverge, and syncs both', async () => {
        const base = await createCustomQuiz('alice', 'Shared', '', [])
        cloud.configured = true
        cloud.failWrite = true
        // This device edits offline, branching from the last synced revision.
        await updateCustomQuiz(base.id, patchOf({ name: 'Edited on phone' }))
        cloud.failWrite = false
        // The other device branched from that same revision and edited later, so
        // neither record descends from the other.
        cloud.remote['custom_quizzes.json'] = [
            { ...base, name: 'Edited on laptop', updatedAt: base.updatedAt + 60_000 }
        ]

        const list = await getCustomQuizzes('alice')
        const winner = list.find(q => q.id === base.id)
        const preserved = list.find(q => q.conflict_of === base.id)
        expect(winner?.name).toBe('Edited on laptop')
        expect(preserved?.name).toBe('Edited on phone (conflict copy)')
        expect(preserved?.description).toBe(winner?.description)
        // Re-reading the same divergence must not pile up a second copy.
        expect(await getCustomQuizzes('alice')).toHaveLength(2)

        // The next sync uploads both versions instead of overwriting one.
        expect(await syncLocalToCloud()).toBe(true)
        expect(cloud.remote['custom_quizzes.json'].map((q: any) => q.name).sort())
            .toEqual(['Edited on laptop', 'Edited on phone (conflict copy)'])
    })

    it('loads legacy records that carry no revision without reporting a conflict', async () => {
        const legacy = { id: 'legacy-1', user_id: 'alice', name: 'Legacy', description: '', words: [], is_public: false, author_name: null, created_at: '2020-01-01' }
        store.set(accountKey('oquiz:custom_quizzes'), JSON.stringify([legacy]))
        cloud.configured = true

        // Stamped on Drive, unstamped locally: same content, so nothing is lost
        // and no conflict copy is created.
        cloud.remote['custom_quizzes.json'] = [{ ...legacy, updatedAt: 1_000 }]
        const list = await getCustomQuizzes('alice')
        expect(list).toHaveLength(1)
        expect(list[0].updatedAt).toBe(1_000)
        expect(localQuizzes()).toHaveLength(1)

        // Unstamped on both sides: unchanged legacy behaviour, still no conflict.
        cloud.remote['custom_quizzes.json'] = [{ ...legacy }]
        expect(await getCustomQuizzes('alice')).toHaveLength(1)
        expect(localQuizzes()).toHaveLength(1)
    })
})
