import { describe, it, expect } from 'vitest'
import { updateProgress, buildSession, buildTestSession } from '../app/lib/session'
import { Word, WordProgress } from '../app/lib/satTypes'

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
        expect(progress.strength).toBeCloseTo(0.65)
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

    it('marks a word as mastered once strength exceeds 0.8', () => {
        const progress = updateProgress(
            { word: 'cat', lastSeen: 0, strength: 0.7 },
            true,
            'cat'
        )
        expect(progress.strength).toBeCloseTo(0.85)
        expect(progress.status).toBe('mastered')
    })

    it('schedules later reviews as strength grows', () => {
        const weak = updateProgress(undefined, true, 'cat')
        const strong = updateProgress(
            { word: 'cat', lastSeen: 0, strength: 0.9 },
            true,
            'cat'
        )
        expect(strong.nextDue).toBeGreaterThan(weak.nextDue)
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
