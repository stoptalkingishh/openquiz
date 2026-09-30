import { describe, it, expect } from 'vitest'
import { updateProgress, buildSession, buildTestSession, buildQuestionSession, buildWriteSession, scopeSessionProgress, progressKeyFor } from '../app/lib/session'
import { Word, WordProgress, QuizQuestion, Question } from '../app/lib/satTypes'
import { extractClozeCards } from '../app/lib/cloze'

function word(word: string, ru: string): Word {
    return { word, ru, synonyms: [], simple_examples: [], advanced_example: '', confusions: [] }
}

describe('updateProgress', () => {
    it('marks a first answer as learning, not new', () => {
        const progress = updateProgress(undefined, true, 'cat')
        expect(progress.status).toBe('learning')
    })

    it('raises strength on a correct answer and resets wrongStreak', () => {
        const progress = updateProgress(
            { word: 'cat', lastSeen: 0, strength: 0.5, wrongStreak: 3 },
            true,
            'cat'
        )
        expect(progress.strength).toBeGreaterThan(0.5)
        expect(progress.wrongStreak).toBe(0)
    })

    it('caps strength at 1', () => {
        const progress = updateProgress(
            { word: 'cat', lastSeen: 0, strength: 0.9 },
            true,
            'cat'
        )
        expect(progress.strength).toBe(1)
    })

    it('lowers strength on a wrong answer and increments wrongStreak', () => {
        const progress = updateProgress(undefined, false, 'cat')
        expect(progress.strength).toBe(0)
        expect(progress.wrongStreak).toBe(1)
    })

    it('floors strength at 0', () => {
        const progress = updateProgress(
            { word: 'cat', lastSeen: 0, strength: 0.1 },
            false,
            'cat'
        )
        expect(progress.strength).toBe(0)
        expect(progress.wrongStreak).toBe(1)
    })

    it('marks a word as mastered after repeated successful retention', () => {
        let progress: WordProgress | undefined
        for (let i = 0; i < 5; i++) progress = updateProgress(progress, true, 'cat', 4)
        expect(progress?.strength).toBeGreaterThanOrEqual(0.8)
        expect(progress?.repetitions).toBe(5)
        expect(progress?.status).toBe('mastered')
    })

    it('schedules later reviews as strength grows', () => {
        const weak = updateProgress(undefined, true, 'cat')
        let strong = updateProgress(undefined, true, 'cat', 4)
        strong = updateProgress(strong, true, 'cat', 4)
        strong = updateProgress(strong, true, 'cat', 4)
        expect(strong.nextDue!).toBeGreaterThan(weak.nextDue!)
    })

    it('resets repetitions and interval when self-rated below 3', () => {
        const progress = updateProgress(
            { word: 'cat', lastSeen: 0, strength: 0.8, ease: 2.5, repetitions: 4, interval: 20 },
            true,
            'cat',
            1
        )
        expect(progress.repetitions).toBe(0)
        expect(progress.interval).toBe(0)
        expect(progress.nextDue).toBe(progress.lastSeen)
    })

    it('maps a Hard self-rating (3) to ease ~2.36', () => {
        const progress = updateProgress(undefined, true, 'cat', 3)
        expect(progress.ease).toBeCloseTo(2.36, 2)
    })

    it('maps an Easy self-rating (5) to ease ~2.6', () => {
        const progress = updateProgress(undefined, true, 'cat', 5)
        expect(progress.ease).toBeCloseTo(2.6, 2)
    })

    it('floors ease at 1.3 even after repeated failures', () => {
        let progress: WordProgress | undefined = { word: 'cat', lastSeen: 0, strength: 0.9, ease: 1.5 }
        for (let i = 0; i < 5; i++) progress = updateProgress(progress, false, 'cat', 1)
        expect(progress?.ease).toBeGreaterThanOrEqual(1.3)
        expect(progress?.ease).toBe(1.3)
    })

    it('never lets strength fall below 0 on a self-rated failure', () => {
        const progress = updateProgress(
            { word: 'cat', lastSeen: 0, strength: 0.1 },
            false,
            'cat',
            1
        )
        expect(progress.strength).toBe(0)
        expect(progress.wrongStreak).toBe(1)
    })
})

describe('buildSession', () => {
    it('emits recall, simple_usage and sat_cloze in learn mode', () => {
        const questions = buildSession('learn', [word('cat', 'кошка')], {})
        const types = questions.map(q => q.type)
        expect(types).toContain('recall')
        expect(types).toContain('simple_usage')
        expect(types).toContain('sat_cloze')
        expect(questions).toHaveLength(3)
    })

    it('only draws words with wrongStreak > 0 in mistakes mode', () => {
        const words = [word('cat', 'кошка'), word('dog', 'собака')]
        const progressMap: Record<string, WordProgress> = {
            cat: { word: 'cat', lastSeen: 0, wrongStreak: 2 }
        }
        const questions = buildSession('mistakes', words, progressMap)
        expect(questions.length).toBeGreaterThan(0)
        expect(questions.every(q => q.word === 'cat')).toBe(true)
        expect(questions.every(q => q.type === 'sat_cloze')).toBe(true)
    })

    it('filters out malformed words', () => {
        const words: any[] = [
            word('cat', 'кошка'),
            { word: '', ru: 'x' },
            { ru: 'y' },
            { word: 'dog' },
            { word: 'bird', ru: 123 }
        ]
        const questions = buildSession('learn', words, {})
        expect(questions.every(q => q.word === 'cat')).toBe(true)
    })

    it('uses a definition clue when imported vocabulary has no usable example', () => {
        const minimal = word('eloquent', 'articulate and persuasive')
        minimal.simple_examples = ['She gave a speech.']
        const questions = buildSession('learn', [minimal], {})
        const cloze = questions.filter(q => q.type === 'simple_usage' || q.type === 'sat_cloze')
        expect(cloze).toHaveLength(2)
        for (const question of cloze) {
            expect(question.payload.sentence).toContain('_______')
            expect(question.payload.sentence).not.toContain('eloquent')
            expect(question.payload.sentence).toContain('articulate and persuasive')
        }
    })

    it('blanks every appearance of the answer in an example', () => {
        const repeated = word('eloquent', 'persuasive')
        repeated.simple_examples = ['An eloquent speech made eloquent points.']
        const questions = buildSession('learn', [repeated], {})
        const usage = questions.find(q => q.type === 'simple_usage')!
        expect(usage.payload.sentence).toBe('An _______ speech made _______ points.')
    })
})

describe('buildTestSession', () => {
    it('builds generic_mc and generic_written per valid word', () => {
        const words: any[] = [
            word('cat', 'кошка'),
            { word: '', ru: 'x' },
            { ru: 'y' },
            { word: 'dog' }
        ]
        const questions = buildTestSession(words, undefined, 100)
        expect(questions.map(q => q.type).sort()).toEqual(['generic_mc', 'generic_written'])
        expect(questions.every(q => q.word === 'cat')).toBe(true)
    })

    it('caps a vocabulary test at the requested number of questions', () => {
        const words = Array.from({ length: 25 }, (_, i) => word(`term${i}`, `meaning${i}`))
        const questions = buildTestSession(words, undefined, 20)
        expect(questions).toHaveLength(20)
        expect(questions.some(q => q.type === 'generic_mc')).toBe(true)
        expect(questions.some(q => q.type === 'generic_written')).toBe(true)
    })
})

describe('buildQuestionSession', () => {
    it('samples from the full quiz before applying the limit', () => {
        const questions: QuizQuestion[] = Array.from({ length: 80 }, (_, i) => ({
            id: `q${i}`, kind: 'flashcard', prompt: `Prompt ${i}`, answer: `Answer ${i}`
        }))
        const result = buildQuestionSession('drill', questions, {}, 20)
        expect(result).toHaveLength(20)
        expect(result.some(q => Number(q.word.slice(1)) >= 20)).toBe(true)
    })

    it('keeps due weak questions ahead of new questions', () => {
        const questions: QuizQuestion[] = Array.from({ length: 10 }, (_, i) => ({
            id: `q${i}`, kind: 'flashcard', prompt: `Prompt ${i}`, answer: `Answer ${i}`
        }))
        const progress: Record<string, WordProgress> = {
            q9: { word: 'q9', strength: 0.05, seenCount: 4, wrongStreak: 2, lastSeen: 1, nextDue: 1 }
        }
        const result = buildQuestionSession('drill', questions, progress, 1)
        expect(result[0]?.word).toBe('q9')
    })

    it('keeps a due card ahead of new cards when multiple are selected', () => {
        const questions: QuizQuestion[] = Array.from({ length: 6 }, (_, i) => ({
            id: `q${i}`, kind: 'flashcard', prompt: `Prompt ${i}`, answer: `Answer ${i}`
        }))
        const progress: Record<string, WordProgress> = {
            q5: { word: 'q5', strength: 0.1, seenCount: 3, wrongStreak: 2, lastSeen: 1, nextDue: 1 }
        }
        const result = buildQuestionSession('drill', questions, progress, 4)
        expect(result).toHaveLength(4)
        // The due/missed card must be selected and must come before every new card.
        expect(result.some(q => q.word === 'q5')).toBe(true)
        expect(result[0]?.word).toBe('q5')
    })

    it('turns generic multiple choice and true/false items into written answers in write mode', () => {
        const questions: QuizQuestion[] = [
            { id: 'mc', kind: 'multiple_choice', prompt: 'Pick', options: ['right', 'wrong'], correctIndex: 0 },
            { id: 'tf', kind: 'true_false', prompt: 'Decide', correctAnswer: true }
        ]
        const result = buildQuestionSession('write', questions, {})
        expect(result.every(q => q.type === 'generic_written')).toBe(true)
        expect(result.map(q => q.payload.answer).sort()).toEqual(['True', 'right'])
    })

    it('falls back to a bare progress key when the scoped key is absent', () => {
        const questions: QuizQuestion[] = [
            { id: 'q1', kind: 'flashcard', prompt: 'P', answer: 'A' }
        ]
        const progress: Record<string, WordProgress> = {
            q1: { word: 'q1', strength: 0.1, seenCount: 3, wrongStreak: 2, lastSeen: 1 }
        }
        // Under a scoped prefix the lookup must still find the bare `q1` entry
        // so a previously-missed question shows up in Mistakes mode.
        const result = buildQuestionSession('mistakes', questions, progress, undefined, '/sat/1.json')
        expect(result).toHaveLength(1)
        expect(result[0]?.word).toBe('q1')
    })

    it('keeps a generic display word separate from its scoped progress key', () => {
        const questions = [{
            id: 'q1', kind: 'flashcard', word: 'Display label', prompt: 'Prompt', answer: 'Answer'
        }] as (QuizQuestion & { word?: string })[]
        const result = buildQuestionSession('drill', questions, {}, undefined, 'quiz-a')
        expect(result[0]?.word).toBe('Display label')
        expect((result[0] as Question & { progressKey?: string }).progressKey).toBe('quiz-a::q1')
    })
})


describe('quiz-scoped vocabulary progress (issue #53)', () => {
    // Two decks that both teach "valid" with different definitions. Before
    // scoping, mastery, scheduling and mistake history for the shared spelling
    // leaked between them.
    const deckA: Word[] = [word('valid', 'legally binding'), word('vivid', 'bright and intense')]
    const deckB: Word[] = [word('valid', 'well founded in fact'), word('vivid', 'producing powerful feelings')]
    const pathA = '/custom/biology.json'
    const pathB = '/custom/grammar.json'

    it('keys every card by quiz path, not by the bare word', () => {
        const questions = buildSession('drill', deckA, {}, undefined, pathA)
        expect(questions.length).toBeGreaterThan(0)
        expect(questions.every(q => (q as Question & { progressKey?: string }).progressKey?.startsWith(pathA + '::'))).toBe(true)
    })

    it('keeps the same word in two quizzes on independent schedules', () => {
        const progress: Record<string, WordProgress> = {
            [progressKeyFor(pathA, 'valid')]: { word: 'valid', strength: 1, seenCount: 9, lastSeen: Date.now(), wrongStreak: 0, nextDue: Date.now() + 86400000, status: 'mastered' },
        }
        // Deck A: the scoped record is found, so "valid" is not treated as new.
        const aQuestions = buildSession('drill', deckA, progress, undefined, pathA)
        expect(aQuestions.some(q => q.word === 'valid')).toBe(true)

        // Deck B has no record for its own "valid", so the word is new there.
        const bQuestions = buildSession('drill', deckB, progress, undefined, pathB)
        expect(bQuestions.some(q => q.word === 'valid')).toBe(true)
        const bKeys = bQuestions.map(q => (q as Question & { progressKey?: string }).progressKey)
        expect(bKeys.every(key => key?.startsWith(pathB + '::'))).toBe(true)
        expect(bKeys).not.toContain(progressKeyFor(pathA, 'valid'))
    })

    it('honors legacy bare-word progress on the first read after upgrade', () => {
        const legacy: Record<string, WordProgress> = {
            valid: { word: 'valid', strength: 0.1, seenCount: 4, lastSeen: 0, wrongStreak: 2, nextDue: 0, status: 'learning' },
        }
        // A word with a wrong streak in the legacy bare record must still be
        // selectable in mistakes mode under the scoped lookup.
        const questions = buildSession('mistakes', deckA, legacy, undefined, pathA)
        expect(questions.some(q => q.word === 'valid')).toBe(true)
    })

    it('scopes write and test modes too', () => {
        const write = buildWriteSession(deckA, 20, pathA)
        expect(write.length).toBeGreaterThan(0)
        expect(write.every(q => (q as Question & { progressKey?: string }).progressKey?.startsWith(pathA + '::'))).toBe(true)

        const test = buildTestSession(deckA, undefined, 20, pathA)
        expect(test.length).toBeGreaterThan(0)
        expect(test.every(q => (q as Question & { progressKey?: string }).progressKey?.startsWith(pathA + '::'))).toBe(true)
    })

    it('leaves existing scoped keys untouched and no-ops without a prefix', () => {
        const existing = [{ id: 'q1', word: 'Deck Label', type: 'generic_mc' as const, progressKey: '/sat/1.json::q1', payload: { prompt: 'p' } }] as Question[]
        const stamped = scopeSessionProgress(existing, '/sat/2.json')
        expect(stamped[0].progressKey).toBe('/sat/1.json::q1')
        expect(scopeSessionProgress(existing, '')).toBe(existing)
    })

    it('produces no separator when no quiz path is given', () => {
        expect(progressKeyFor('', 'cat')).toBe('cat')
        expect(progressKeyFor('/sat/1.json', 'cat')).toBe('/sat/1.json::cat')
    })
})

describe('cloze cards', () => {
    it('creates one stable group card per deletion, including multiline answers', () => {
        const cards = extractClozeCards('First {{c1::alpha}} and\nsecond {{c2::beta\nvalue}}.')
        expect(cards).toEqual([
            { prompt: 'First _____ and\nsecond beta\nvalue.', answer: 'alpha' },
            { prompt: 'First alpha and\nsecond _____.', answer: 'beta\nvalue' }
        ])
    })
})
