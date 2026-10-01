import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    checkAdvertisedCounts,
    checkDomains,
    loadQuestions,
    runValidation,
} from '../scripts/validate-content.mjs'

const ROOT = process.cwd()

/** Same shape the validator uses: a count, then adjectives, then the word "final". */
const FINAL_EXAM_CLAIM = new RegExp('([0-9]+)-question[^.]{0,80}?final', 'i')

function readmeFinalExamLine(marker: string): string {
    const lines = readFileSync(join(ROOT, 'README.md'), 'utf8').split('\n')
    const line = lines.find(l => l.includes(marker) && /final/i.test(l))
    expect(line, `README has no ${marker} line describing a final exam`).toBeTruthy()
    return String(line)
}

describe('advertised question counts', () => {
    it('match the bundled data files they describe', () => {
        expect(checkAdvertisedCounts()).toEqual([])
    })

    it('README Network+ final-exam claim matches the file', () => {
        const claimed = FINAL_EXAM_CLAIM.exec(readmeFinalExamLine('Network+'))
        expect(claimed, 'README states no question count for the Network+ final exam').toBeTruthy()
        const items = loadQuestions('public/netplus/netplus-final.json')
        expect(Number(claimed![1])).toBe(items.length)
    })

    it('README Security+ final-exam claim matches the file', () => {
        const claimed = FINAL_EXAM_CLAIM.exec(readmeFinalExamLine('Security+'))
        expect(claimed, 'README states no question count for the Security+ final exam').toBeTruthy()
        const items = loadQuestions('public/securityplus/final.json')
        expect(Number(claimed![1])).toBe(items.length)
    })
})

describe('bundled content integrity (audit A-04)', () => {
    it('passes: no in-file duplicates, no variant overlap, claims match', () => {
        const report = runValidation()
        expect(report.errors).toEqual([])
        expect(report.ok).toBe(true)
    })

    it('surfaces cumulative finals that add no questions of their own', () => {
        const report = runValidation()
        // Known content debt: the Network+ final is Practice Tests 1-3 restated.
        // It is reported on every run rather than exempted, and the report names
        // the issue that owns the decision. When new final-exam questions land,
        // delete the KNOWN_ZERO_ORIGINAL_FINALS entry and this expectation
        // together with the data.
        expect(report.findings.join('\n')).toMatch(/netplus-final\.json/)
    })

    it('registers that debt rather than passing it silently', () => {
        const report = runValidation()
        const debt = report.findings.filter(f => /KNOWN CONTENT DEBT/.test(f))
        expect(debt.length, 'every zero-original finding names its registered reason').toBeGreaterThan(0)
        expect(debt.join('\n')).toMatch(/issue #61/)
    })
})

describe('domain taxonomy and coverage', () => {
    const item = (domain?: string) => ({ id: `x-${Math.random()}`, prompt: 'Q?', domain })

    it('accepts each N10-009 domain and counts it', () => {
        const items = ['1', '2', '3', '4', '5'].map(d => item(d))
        const report = checkDomains('public/netplus/netplus-test1.json', items)

        expect(report.problems).toEqual([])
        expect(report.tagged).toBe(5)
        expect(report.counts).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 })
    })

    it('rejects a domain outside the vendor taxonomy', () => {
        const report = checkDomains('public/netplus/netplus-test1.json', [item('9')])

        expect(report.problems.join('\n')).toMatch(/not a CompTIA Network\+ N10-009 domain/)
    })

    it('rejects a non-numeric domain', () => {
        const report = checkDomains('public/netplus/netplus-test1.json', [item('fundamentals')])

        expect(report.problems.join('\n')).toMatch(/not a CompTIA Network\+ N10-009 domain/)
    })

    it('fails a file whose items are mostly untagged', () => {
        const items = Array.from({ length: 20 }, () => item())
        const report = checkDomains('public/netplus/netplus-test1.json', items)

        expect(report.untagged).toBe(20)
        expect(report.problems.join('\n')).toMatch(/carry no domain tag/)
    })

    it('tolerates a small number of deliberately untagged items', () => {
        const items = [...Array.from({ length: 9 }, () => item('1')), item()]
        const report = checkDomains('public/netplus/netplus-test1.json', items)

        expect(report.problems).toEqual([])
    })

    it('does not enforce a taxonomy on categories that have none', () => {
        const report = checkDomains('public/securityplus/test1.json', [item(), item()])

        expect(report.problems).toEqual([])
    })

    it('bundled Network+ content has no domain problems', () => {
        const report = runValidation()
        const netplus = report.domains.filter((d: { category: string }) => d.category === 'netplus')

        expect(netplus.length).toBeGreaterThan(0)
        expect(netplus.flatMap((d: { problems: string[] }) => d.problems)).toEqual([])
    })

    it('leaves untagged only the five items PROVENANCE.md names as ambiguous', () => {
        const ambiguous = ['fund-f34', 'fund-f42', 'impl-f26', 'ops-f22', 'ops-f30']
        const untagged: string[] = []
        for (const d of (runValidation().domains as any[]).filter(d => d.category === 'netplus')) {
            const items = loadQuestions(d.file) as Array<{ id: string; domain?: string }>
            untagged.push(...items.filter(i => i.domain === undefined).map(i => i.id))
        }

        expect(untagged.sort()).toEqual(ambiguous)
    })

    it('every bundled Network+ file is tagged, so coverage reporting is honest', () => {
        const report = runValidation()
        const untagged = report.domains
            .filter((d: { category: string }) => d.category === 'netplus')
            .flatMap((d: { file: string, untagged: number }) => (d.untagged ? [`${d.file}: ${d.untagged}`] : []))

        // The five remaining items are documented as deliberately ambiguous in
        // public/netplus/PROVENANCE.md. Nothing may be added to this list without
        // that file being updated.
        expect(untagged).toEqual([
            'public/netplus/netplus-fundamentals.json: 2',
            'public/netplus/netplus-implementation.json: 1',
            'public/netplus/netplus-operations.json: 2',
        ])
    })
})
