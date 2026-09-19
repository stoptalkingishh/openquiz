import { describe, it, expect } from 'vitest'
import { updateProgress, buildSession, buildTestSession, buildQuestionSession } from '../app/lib/session'
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

    it('keeps a generic display word separate from its scoped progress key', () => {
        const questions = [{
            id: 'q1', kind: 'flashcard', word: 'Display label', prompt: 'Prompt', answer: 'Answer'
        }] as QuizQuestion[]
        const result = buildQuestionSession('drill', questions, {}, undefined, 'quiz-a')
        expect(result[0]?.word).toBe('Display label')
        expect((result[0] as Question & { progressKey?: string }).progressKey).toBe('quiz-a::q1')
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
