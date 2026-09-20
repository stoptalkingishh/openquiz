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

const DEFAULT_SETTINGS: AiSettings = {
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

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
    const token = await getDriveToken()
    if (!token) {
        throw new Error('Sign in with Google to use Gemini AI.')
    }

    const model = s.model || DEFAULT_GEMINI_MODEL
    const projectId = process.env.NEXT_PUBLIC_GOOGLE_PROJECT_ID || ''
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    }
    if (projectId) headers['x-goog-user-project'] = projectId

    let res: Response
    try {
        res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
            signal: AbortSignal.timeout(60000),
            method: 'POST',
            headers,
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: notes }] }]
            })
        })
    } catch {
        throw new Error('Could not reach Google Gemini. Check your connection.')
    }

    if (!res.ok) {
        // 401/403 usually means the signed-in session predates the Gemini
        // scope — re-signing in grants the AI permission.
        if (res.status === 401 || res.status === 403) {
            throw new Error('Sign in with Google again to grant Gemini AI access.')
        }
        throw new Error(`Gemini request failed (status ${res.status}). Try again.`)
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
