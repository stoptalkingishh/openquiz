'use client'

import { Question } from './satTypes'

/**
 * Text-to-speech for session questions using the browser's built-in
 * Web Speech Synthesis API — no external service or network needed.
 */

function synth(): any {
    if (typeof window === 'undefined') return null
    return (window as any).speechSynthesis || null
}

export function ttsAvailable(): boolean {
    return Boolean(synth())
}

export function isSpeaking(): boolean {
    const s = synth()
    return s ? Boolean(s.speaking) : false
}

export function speakText(text: string) {
    const s = synth()
    if (!s || !text.trim()) return
    try { s.cancel() } catch { /* ignore */ }
    try {
        const u = new (window as any).SpeechSynthesisUtterance(text)
        u.rate = 0.95
        u.pitch = 1
        s.speak(u)
    } catch {
        // synthesizer may be unavailable — silently ignore
    }
}

export function toggleSpeech(text: string): boolean {
    const s = synth()
    if (!s) return false
    if (s.speaking) {
        try { s.cancel() } catch { /* ignore */ }
        return false
    }
    speakText(text)
    return true
}

export function stopSpeech() {
    const s = synth()
    if (s) { try { s.cancel() } catch { /* ignore */ } }
}

/**
 * Extract a readable string from a session Question for text-to-speech.
 */
export function questionSpeechText(q: Question): string {
    if (!q) return ''
    const p = q.payload || {}

    switch (q.type) {
        case 'recall':
            return `${p.word}${p.ru ? `, meaning: ${p.ru}` : ''}${p.example ? `. Example: ${p.example}` : ''}`
        case 'simple_usage':
        case 'sat_cloze':
            return p.sentence || ''
        case 'generic_mc':
            return `${p.prompt || ''}. Options: ${(Array.isArray(p.options) ? p.options : []).join('. ')}`
        case 'generic_tf':
            return p.prompt || ''
        case 'generic_flashcard':
            return `${p.prompt || ''}${p.answer ? ` Answer is: ${p.answer}` : ''}`
        case 'generic_written':
            return p.prompt || ''
        case 'simulation': {
            const steps = Array.isArray(p.steps) ? p.steps : []
            return [p.prompt, ...steps.map((s: any) => s?.title || '')].filter(Boolean).join('. ')
        }
        default:
            return q.word || ''
    }
}