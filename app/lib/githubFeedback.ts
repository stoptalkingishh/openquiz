const REPOSITORY_ISSUES_URL = 'https://github.com/stoptalkingishh/openquiz/issues/new'

export interface QuizFeedbackContext {
    quizName: string
    quizUrl?: string
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
