export const SHARE_URL_MAX_PAYLOAD = 12000

function withoutImage(item: any): any {
    if (item == null || typeof item !== 'object') return item
    const copy: Record<string, any> = {}
    for (const key of Object.keys(item)) {
        if (key === 'image') continue
        copy[key] = item[key]
    }
    return copy
}

export function stripShareImages(quiz: { words?: any[]; questions?: any[] }): { words: any[]; questions: any[] } {
    const words = Array.isArray(quiz.words)
        ? quiz.words.map((word) => withoutImage(word))
        : []
    const questions = Array.isArray(quiz.questions)
        ? quiz.questions.map((question) => {
            const stripped = withoutImage(question)
            if (stripped && Array.isArray(stripped.steps)) {
                stripped.steps = stripped.steps.map((step: any) => withoutImage(step))
            }
            return stripped
        })
        : []
    return { words, questions }
}

export function buildShareData(quiz: {
    id?: string | null
    name?: string
    description?: string
    author_name?: string | null
    words?: any[]
    questions?: any[]
}): string | null {
    const { words, questions } = stripShareImages(quiz)
    const payload = JSON.stringify({
        id: quiz.id,
        name: quiz.name,
        description: quiz.description,
        author_name: quiz.author_name || null,
        words,
        questions
    })
    if (payload.length > SHARE_URL_MAX_PAYLOAD) return null
    return encodeURIComponent(payload)
}
