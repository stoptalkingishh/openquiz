/**
 * Content integrity validator for bundled quiz data (audit finding A-04).
 *
 * Note: no shebang on purpose. A `#!` line makes this file unparseable to the
 * test runner (esbuild rejects the hashbang when the module is imported rather
 * than executed), which previously made tests/content-validation.test.ts fail
 * to collect and hid every finding below from CI. Run it with `node`.
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
 *   - an advertised question count (README or the sets manifest) does not match
 *     the bundled file it describes                   (error)
 *
 * Thin content that is not a false claim is reported separately as a "finding"
 * (exit 0): a cumulative final that restates its practice tests without adding
 * a single new question is honest as long as the docs say so, but it should
 * never be invisible.
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
 * Wired into CI via `npm run validate-content` (see .github/workflows/ci.yml).
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
        // A cumulative exam may restate earlier material, so overlap is reported
        // rather than failed. Content that adds nothing new is surfaced as a
        // finding instead of passing silently (see runValidation).
        cumulative: ['public/netplus/netplus-final.json'],
    },
    securityplus: {
        variants: [
            'public/securityplus/test1.json',
            'public/securityplus/test2.json',
            'public/securityplus/test3.json',
        ],
        cumulative: ['public/securityplus/final.json'],
    },
}

/**
 * Categories whose advertised question counts appear in README prose, keyed by
 * the category the README line talks about, and the file that "final exam"
 * refers to within it.
 */
const README_FINAL_CLAIMS = {
    netplus: { marker: 'Network+', final: 'public/netplus/netplus-final.json' },
    securityplus: { marker: 'Security+', final: 'public/securityplus/final.json' },
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
 * Cross-check every question count the docs advertise against the bundled file
 * it describes. Catches the audit A-04 follow-on defect: a README that promises
 * a 100-question final exam while the data file holds 88.
 *
 * Two sources are checked: the per-set descriptions in the sets manifest, and
 * the bundled-content prose in README.md.
 *
 * @returns {string[]} one message per advertised count that does not match
 */
export function checkAdvertisedCounts() {
    const errors = []
    const actual = new Map()
    const countOf = (relPath) => {
        if (!actual.has(relPath)) {
            const items = loadQuestions(relPath)
            actual.set(relPath, items ? items.length : null)
        }
        return actual.get(relPath)
    }

    // 1. Sets manifest: "30-question CompTIA Network+ ... practice test".
    const manifestPath = join(ROOT, 'public', 'sat', 'quiz-sets.json')
    if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        for (const set of manifest) {
            const relPath = String(set.file_path || '').replace(/^\//, 'public/')
            const claimed = /(\d+)[- ]question/i.exec(String(set.description || ''))
            if (!claimed) continue
            const total = countOf(relPath)
            if (total === null) {
                errors.push(`${set.id}: manifest describes ${claimed[1]} questions but "${relPath}" is missing or unreadable`)
            } else if (Number(claimed[1]) !== total) {
                errors.push(
                    `${set.id}: manifest advertises ${claimed[1]} questions, "${relPath}" contains ${total}`,
                )
            }
        }
    }

    // 2. README prose: "… — 3 practice tests, a 100-question final exam, …".
    const readmePath = join(ROOT, 'README.md')
    if (existsSync(readmePath)) {
        const readme = readFileSync(readmePath, 'utf8')
        for (const [category, claim] of Object.entries(README_FINAL_CLAIMS)) {
            const lines = readme.split(/\r?\n/)
            const line = lines.find(l => l.includes(claim.marker) && /final/i.test(l))
            if (!line) continue
            // The count and the word "final" can be separated by adjectives, and a
            // final need not be called an "exam" ("an 88-question cumulative final").
            const claimed = /([0-9]+)-question[^.]{0,80}?final/i.exec(line)
            if (!claimed) {
                errors.push(
                    `README: the ${category} line mentions a final exam but states no question count`,
                )
                continue
            }
            const total = countOf(claim.final)
            if (total === null) {
                errors.push(`README: no readable file for the ${category} final exam ("${claim.final}")`)
            } else if (Number(claimed[1]) !== total) {
                errors.push(
                    `README: ${category} advertises a ${claimed[1]}-question final exam, ` +
                    `"${claim.final}" contains ${total}`,
                )
            }
        }
    }

    return errors
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
    /** @type {string[]} */
    const findings = []

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

    // Advertised counts must match the data (audit A-04 follow-on).
    errors.push(...checkAdvertisedCounts())

    // Content debt, not a false claim: a "cumulative" final that adds no prompt
    // of its own is a copy of its practice tests. Reported on every run so it
    // cannot quietly become the shipped exam.
    for (const [category, series] of Object.entries(EXAM_SERIES)) {
        for (const cumulative of series.cumulative || []) {
            const cumulativeSet = setsByFile.get(cumulative)
            if (!cumulativeSet) continue
            const variantSet = new Set()
            for (const variant of series.variants) {
                for (const prompt of setsByFile.get(variant) ?? []) variantSet.add(prompt)
            }
            let novel = 0
            for (const prompt of cumulativeSet) if (!variantSet.has(prompt)) novel++
            if (novel === 0) {
                findings.push(
                    `${category}: "${cumulative}" (${cumulativeSet.size} questions) adds 0 prompts of its own — ` +
                    `it is the practice tests restated, so a "final exam" pass measures recall of questions ` +
                    `the learner already saw`,
                )
            }
        }
    }

    return { maxOverlap, files, overlaps, errors, warnings, findings, ok: errors.length === 0 }
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

    if (report.findings?.length) {
        console.log('\nFindings (thin content, not a failed check)')
        for (const f of report.findings) console.log(`  * ${f}`)
    }

    if (report.warnings.length) {
        console.log('\nWarnings')
        for (const w of report.warnings) console.log(`  ! ${w}`)
    }

    console.log('\nResult')
    console.log('-'.repeat(72))
    if (report.ok) {
        console.log(
            `PASS: no duplicate prompts within a file, no variant overlap above ${pct(report.maxOverlap)}, ` +
            'every advertised question count matches its data file.',
        )
        if (report.findings?.length) {
            console.log(`${report.findings.length} finding(s) above are content debt and do not fail the check.`)
        }
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
