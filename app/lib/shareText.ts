export type ShareTextQuiz = {
    name?: string
    words?: unknown[]
    questions?: unknown[]
}

/**
 * Builds the text used for social share links.
 *
 * The wording stays neutral and describes the quiz that is actually being
 * shared, so official SAT sets, CompTIA sets, and user-created quizzes are all
 * described accurately.
 */
export function buildShareText(quiz: ShareTextQuiz): string {
    const name = (quiz.name || '').trim() || 'this quiz'
    const questionCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0
    const wordCount = Array.isArray(quiz.words) ? quiz.words.length : 0

    if (questionCount > 0) return `Try this quiz on OpenQuiz: ${name} (${questionCount} questions)`
    if (wordCount > 0) return `Try this vocabulary practice on OpenQuiz: ${name} (${wordCount} words)`
    return `Try this quiz on OpenQuiz: ${name}`
}
