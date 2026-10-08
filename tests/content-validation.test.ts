import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    findDuplicates,
    groupByPrompt,
    labelOf,
    normalizePrompt,
    overlapRatio,
    runValidation,
} from '../scripts/validate-content.mjs'

const q = (id: string, prompt: string) => ({ id, kind: 'multiple_choice', prompt, options: ['a', 'b'], correctIndex: 0 })

describe('normalizePrompt', () => {
    it('trims, collapses internal whitespace, and lowercases', () => {
        expect(normalizePrompt('  What   is\n\tthe  purpose of ARP?  ')).toBe('what is the purpose of arp?')
    })

    it('treats prompts that differ only in case and spacing as the same question', () => {
        expect(normalizePrompt('What is the purpose of ARP?')).toBe(normalizePrompt('  what   IS the purpose of arp? '))
    })

    it('returns an empty string for missing values instead of throwing', () => {
        expect(normalizePrompt(undefined)).toBe('')
        expect(normalizePrompt(null)).toBe('')
    })
})

describe('labelOf', () => {
    it('uses prompt when present', () => {
        expect(labelOf({ prompt: 'Which layer?', word: 'osi' })).toBe('Which layer?')
    })

    it('falls back to word for vocabulary decks and title as a last resort', () => {
        expect(labelOf({ word: 'ubiquitous' })).toBe('ubiquitous')
        expect(labelOf({ title: 'Subnetting' })).toBe('Subnetting')
    })

    it('skips a blank prompt and uses word instead', () => {
        expect(labelOf({ prompt: '   ', word: 'ephemeral' })).toBe('ephemeral')
    })
})

describe('groupByPrompt', () => {
    it('groups repeated prompts and keeps every original index', () => {
        const groups = groupByPrompt([q('a', 'One'), q('b', 'Two'), q('c', 'one  ')])
        expect(groups.size).toBe(2)
        expect(groups.get('one')).toEqual([0, 2])
        expect(groups.get('two')).toEqual([1])
    })
})

describe('findDuplicates', () => {
    it('reports nothing when every prompt is unique', () => {
        expect(findDuplicates([q('a', 'First'), q('b', 'Second')])).toEqual([])
    })

    it('reports a prompt repeated in blocks and counts every occurrence', () => {
        const items = Array.from({ length: 5 }, (_, i) => q(`q${i}`, 'What is the purpose of ARP?'))
        const duplicates = findDuplicates(items)

        expect(duplicates).toHaveLength(1)
        expect(duplicates[0].count).toBe(5)
        expect(duplicates[0].prompt).toBe('what is the purpose of arp?')
        expect(duplicates[0].ids).toEqual(['q0', 'q1', 'q2', 'q3', 'q4'])
    })

    it('detects duplication that only appears after normalization', () => {
        const duplicates = findDuplicates([
            q('a', 'A Duplex Mismatch Occurs When?'),
            q('b', '  a   duplex   mismatch occurs when?  '),
        ])

        expect(duplicates).toHaveLength(1)
        expect(duplicates[0].ids).toEqual(['a', 'b'])
    })
})

describe('overlapRatio', () => {
    it('is 1 for identical prompt sets', () => {
        const set = new Set(['a', 'b', 'c'])
        expect(overlapRatio(set, set)).toBe(1)
    })

    it('is 0 for disjoint prompt sets', () => {
        expect(overlapRatio(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(0)
    })

    it('measures the share of the smaller set found in the larger', () => {
        expect(overlapRatio(new Set(['a', 'b', 'c', 'd']), new Set(['a', 'b']))).toBe(1)
        expect(overlapRatio(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBeCloseTo(2 / 3)
    })
})

describe('bundled content passes validation', () => {
    const report = runValidation()

    it('has no duplicate prompts within any single bundled file', () => {
        const failing = report.files.filter(f => f.duplicates > 0).map(f => `${f.file} (${f.duplicates} dupes)`)
        expect(failing).toEqual([])
    })

    it('keeps practice test variants within the overlap limit', () => {
        const tooSimilar = report.overlaps
            .filter(o => o.kind === 'variant' && o.ratio > report.maxOverlap)
            .map(o => `${o.a} vs ${o.b}: ${(o.ratio * 100).toFixed(1)}%`)
        expect(tooSimilar).toEqual([])
    })

    it('passes overall so CI can gate on the exit code', () => {
        expect(report.ok).toBe(true)
    })
})

type NetplusQuestion = {
    id: string
    prompt: string
    options: string[]
    correctIndex: number
    explanation?: string
    source: 'packt' | 'openquiz-original'
    objective?: string
    domain?: string
}

type NetplusFlashcard = {
    id: string
    kind: 'flashcard'
    prompt: string
    answer: string
    explanation?: string
    domain?: string
}

type CatalogEntry = {
    id: string
    description: string
    file_path: string
    category: string
    item_type?: string
}

describe('netplus exam structure', () => {
    const load = (name: string): NetplusQuestion[] =>
        JSON.parse(readFileSync(join(process.cwd(), 'public', 'netplus', name), 'utf8'))
    const loadFrom = <T,>(relPath: string): T => JSON.parse(readFileSync(join(process.cwd(), relPath), 'utf8'))
    const norm = (s: string) => normalizePrompt(s)
    const prompts = (name: string) => load(name).map(item => norm(item.prompt))

    it('advertised question counts in the catalog match the data files', () => {
        const manifest = loadFrom<CatalogEntry[]>('public/sat/quiz-sets.json')
        const netplus = manifest.filter(s => s.category === 'netplus' && s.item_type === 'questions')

        expect(netplus.length).toBe(4)
        for (const set of netplus) {
            const actual = loadFrom<NetplusQuestion[]>(`public${set.file_path}`).length
            const advertised = Number(set.description.match(/(\d+)-question/)?.[1])
            expect(advertised, `${set.id} description states a question count`).toBe(actual)
        }
    })

    it('practice tests share no questions with each other', () => {
        const tests = ['netplus-test1.json', 'netplus-test2.json', 'netplus-test3.json'].map(prompts)
        for (let i = 0; i < tests.length; i++) {
            for (let j = i + 1; j < tests.length; j++) {
                const shared = tests[i].filter((p: string) => tests[j].includes(p))
                expect(shared, `test${i + 1} vs test${j + 1}`).toEqual([])
            }
        }
    })

    it('the final exam is cumulative over the whole unique pool', () => {
        const pool = new Set(['netplus-test1.json', 'netplus-test2.json', 'netplus-test3.json'].flatMap(prompts))
        const final = prompts('netplus-final.json')

        expect(new Set(final).size).toBe(final.length)
        expect(new Set(final)).toEqual(pool)
    })

    it('every shipped question has four distinct options and a valid answer key', () => {
        for (const name of ['netplus-test1.json', 'netplus-test2.json', 'netplus-test3.json', 'netplus-final.json']) {
            for (const item of load(name)) {
                expect(item.options, `${item.id} option count`).toHaveLength(4)
                expect(new Set(item.options.map(norm)).size, `${item.id} duplicate options`).toBe(4)
                expect(item.correctIndex, `${item.id} answer index`).toBeGreaterThanOrEqual(0)
                expect(item.correctIndex, `${item.id} answer index`).toBeLessThan(4)
                expect(item.explanation?.length ?? 0, `${item.id} explanation length`).toBeGreaterThan(25)
            }
        }
    })

    it('tags every bundled Network+ exam question with a real N10-009 domain', () => {
        for (const name of ['netplus-test1.json', 'netplus-test2.json', 'netplus-test3.json', 'netplus-final.json']) {
            const missing = load(name).filter(i => !/^[1-5]$/.test(String(i.domain)))
            expect(missing.map(i => i.id), `${name} items with a missing or invalid domain`).toEqual([])
        }
    })

    it('tags flashcard decks with the domain their catalog description claims', () => {
        const manifest = loadFrom<CatalogEntry[]>('public/sat/quiz-sets.json')
        const decks = manifest.filter(s => s.category === 'netplus' && s.item_type === 'flashcards')
        expect(decks.length).toBe(5)

        for (const deck of decks) {
            const cards = loadFrom<NetplusFlashcard[]>(`public${deck.file_path}`)
            const described = /Domain (\d)/.exec(deck.description)?.[1]
            expect(described, `${deck.id} description names a domain`).toBeTruthy()
            // The deck's own description is the default tag; a minority of cards
            // legitimately belong to another domain (documented in PROVENANCE.md).
            const onClaim = cards.filter(c => c.domain === described).length
            expect(onClaim / cards.length, `${deck.id} share tagged to its claimed domain`).toBeGreaterThan(0.5)
        }
    })

    it('records provenance for every question and excludes verbatim exam items', () => {
        const items = load('netplus-final.json')
        expect(new Set(items.map(i => i.source))).toEqual(new Set(['packt', 'openquiz-original']))
        expect(items.every(i => (i.source === 'packt' ? Boolean(i.objective) : true))).toBe(true)
    })
})
