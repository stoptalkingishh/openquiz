const REPOSITORY_ISSUES_URL = 'https://github.com/stoptalkingishh/openquiz/issues/new'

export interface QuizFeedbackContext {
    quizName: string
    quizUrl?: string
}

export interface QuizPublicationRequest {
    quizName: string
    contactEmail: string
    shareUrl: string
    sourceAttribution: string
}

/** Builds a GitHub Issue draft without sending quiz content or personal data to a third party. */
export function buildQuizFeedbackUrl({ quizName, quizUrl }: QuizFeedbackContext): string {
    const params = new URLSearchParams({
        template: 'quiz-feedback.md',
        labels: 'quiz-feedback',
        title: `Quiz feedback: ${quizName}`,
        body: [
            '## Quiz',
            `- Name: ${quizName}`,
            quizUrl ? `- OpenQuiz page: ${quizUrl}` : '',
            '',
            '## Question or item',
            '<!-- Add a question number or a short description. Do not paste private study material. -->',
            '',
            '## What did you expect?',
            '',
            '## What happened instead?',
            ''
        ].filter(Boolean).join('\n')
    })
    return `${REPOSITORY_ISSUES_URL}?${params.toString()}`
}

/** Builds a public catalog-review request. The contributor chooses the link and attribution to disclose. */
export function buildQuizPublicationRequestUrl({ quizName, contactEmail, shareUrl, sourceAttribution }: QuizPublicationRequest): string {
    const params = new URLSearchParams({
        template: 'quiz-publication.md',
        labels: 'quiz-submission',
        title: `Quiz submission: ${quizName}`,
        body: [
            '## Contact email',
            contactEmail,
            '',
            '## Quiz link',
            shareUrl,
            '',
            '## Source, license, or attribution',
            sourceAttribution,
            '',
            '## Rights confirmation',
            'I created this quiz or have the right to share every part of it for free public use in OpenQuiz.',
            '',
            '## Requested catalog',
            '- [ ] Official OpenQuiz library',
            '- [ ] Community catalog',
            '- [x] Either, after review'
        ].join('\n')
    })
    return `${REPOSITORY_ISSUES_URL}?${params.toString()}`
}
