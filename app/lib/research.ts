import { Question } from './satTypes'

function clean(value: unknown, limit = 220): string {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function buildGoogleResearchQuery(question: Question): string {
    const payload = question.payload || {}
    const prompt = clean(payload.prompt || payload.sentence || question.word)
    const options = Array.isArray(payload.options) ? payload.options : []
    const answer = clean(options.length ? options[payload.correctIndex ?? 0] : typeof payload.correctAnswer === 'boolean' ? (payload.correctAnswer ? 'True' : 'False') : payload.answer || payload.ru)
    const terms = [prompt && `"${prompt}"`, answer && `"${answer}"`].filter(Boolean)
    terms.push(question.type === 'recall' ? 'definition examples' : 'explanation')
    return terms.join(' ')
}
