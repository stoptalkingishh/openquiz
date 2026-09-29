import { describe, expect, it } from 'vitest'
import { buildShareText } from '../app/lib/shareText'

const SAT_SPECIFIC_TERMS = ['sat', 's.a.t', 'sat vocabulary', 'digital evidence', 'expression', 'advanced math']

describe('buildShareText', () => {
    it('describes a question quiz without SAT-specific wording', () => {
        const text = buildShareText({
            name: 'Network+ Practice Test 1',
            words: [],
            questions: new Array(100).fill({})
        })

        expect(text).toBe('Try this quiz on OpenQuiz: Network+ Practice Test 1 (100 questions)')
        expect(text).not.toMatch(/SAT vocabulary/)
    })

    it('describes a Security+ quiz without SAT-specific wording', () => {
        const text = buildShareText({
            name: 'Security+ SY0-701 Final',
            words: [],
            questions: [{}, {}, {}]
        })

        expect(text).toContain('Security+ SY0-701 Final')
        expect(text).toContain('3 questions')
        for (const term of SAT_SPECIFIC_TERMS) {
            expect(text.toLowerCase()).not.toContain(term)
        }
    })

    it('describes a word-based custom quiz as vocabulary practice', () => {
        const text = buildShareText({
            name: 'My Biology Flashcards',
            words: new Array(25).fill({}),
            questions: []
        })

        expect(text).toBe('Try this vocabulary practice on OpenQuiz: My Biology Flashcards (25 words)')
        expect(text.toLowerCase()).not.toContain('sat')
    })

    it('falls back to neutral wording when the quiz has no items or name', () => {
        expect(buildShareText({ name: 'Empty Quiz' })).toBe('Try this quiz on OpenQuiz: Empty Quiz')
        expect(buildShareText({})).toBe('Try this quiz on OpenQuiz: this quiz')
    })

    it('never hard-codes SAT vocabulary in any produced share text', () => {
        const inputs = [
            { name: 'SAT Practice Test 5', words: [{}], questions: [] },
            { name: 'Custom Quiz', words: [], questions: [{}] },
            { name: 'No Items', words: [], questions: [] }
        ]

        for (const input of inputs) {
            expect(buildShareText(input)).not.toContain('SAT vocabulary')
        }
    })
})
