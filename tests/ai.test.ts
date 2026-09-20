import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateQuizFromNotes, type AiSettings } from '../app/lib/ai'

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
})

describe('Gemini quiz generation', () => {
    it('uses a Gemini API key and requests JSON output', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(generatedQuiz) }] } }]
        }), { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(generateQuizFromNotes('notes', geminiSettings)).resolves.toMatchObject({ questions: [expect.objectContaining({ prompt: 'Pick the right answer' })] })

        expect(fetchMock).toHaveBeenCalledOnce()
        const [, init] = fetchMock.mock.calls[0]
        expect(init.headers).toMatchObject({ 'x-goog-api-key': 'test-gemini-key' })
        expect(JSON.parse(init.body).generationConfig).toEqual({ responseMimeType: 'application/json' })
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

    it('requires a Gemini API key before making a request', async () => {
        await expect(generateQuizFromNotes('notes', { ...geminiSettings, apiKey: '  ' })).rejects.toThrow('Add a Gemini API key in the AI settings first.')
    })
})
