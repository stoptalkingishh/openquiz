import { normalizeImportedQuizItems } from './db'
import { Word, QuizQuestion } from './satTypes'
import { readAccountData, writeAccountData } from './storage'
import { getDriveToken } from './drive'

export type AiProvider = 'openai' | 'gemini'

export interface AiSettings {
    provider: AiProvider
    apiKey: string
    baseUrl: string
    model: string
}

const AI_SETTINGS_KEY = 'oquiz:ai_settings'

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

const DEFAULT_SETTINGS: AiSettings = {
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: DEFAULT_OPENAI_MODEL
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_MAX_ATTEMPTS = 3

function readJson<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback
    try {
        return readAccountData(key, fallback)
    } catch {
        return fallback
    }
}

function writeJson(key: string, value: unknown) {
    if (typeof window === 'undefined') return
    writeAccountData(key, value)
}

export function getAiSettings(): AiSettings {
    const stored = readJson<Partial<AiSettings>>(AI_SETTINGS_KEY, {})
    return {
        provider: stored.provider === 'gemini' ? 'gemini' : 'openai',
        apiKey: stored.apiKey || DEFAULT_SETTINGS.apiKey,
        baseUrl: stored.baseUrl || DEFAULT_SETTINGS.baseUrl,
        model: stored.model || (stored.provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_SETTINGS.model)
    }
}

export function saveAiSettings(s: AiSettings) {
    writeJson(AI_SETTINGS_KEY, {
        provider: s.provider === 'gemini' ? 'gemini' : 'openai',
        apiKey: s.apiKey,
        baseUrl: s.baseUrl || DEFAULT_SETTINGS.baseUrl,
        model: s.model || (s.provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_SETTINGS.model)
    })
}

const SYSTEM_PROMPT = `You are a quiz generator for a study app. Given the user's notes or source text, produce a set of study items as JSON.

Respond with ONLY a valid JSON array and nothing else — no markdown fences, no explanations, no commentary.

Each item in the array must be exactly one of two shapes:

1. A vocabulary term:
{"word": "term", "ru": "definition", "synonyms": ["...", "..."], "simple_examples": ["...", "..."], "advanced_example": "...", "confusions": ["...", "..."]}

2. A multiple-choice question:
{"kind": "multiple_choice", "prompt": "...", "options": ["...", "..."], "correctIndex": 0, "explanation": "..."}

Rules:
- For vocabulary terms, "ru" holds the definition, "synonyms" holds 2-5 similar words, "simple_examples" holds 1-3 short sentences, "advanced_example" holds a single SAT-style cloze sentence with one blank written as ____, and "confusions" holds 3-7 same-part-of-speech distractor words.
- For questions, "options" must have at least 2 entries and "correctIndex" is the zero-based index of the correct option.
- Use only straight ASCII double quotes. No line breaks inside a string value. No trailing commas. No comments.`

export async function generateQuizFromNotes(
    notes: string,
    s: AiSettings
): Promise<{ words: Word[]; questions: QuizQuestion[] }> {
    if (s.provider === 'gemini') return generateWithGemini(notes, s)
    return generateWithOpenAI(notes, s)
}

/** Builds a complete-replacement request while keeping the original source visible to the model. */
export function buildQuizRevisionPrompt(
    sourceNotes: string,
    current: { words?: Word[]; questions?: QuizQuestion[] },
    instructions: string
) {
    const existing = current.questions?.length ? current.questions : (current.words || [])
    return [
        'Original source notes:', sourceNotes.trim().slice(0, 12000),
        '',
        'Current quiz content. Return a complete replacement, keeping useful material unless the revision request says otherwise:',
        JSON.stringify(existing).slice(0, 16000),
        '',
        'Revision request:', instructions.trim() || 'Improve accuracy, clarity, coverage, and answer choices while preserving the subject.'
    ].join('\n')
}

async function generateWithOpenAI(notes: string, s: AiSettings): Promise<{ words: Word[]; questions: QuizQuestion[] }> {
    if (!s.apiKey) {
        throw new Error('Add an API key in the AI settings first.')
    }

    let res: Response
    const endpoint = new URL(`${s.baseUrl.replace(/\/+$/, '')}/chat/completions`)
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) {
        throw new Error('Use an HTTPS API URL (or localhost for a local model).')
    }
    try {
        res = await fetch(endpoint, {
            signal: AbortSignal.timeout(60000),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${s.apiKey}`
            },
            body: JSON.stringify({
                model: s.model,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: notes }
                ]
            })
        })
    } catch {
        throw new Error('Could not reach the AI API. Check your base URL and connection.')
    }

    if (!res.ok) {
        throw new Error(`AI request failed (status ${res.status}). Check your settings and try again.`)
    }

    let data: any
    try {
        data = await res.json()
    } catch {
        throw new Error('The AI returned an unreadable response.')
    }

    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
        throw new Error('The AI returned no content.')
    }

    return parseGeneratedContent(content)
}

async function generateWithGemini(notes: string, s: AiSettings): Promise<{ words: Word[]; questions: QuizQuestion[] }> {
    const usingGoogleAccount = !s.apiKey.trim()
    const token = usingGoogleAccount ? await getDriveToken() : ''
    if (usingGoogleAccount && !token) throw new Error('Sign in with Google to use Gemini without an API key.')

    const model = s.model || DEFAULT_GEMINI_MODEL
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    }
    if (usingGoogleAccount) {
        headers.Authorization = `Bearer ${token}`
        const projectId = process.env.NEXT_PUBLIC_GOOGLE_PROJECT_ID || ''
        if (projectId) headers['x-goog-user-project'] = projectId
    } else headers['x-goog-api-key'] = s.apiKey.trim()

    let res: Response
    try {
        res = await fetchWithRetry(() => fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
            signal: AbortSignal.timeout(60000),
            method: 'POST',
            headers,
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: notes }] }],
                generationConfig: { responseMimeType: 'application/json' }
            })
        }), GEMINI_MAX_ATTEMPTS)
    } catch {
        throw new Error('Could not reach Google Gemini. Check your connection.')
    }

    if (!res.ok) {
        const detail = await readApiError(res)
        if (res.status === 401 || res.status === 403) {
            const guidance = usingGoogleAccount
                ? 'Google account access was rejected. Sign in again or add a Gemini API key as a fallback.'
                : 'Gemini rejected the API key or its permissions. Check the key in Google AI Studio.'
            throw new Error(`${guidance}${detail ? ` ${detail}` : ''}`)
        }
        if (res.status === 429) {
            throw new Error(`Gemini rate limit reached. Wait a moment and try again.${detail ? ` ${detail}` : ''}`)
        }
        if (res.status >= 500) {
            throw new Error(`Gemini is temporarily unavailable after ${GEMINI_MAX_ATTEMPTS} attempts. Try again shortly.${detail ? ` ${detail}` : ''}`)
        }
        throw new Error(`Gemini request failed (status ${res.status}).${detail ? ` ${detail}` : usingGoogleAccount ? ' Try again or add a Gemini API key as a fallback.' : ' Check the model and API key settings.'}`)
    }

    let data: any
    try {
        data = await res.json()
    } catch {
        throw new Error('Gemini returned an unreadable response.')
    }

    const content = (data?.candidates?.[0]?.content?.parts || [])
        .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
    if (!content.trim()) {
        throw new Error('Gemini returned no content.')
    }

    return parseGeneratedContent(content)
}

async function fetchWithRetry(request: () => Promise<Response>, maxAttempts: number): Promise<Response> {
    let response: Response | null = null
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        response = await request()
        if (response.ok || !isTransientStatus(response.status) || attempt === maxAttempts - 1) return response
        await waitForRetry(response, attempt)
    }
    return response!
}

function isTransientStatus(status: number): boolean {
    return status === 408 || status === 429 || status >= 500
}

async function waitForRetry(response: Response, attempt: number): Promise<void> {
    const retryAfter = Number(response.headers.get('retry-after'))
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 10_000)
        : 250 * 2 ** attempt + Math.floor(Math.random() * 100)
    await new Promise<void>(resolve => setTimeout(resolve, delay))
}

async function readApiError(response: Response): Promise<string> {
    try {
        const body = await response.json()
        const message = body?.error?.message
        if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 300)
    } catch {
        // The status remains useful even when the provider sends no JSON error body.
    }
    return ''
}

function parseGeneratedContent(content: string): { words: Word[]; questions: QuizQuestion[] } {
    let parsed: any
    try {
        parsed = JSON.parse(stripMarkdownFences(content))
    } catch {
        throw new Error('The AI response was not valid JSON. Try again.')
    }

    if (!Array.isArray(parsed)) {
        throw new Error('The AI response must be a JSON array.')
    }

    const { words, questions, errors } = normalizeImportedQuizItems(parsed)
    if (errors.length) throw new Error(`The AI returned invalid quiz items: ${errors.slice(0, 3).join('; ')}`)
    if (!words.length && !questions.length) {
        throw new Error('The AI did not return any usable quiz items.')
    }

    return { words, questions }
}

function stripMarkdownFences(text: string): string {
    const trimmed = text.trim()
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
    return match ? match[1] : trimmed
}
