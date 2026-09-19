import { describe, it, expect } from 'vitest'
import { normalizeImportedQuizItems, validateQuizJSON } from '../app/lib/db'

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
