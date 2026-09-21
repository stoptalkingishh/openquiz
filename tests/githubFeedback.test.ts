import { describe, expect, it } from 'vitest'
import { buildQuizFeedbackUrl, buildQuizPublicationRequestUrl } from '../app/lib/githubFeedback'

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

describe('quiz publication links', () => {
    it('creates a labeled public review request with contributor-provided provenance', () => {
        const url = new URL(buildQuizPublicationRequestUrl({
            quizName: 'Network+ Practice Test 1',
            contactEmail: 'author@example.com',
            shareUrl: 'https://example.com/openquiz/quiz/share/?path=network',
            sourceAttribution: 'Original work by the submitter.'
        }))
        expect(url.searchParams.get('template')).toBe('quiz-publication.md')
        expect(url.searchParams.get('labels')).toBe('quiz-submission')
        expect(url.searchParams.get('title')).toBe('Quiz submission: Network+ Practice Test 1')
        expect(url.searchParams.get('body')).toContain('author@example.com')
        expect(url.searchParams.get('body')).toContain('Original work by the submitter.')
        expect(url.searchParams.get('body')).toContain('right to share every part')
    })
})
