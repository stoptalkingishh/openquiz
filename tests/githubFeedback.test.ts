import { describe, expect, it } from 'vitest'
import { buildQuizFeedbackUrl } from '../app/lib/githubFeedback'

describe('quiz feedback links', () => {
    it('creates a GitHub Issue draft with quiz context but no quiz answers', () => {
        const url = new URL(buildQuizFeedbackUrl({ quizName: 'Network+ Practice Test 1', quizUrl: 'https://example.com/openquiz/quiz-detail?path=network' }))
        expect(url.origin + url.pathname).toBe('https://github.com/stoptalkingishh/openquiz/issues/new')
        expect(url.searchParams.get('template')).toBe('quiz-feedback.md')
        expect(url.searchParams.get('labels')).toBe('quiz-feedback')
        expect(url.searchParams.get('title')).toBe('Quiz feedback: Network+ Practice Test 1')
        expect(url.searchParams.get('body')).toContain('OpenQuiz page: https://example.com/openquiz/quiz-detail?path=network')
        expect(url.searchParams.get('body')).not.toContain('correctIndex')
    })
})
