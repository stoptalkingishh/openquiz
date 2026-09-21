import { describe, expect, it } from 'vitest'
import { buildShareData, buildShareFile, parseSharedQuiz, SHARE_URL_MAX_PAYLOAD } from '../app/lib/share'

const quiz = {
    id: 'owner-quiz-id', user_id: 'private-account', ai_source_prompt: 'Private uploaded notes',
    name: 'Networking', description: 'Unit exam', tags: ['networking'], author_name: 'Author',
    words: [{ word: 'Switch', ru: 'Connects a LAN', image: 'private-image' }],
    questions: [{ id: 'q', kind: 'multiple_choice', prompt: 'DNS port?', options: ['53', '80'], correctIndex: 0 }]
}

describe('portable quiz sharing', () => {
    it('round trips content and metadata across a link without private owner data', () => {
        const data = buildShareData(quiz)!
        const url = new URL('https://example.com/openquiz/quiz/share/#data=' + data)
        expect(url.search).toBe('')
        const text = new URLSearchParams(url.hash.slice(1)).get('data')!
        expect(text).not.toContain('private-account')
        expect(text).not.toContain('Private uploaded notes')
        expect(text).not.toContain('owner-quiz-id')
        expect(text).not.toContain('private-image')
        const parsed = parseSharedQuiz(text)
        expect(parsed).toMatchObject({ name: quiz.name, description: quiz.description, tags: quiz.tags, author_name: 'Author' })
        expect(parsed.questions).toHaveLength(2)
        expect(parsed.questions[0].answer).toBe('Connects a LAN')
        expect(parsed.questions[1].correctIndex).toBe(0)
    })
    it('supports file sharing when encoded links exceed the limit', () => {
        const large = { ...quiz, description: 'Ж'.repeat(SHARE_URL_MAX_PAYLOAD / 3) }
        expect(buildShareData(large)).toBeNull()
        expect(parseSharedQuiz(buildShareFile(large)).description).toBe(large.description)
    })
    it('rejects malformed, empty, oversized, and incorrect-answer imports', () => {
        expect(() => parseSharedQuiz('not json')).toThrow('invalid JSON')
        expect(() => parseSharedQuiz('{}')).toThrow('No items to import')
        expect(() => parseSharedQuiz('x'.repeat(5_000_001))).toThrow('too large')
        expect(() => parseSharedQuiz(JSON.stringify({ questions: [{ prompt: 'Bad', options: ['a', 'b'], correctIndex: 8 }] }))).toThrow('invalid')
    })
})
