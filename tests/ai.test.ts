import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPlannedQuizPrompt, buildQuizRevisionPrompt, detectExistingQuizItems, generateQuizFromNotes, mergeGeneratedQuizItems, planQuizzesFromMaterial, type AiSettings } from '../app/lib/ai'

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

    it('requires a Gemini API key before making a request', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        await expect(generateQuizFromNotes('notes', { ...geminiSettings, apiKey: '  ' })).rejects.toThrow('Add a Gemini API key in the AI settings first.')
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
