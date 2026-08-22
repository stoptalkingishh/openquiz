'use client'

import { Question } from './satTypes'

/**
 * Text-to-speech for session questions using the browser's built-in
 * Web Speech Synthesis API — no external service or network needed.
 *
 * Keeps lightweight module state so the UI can react to play/stop/end and can
 * keep reading even after the tools menu is dismissed.
 */

function synth(): any {
    if (typeof window === 'undefined') return null
    return (window as any).speechSynthesis || null
}

let lastTextValue = ''
let onEndHandler: (() => void) | null = null

export function ttsAvailable(): boolean {
    return Boolean(synth())
}

export function isSpeaking(): boolean {
    const s = synth()
    return s ? Boolean(s.speaking || s.pending) : false
}

/** Text that is currently (or last was) being read. */
export function getLastSpokenText(): string {
    return lastTextValue
}

/**
 * Register a callback fired when the current utterance finishes (or is
 * cancelled). Returns an unsubscribe function.
 */
export function setOnTtsEnd(cb: (() => void) | null): void {
    onEndHandler = cb
}

export function stopSpeech() {
    const s = synth()
    if (s) { try { s.cancel() } catch { /* ignore */ } }
    lastTextValue = ''
    if (onEndHandler) {
        const cb = onEndHandler
        onEndHandler = null
        cb()
    }
}

/**
 * Read a piece of text aloud. If we are already reading that same text,
 * toggles off. Returns true if speech started (or continued).
 */
export function speakText(text: string): boolean {
    const s = synth()
    if (!s || !text.trim()) return false

    if (isSpeaking() && lastTextValue === text) {
        stopSpeech()
        return false
    }

    try { s.cancel() } catch { /* ignore */ }

    try {
        const u = new (window as any).SpeechSynthesisUtterance(text)
        u.rate = 1
        u.pitch = 1
        const voices = s.getVoices?.() || []
        const en = voices.find((v: any) => /^en/i.test(v.lang)) || voices.find((v: any) => /^en/i.test(v.name))
        if (en) u.voice = en
        u.onend = () => {
            lastTextValue = ''
            if (onEndHandler) {
                const cb = onEndHandler
                onEndHandler = null
                cb()
            }
        }
        lastTextValue = text
        s.speak(u)
        return true
    } catch {
        return false
    }
}

/** Read the question portion of a session question. */
export function speakQuestion(q: Question): boolean {
    return speakText(questionSpeechText(q))
}

/** Read the answer / explanation portion of a session question. */
export function speakAnswer(q: Question): boolean {
    return speakText(answerSpeechText(q))
}

/**
 * Readable question text (does NOT include the answer).
 */
export function questionSpeechText(q: Question): string {
    if (!q) return ''
    const p = q.payload || {}

    switch (q.type) {
        case 'recall':
            return `${p.word || ''}${p.ru ? `, meaning: ${p.ru}` : ''}`
        case 'simple_usage':
        case 'sat_cloze':
            return p.sentence || ''
        case 'generic_mc':
            return `${p.prompt || ''}. Options: ${(Array.isArray(p.options) ? p.options : []).join('. ')}`
        case 'generic_tf':
            return p.prompt || ''
        case 'generic_flashcard':
            return p.prompt || ''
        case 'generic_written':
            return p.prompt || ''
        case 'simulation': {
            const steps = Array.isArray(p.steps) ? p.steps : []
            return [p.prompt || '', ...steps.map((s: any) => s?.title || '')].filter(Boolean).join('. ')
        }
        default:
            return ''
    }
}

/**
 * Readable answer / explanation text.
 */
export function answerSpeechText(q: Question): string {
    if (!q) return ''
    const p = q.payload || {}
    let answer = ''
    switch (q.type) {
        case 'recall':
            answer = p.ru || ''
            break
        case 'simple_usage':
        case 'sat_cloze':
        case 'generic_mc': {
            const options = Array.isArray(p.options) ? p.options : []
            answer = options[p.correctIndex ?? 0] || ''
            break
        }
        case 'generic_tf':
            answer = p.correctAnswer ? 'True' : 'False'
            break
        case 'generic_flashcard':
            answer = p.answer || ''
            break
        case 'generic_written':
            answer = p.answer || ''
            break
        case 'simulation': {
            const steps = Array.isArray(p.steps) ? p.steps : []
            return steps.map((s: any) => s?.explanation || '').filter(Boolean).join('. ')
        }
        default:
            break
    }
    if (p.explanation) answer = `${answer}${answer ? '. ' : ''}${p.explanation}`
    return answer
}