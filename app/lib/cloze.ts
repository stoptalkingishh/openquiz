// Cloze answers may span lines. Keep the capture non-greedy so each deletion
// becomes its own card when a prompt contains several deletions.
const CLOZE_RE = /\{\{c\d+::([\s\S]*?)\}\}/g

export function hasCloze(text: string): boolean {
    if (!text) return false
    CLOZE_RE.lastIndex = 0
    return CLOZE_RE.test(text)
}

export function extractClozeCards(text: string): { prompt: string; answer: string }[] {
    if (!text) return []

    const occurrences: { start: number; end: number; answer: string }[] = []
    CLOZE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = CLOZE_RE.exec(text)) !== null) {
        occurrences.push({
            start: match.index,
            end: match.index + match[0].length,
            answer: match[1]
        })
    }

    if (occurrences.length === 0) return []

    return occurrences.map((target, i) => {
        let prompt = ''
        let cursor = 0
        for (let j = 0; j < occurrences.length; j++) {
            const occ = occurrences[j]
            prompt += text.slice(cursor, occ.start)
            prompt += j === i ? '_____' : occ.answer
            cursor = occ.end
        }
        prompt += text.slice(cursor)

        return { prompt, answer: target.answer }
    })
}
