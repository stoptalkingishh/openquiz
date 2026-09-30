import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkAdvertisedCounts, loadQuestions, runValidation } from '../scripts/validate-content.mjs'

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
        // It is reported on every run rather than exempted; when new final-exam
        // questions land, update this expectation together with the data.
        expect(report.findings.join('\n')).toMatch(/netplus-final\.json/)
    })
})
