import { afterEach, describe, expect, it, vi } from 'vitest'
const googleToken = vi.hoisted(() => ({ value: 'google-account-token' as string | null }))
vi.mock('../app/lib/drive', () => ({ getDriveToken: () => Promise.resolve(googleToken.value) }))
import { buildPlannedQuizPrompt, buildQuizRevisionPrompt, detectExistingQuizItems, generateQuizFromNotes, mergeGeneratedQuizItems, planQuizzesFromMaterial, DEFAULT_GEMINI_MODEL, GEMINI_MODEL_FALLBACKS, type AiSettings } from '../app/lib/ai'

const geminiSettings: AiSettings = {
    provider: 'gemini',
    apiKey: 'test-gemini-key',
    baseUrl: '',
    model: 'gemini-2.0-flash'
}

const generatedQuiz = [{
    kind: 'multiple_choice',
    prompt: 'Pick the right answer',
    options: ['A', 'B'],
    correctIndex: 0
}]

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    googleToken.value = 'google-account-token'
})

describe('Gemini quiz generation', () => {
    it('includes source, existing content, and revision instructions in a revision request', () => {
        const prompt = buildQuizRevisionPrompt('Network notes', { questions: generatedQuiz as any }, 'Add DNS coverage')
        expect(prompt).toContain('Network notes')
        expect(prompt).toContain('Pick the right answer')
        expect(prompt).toContain('Add DNS coverage')
        expect(prompt).toContain('complete replacement')
    })

    it('recognizes a JSON question bank and asks for new non-duplicate coverage', () => {
        const source = JSON.stringify(generatedQuiz)
        expect(detectExistingQuizItems(source)?.questions).toHaveLength(1)
        const prompt = buildPlannedQuizPrompt(source, { title: 'Networking', description: '', tags: [], scope: 'Networking', questionCount: 8 })
        expect(prompt).toContain('NEW, non-duplicate')
    })

    it('keeps existing questions and drops duplicate AI additions when augmenting', () => {
        const merged = mergeGeneratedQuizItems({ questions: generatedQuiz as any }, {
            words: [],
            questions: [generatedQuiz[0] as any, { id: 'new', kind: 'multiple_choice', prompt: 'New coverage', options: ['A', 'B'], correctIndex: 0 }]
        })
        expect(merged.questions.map(question => question.prompt)).toEqual(['Pick the right answer', 'New coverage'])
    })

    it('turns a material-planning response into bounded, usable quiz sections', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ overview: 'A course', quizzes: [{ title: 'Chapter 1', description: 'Basics', tags: ['networking'], scope: 'TCP and UDP', questionCount: 99 }] }) }] } }]
        }), { status: 200 })))
        await expect(planQuizzesFromMaterial('course text', geminiSettings)).resolves.toEqual({
            overview: 'A course', quizzes: [{ title: 'Chapter 1', description: 'Basics', tags: ['networking'], scope: 'TCP and UDP', questionCount: 25 }]
        })
    })
    it('uses a Gemini API key and requests JSON output', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(generatedQuiz) }] } }]
        }), { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(generateQuizFromNotes('notes', geminiSettings)).resolves.toMatchObject({ questions: [expect.objectContaining({ prompt: 'Pick the right answer' })] })

        expect(fetchMock).toHaveBeenCalledOnce()
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(init.headers).toMatchObject({ 'x-goog-api-key': 'test-gemini-key' })
        expect(JSON.parse(init.body as string).generationConfig).toEqual({ responseMimeType: 'application/json' })
    })

    it('retries transient Gemini failures before returning generated content', async () => {
        vi.useFakeTimers()
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'temporarily overloaded' } }), { status: 503 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: JSON.stringify(generatedQuiz) }] } }]
            }), { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        const result = generateQuizFromNotes('notes', geminiSettings)
        await vi.advanceTimersByTimeAsync(500)

        await expect(result).resolves.toMatchObject({ questions: [expect.objectContaining({ kind: 'multiple_choice' })] })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('reports a rejected key with the provider detail and does not retry it', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            error: { message: 'API key not valid. Please pass a valid API key.' }
        }), { status: 403 }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(generateQuizFromNotes('notes', geminiSettings)).rejects.toThrow('Gemini rejected the API key or its permissions. Check the key in Google AI Studio. API key not valid.')
        expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('uses the signed-in Google account when no Gemini API key is supplied', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(generatedQuiz) }] } }]
        }), { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(generateQuizFromNotes('notes', { ...geminiSettings, apiKey: '  ' })).resolves.toMatchObject({ questions: [expect.anything()] })
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(init.headers).toMatchObject({ Authorization: 'Bearer google-account-token' })
    })

    it('asks the user to sign in when no API key or Google token is available', async () => {
        googleToken.value = null
        await expect(generateQuizFromNotes('notes', { ...geminiSettings, apiKey: '' })).rejects.toThrow('Sign in with Google to use Gemini without an API key.')
    })
})

// Google retires models on a schedule the app does not control, so a stored
// model name can go stale between releases. These cover the behaviour that
// turns a retirement into a slower request instead of a dead feature.
describe('Gemini model retirement handling', () => {
    const okBody = () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(generatedQuiz) }] } }]
    }), { status: 200 })

    const notFound = () => new Response(JSON.stringify({
        error: { message: 'models/gemini-2.0-flash is not found for API version v1beta, or is not supported for generateContent.' }
    }), { status: 404 })

    it('falls back to the next supported model when the chosen one is retired', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(notFound())
            .mockResolvedValueOnce(okBody())
        vi.stubGlobal('fetch', fetchMock)

        await expect(generateQuizFromNotes('notes', { ...geminiSettings, model: 'gemini-2.0-flash' }))
            .resolves.toMatchObject({ questions: [expect.anything()] })

        expect(fetchMock).toHaveBeenCalledTimes(2)
        const [secondUrl] = fetchMock.mock.calls[1] as unknown as [string]
        expect(secondUrl).toContain(encodeURIComponent(DEFAULT_GEMINI_MODEL))
    })

    it('tries every supported model before giving up', async () => {
        const fetchMock = vi.fn(async () => notFound())
        vi.stubGlobal('fetch', fetchMock)

        await expect(generateQuizFromNotes('notes', { ...geminiSettings, model: 'gemini-2.0-flash' }))
            .rejects.toThrow(/no longer available/i)

        // The retired choice plus each supported fallback.
        expect(fetchMock).toHaveBeenCalledTimes(GEMINI_MODEL_FALLBACKS.length + 1)
    })

    it('does not fall back on an error that is not about the model', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            error: { message: 'API key not valid' }
        }), { status: 403 }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(generateQuizFromNotes('notes', geminiSettings)).rejects.toThrow(/API key/i)
        // A rejected key would fail identically on every candidate.
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('keeps a newer model the visitor chose instead of overriding it', async () => {
        const fetchMock = vi.fn(async () => okBody())
        vi.stubGlobal('fetch', fetchMock)

        await expect(generateQuizFromNotes('notes', { ...geminiSettings, model: 'gemini-9.9-flash' }))
            .resolves.toMatchObject({ questions: [expect.anything()] })
        const [url] = fetchMock.mock.calls[0] as unknown as [string]
        expect(url).toContain(encodeURIComponent('gemini-9.9-flash'))
    })
})
