import { normalizeImportedQuizItems } from './db'

export const SHARE_URL_MAX_PAYLOAD = 12000
export const SHARE_FILE_MAX_BYTES = 5_000_000

export interface SharedQuiz {
    name: string
    description: string
    author_name?: string | null
    tags?: string[]
    words: any[]
    questions: any[]
}

/** Only quiz content is exported; account identifiers and AI source notes stay private. */
export function buildShareFile(quiz: Partial<SharedQuiz>): string {
    const { words, questions } = stripShareImages(quiz)
    return JSON.stringify({ name: quiz.name, description: quiz.description,
        author_name: quiz.author_name || null, tags: quiz.tags || [], words, questions })
}

export function parseSharedQuiz(text: string): SharedQuiz {
    if (text.length > SHARE_FILE_MAX_BYTES) throw new Error('This quiz is too large to import (maximum 5 MB).')
    let raw: any
    try { raw = JSON.parse(text) } catch { throw new Error('The shared quiz contains invalid JSON.') }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The shared quiz must be an OpenQuiz export object.')
    const normalized = normalizeImportedQuizItems([
        ...(Array.isArray(raw.words) ? raw.words : []),
        ...(Array.isArray(raw.questions) ? raw.questions : [])
    ])
    if (normalized.errors.length) throw new Error(`The shared quiz is invalid: ${normalized.errors.slice(0, 3).join(' ')}`)
    if (!normalized.words.length && !normalized.questions.length) throw new Error('The shared quiz contains no valid items.')
    return {
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Shared quiz',
        description: typeof raw.description === 'string' ? raw.description.trim() : '',
        author_name: typeof raw.author_name === 'string' ? raw.author_name.trim() : null,
        tags: Array.isArray(raw.tags) ? raw.tags.filter((tag: unknown) => typeof tag === 'string') : [],
        ...normalized
    }
}

export function downloadSharedQuiz(quiz: Partial<SharedQuiz>) {
    const url = URL.createObjectURL(new Blob([buildShareFile(quiz)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${(quiz.name || 'quiz').replace(/[^a-z0-9_-]/gi, '_')}.openquiz.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function withoutImage(item: any): any {
    if (item == null || typeof item !== 'object') return item
    const copy: Record<string, any> = {}
    for (const key of Object.keys(item)) {
        if (key === 'image') continue
        copy[key] = item[key]
    }
    return copy
}

export function stripShareImages(quiz: { words?: any[]; questions?: any[] }): { words: any[]; questions: any[] } {
    const words = Array.isArray(quiz.words)
        ? quiz.words.map((word) => withoutImage(word))
        : []
    const questions = Array.isArray(quiz.questions)
        ? quiz.questions.map((question) => {
            const stripped = withoutImage(question)
            if (stripped && Array.isArray(stripped.steps)) {
                stripped.steps = stripped.steps.map((step: any) => withoutImage(step))
            }
            return stripped
        })
        : []
    return { words, questions }
}

export function buildShareData(quiz: {
    id?: string | null
    name?: string
    description?: string
    author_name?: string | null
    tags?: string[]
    words?: any[]
    questions?: any[]
}): string | null {
    const payload = encodeURIComponent(buildShareFile(quiz))
    if (payload.length > SHARE_URL_MAX_PAYLOAD) return null
    return payload
}
