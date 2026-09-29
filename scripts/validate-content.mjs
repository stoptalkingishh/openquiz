#!/usr/bin/env node
/**
 * Content integrity validator for bundled quiz data (audit finding A-04).
 *
 * Guards against the class of defect where an exam advertises N questions but
 * the file is the same small prompt block repeated to reach N. Concretely it
 * reports, for every bundled question file:
 *
 *   - total question count and unique (normalized) prompt count
 *   - the within-file duplication ratio
 *   - pairwise prompt overlap between exam variants of the same category
 *
 * and fails (exit 1) when:
 *   - a file contains a duplicate normalized prompt  (error)
 *   - two variants of the same exam series overlap more than the configured
 *     share of their prompts                          (error)
 *
 * Normalization is deliberately conservative: trim, collapse internal
 * whitespace runs to a single space, and lowercase. Two prompts that differ
 * only in casing or spacing are treated as the same question.
 *
 * Usage:
 *   node scripts/validate-content.mjs              # validate + report
 *   node scripts/validate-content.mjs --json       # machine-readable report
 *   node scripts/validate-content.mjs --max-overlap 0.2
 *
 * Intended to be wired into CI via an npm script (see README follow-up);
 * the package.json entry is intentionally left for the repo owner to add.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Exam series that ship multiple variants intended to be taken independently.
 * Keyed by category -> the files that form one variant family. A "final" exam
 * is intentionally cumulative, so it is compared separately (see CUMULATIVE).
 */
const EXAM_SERIES = {
    netplus: {
        variants: [
            'public/netplus/netplus-test1.json',
            'public/netplus/netplus-test2.json',
            'public/netplus/netplus-test3.json',
        ],
        // Cumulative exams legitimately restate earlier material, so a high
        // overlap is expected and is reported but never failed.
        cumulative: ['public/netplus/netplus-final.json'],
    },
}

/** Any two variants sharing more than this fraction of prompts is a failure. */
const DEFAULT_MAX_OVERLAP = 0.3

/**
 * Collapse a prompt to its comparison key.
 * @param {unknown} prompt
 * @returns {string}
 */
export function normalizePrompt(prompt) {
    return String(prompt ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
}

/**
 * The field that identifies an item within a bundled file. Question-shaped
 * files use `prompt`; vocabulary decks (SAT) key on `word`, and flashcard
 * decks may carry either, so fall back in that order.
 * @param {{prompt?: unknown, word?: unknown, title?: unknown}} item
 */
export function labelOf(item) {
    if (item?.prompt != null && String(item.prompt).trim()) return item.prompt
    if (item?.word != null && String(item.word).trim()) return item.word
    return item?.title ?? ''
}

/**
 * Group items by normalized prompt.
 * @param {Array<{prompt?: unknown}>} items
 * @returns {Map<string, number[]>} normalized prompt -> 0-based indices
 */
export function groupByPrompt(items) {
    /** @type {Map<string, number[]>} */
    const groups = new Map()
    items.forEach((item, index) => {
        const key = normalizePrompt(labelOf(item))
        const bucket = groups.get(key)
        if (bucket) bucket.push(index)
        else groups.set(key, [index])
    })
    return groups
}

/**
 * Find prompts that appear more than once in a single collection.
 * @param {Array<{id?: string, prompt?: unknown}>} items
 * @returns {Array<{prompt: string, count: number, ids: string[]}>}
 */
export function findDuplicates(items) {
    const duplicates = []
    for (const [prompt, indices] of groupByPrompt(items)) {
        if (indices.length > 1) {
            duplicates.push({
                prompt,
                count: indices.length,
                ids: indices.map(i => String(items[i]?.id ?? `#${i}`)),
            })
        }
    }
    return duplicates
}

/**
 * Jaccard-style overlap between two prompt sets, expressed as the share of the
 * *smaller* set that is also present in the larger one. This is the intuitive
 * "how much of exam A have I already seen in exam B" number, and it is
 * asymmetric in the size ratio but bounded to [0, 1].
 * @param {Set<string>} a
 * @param {Set<string>} b
 */
export function overlapRatio(a, b) {
    if (!a.size || !b.size) return 0
    let shared = 0
    for (const key of a) if (b.has(key)) shared++
    return shared / Math.min(a.size, b.size)
}

/**
 * Load a bundled question file, tolerating both array and {questions: []}.
 * @param {string} relPath
 */
export function loadQuestions(relPath) {
    const abs = join(ROOT, relPath)
    if (!existsSync(abs)) return null
    const raw = JSON.parse(readFileSync(abs, 'utf8'))
    if (Array.isArray(raw)) return raw
    if (Array.isArray(raw?.questions)) return raw.questions
    if (Array.isArray(raw?.words)) return raw.words
    return null
}

/** Every bundled question-shaped data file, discovered from disk. */
function discoverQuestionFiles() {
    const files = []
    for (const dir of ['public/netplus', 'public/sat', 'public/securityplus']) {
        const abs = join(ROOT, dir)
        if (!existsSync(abs)) continue
        for (const name of readdirSync(abs).sort()) {
            if (!name.endsWith('.json')) continue
            if (name === 'quiz-sets.json') continue
            files.push(`${dir}/${name}`)
        }
    }
    return files
}

/**
 * Run the full audit.
 * @param {{maxOverlap?: number}} [options]
 */
export function runValidation(options = {}) {
    const maxOverlap = options.maxOverlap ?? DEFAULT_MAX_OVERLAP
    /** @type {any[]} */
    const files = []
    /** @type {string[]} */
    const errors = []
    /** @type {string[]} */
    const warnings = []

    for (const relPath of discoverQuestionFiles()) {
        const items = loadQuestions(relPath)
        if (!items) {
            errors.push(`${relPath}: could not parse a question array from this file`)
            continue
        }

        const groups = groupByPrompt(items)
        const unique = groups.size
        const total = items.length
        const duplicates = findDuplicates(items)
        const dupRatio = total === 0 ? 0 : (total - unique) / total

        files.push({
            file: relPath,
            total,
            unique,
            duplicates: duplicates.length,
            duplicationRatio: dupRatio,
            duplicateSamples: duplicates.slice(0, 3),
        })

        if (duplicates.length) {
            errors.push(
                `${relPath}: ${duplicates.length} duplicated prompt(s) inside a single file ` +
                `(${total} questions, ${unique} unique, ${(dupRatio * 100).toFixed(1)}% duplicated)`,
            )
        }
    }

    const byFile = new Map(files.map(f => [f.file, f]))
    const setsByFile = new Map()
    for (const relPath of discoverQuestionFiles()) {
        const items = loadQuestions(relPath)
        if (items) setsByFile.set(relPath, new Set(groupByPrompt(items).keys()))
    }

    const overlaps = []
    for (const [category, series] of Object.entries(EXAM_SERIES)) {
        const variants = series.variants.filter(p => byFile.has(p))
        for (let i = 0; i < variants.length; i++) {
            for (let j = i + 1; j < variants.length; j++) {
                const a = variants[i]
                const b = variants[j]
                const ratio = overlapRatio(setsByFile.get(a), setsByFile.get(b))
                overlaps.push({ category, kind: 'variant', a, b, ratio })
                if (ratio > maxOverlap) {
                    errors.push(
                        `${category}: "${a}" and "${b}" share ${(ratio * 100).toFixed(1)}% of their ` +
                        `prompts (limit ${(maxOverlap * 100).toFixed(0)}%)`,
                    )
                }
            }
        }
        for (const cumulative of series.cumulative || []) {
            for (const variant of variants) {
                if (!setsByFile.has(cumulative)) continue
                const ratio = overlapRatio(setsByFile.get(cumulative), setsByFile.get(variant))
                overlaps.push({ category, kind: 'cumulative', a: cumulative, b: variant, ratio })
                if (ratio > maxOverlap) {
                    warnings.push(
                        `${category}: cumulative exam "${cumulative}" reuses ${(ratio * 100).toFixed(1)}% ` +
                        `of "${variant}" (expected for a cumulative final; not a failure)`,
                    )
                }
            }
        }
    }

    return { maxOverlap, files, overlaps, errors, warnings, ok: errors.length === 0 }
}

function pct(value) {
    return `${(value * 100).toFixed(1)}%`
}

function printHuman(report) {
    console.log('Content integrity report (audit A-04: bundled exam duplication)\n')
    console.log('Per-file duplication')
    console.log('-'.repeat(72))
    console.log('file'.padEnd(42) + 'total'.padStart(7) + 'unique'.padStart(9) + 'dup'.padStart(9))
    for (const f of report.files) {
        console.log(
            f.file.replace('public/', '').padEnd(42) +
            String(f.total).padStart(7) +
            String(f.unique).padStart(9) +
            pct(f.duplicationRatio).padStart(9),
        )
    }

    console.log('\nCross-file overlap')
    console.log('-'.repeat(72))
    if (!report.overlaps.length) console.log('(no exam series configured)')
    for (const o of report.overlaps) {
        const tag = o.kind === 'cumulative' ? ' (cumulative)' : ''
        console.log(
            `${o.a.replace('public/netplus/', '')} vs ${o.b.replace('public/netplus/', '')}` +
            `${tag}: ${pct(o.ratio)} shared` +
            (o.kind === 'variant' ? (o.ratio > report.maxOverlap ? '  <- OVER LIMIT' : '') : ''),
        )
    }

    if (report.warnings.length) {
        console.log('\nWarnings')
        for (const w of report.warnings) console.log(`  ! ${w}`)
    }

    console.log('\nResult')
    console.log('-'.repeat(72))
    if (report.ok) {
        console.log(`PASS: no duplicate prompts within a file, no variant overlap above ${pct(report.maxOverlap)}.`)
    } else {
        console.log(`FAIL: ${report.errors.length} problem(s):`)
        for (const e of report.errors) console.log(`  x ${e}`)
    }
}

function parseArgs(argv) {
    const options = { json: false, maxOverlap: DEFAULT_MAX_OVERLAP }
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--json') options.json = true
        else if (argv[i] === '--max-overlap') options.maxOverlap = Number(argv[++i])
    }
    if (!Number.isFinite(options.maxOverlap) || options.maxOverlap < 0 || options.maxOverlap > 1) {
        options.maxOverlap = DEFAULT_MAX_OVERLAP
    }
    return options
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
    const options = parseArgs(process.argv.slice(2))
    const report = runValidation({ maxOverlap: options.maxOverlap })
    if (options.json) console.log(JSON.stringify(report, null, 2))
    else printHuman(report)
    process.exit(report.ok ? 0 : 1)
}
