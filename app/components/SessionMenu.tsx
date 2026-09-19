'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    X, ChevronLeft, ChevronRight, Volume2, Pause, VolumeX,
    Check, Search, BookOpen,
} from 'lucide-react'
import { Question } from '../lib/satTypes'
import {
    questionSpeechText, answerSpeechText, speakQuestion, speakAnswer,
    stopSpeech, ttsAvailable, isSpeaking, setOnTtsEnd, getLastSpokenText,
} from '../lib/tts'

export interface ReviewRecord {
    correct: boolean
    chosen: string | number | boolean | null
}

interface SessionMenuProps {
    open: boolean
    onClose: () => void
    question: Question
    history: ReviewRecord | undefined
    index: number
    total: number
    onPrev: () => void
    onNext: () => void
    onGoogleSearch: () => void
}

function answerDisplay(question: Question): string {
    const p = question.payload || {}
    switch (question.type) {
        case 'simple_usage':
        case 'sat_cloze':
        case 'generic_mc':
            return (Array.isArray(p.options) ? p.options : [])[p.correctIndex ?? 0] || ''
        case 'generic_tf':
            return p.correctAnswer ? 'True' : 'False'
        case 'generic_flashcard':
            return p.answer || ''
        case 'generic_written':
            return p.answer || ''
        case 'recall':
            return p.ru || ''
        case 'simulation': {
            const steps = Array.isArray(p.steps) ? p.steps : []
            return [p.prompt || '', 'Steps: ' + steps.map((s: any) => s?.title).filter(Boolean).join('; ')].filter(Boolean).join(' ')
        }
        default:
            return ''
    }
}

function questionText(question: Question): string {
    const p = question.payload || {}
    if (question.type === 'generic_mc' || question.type === 'generic_tf' ||
        question.type === 'generic_flashcard' || question.type === 'generic_written') {
        return p.prompt || ''
    }
    if (question.type === 'simple_usage' || question.type === 'sat_cloze') return p.sentence || ''
    if (question.type === 'recall') return p.word || ''
    if (question.type === 'simulation') return p.prompt || ''
    return ''
}

export default function SessionMenu({
    open, onClose, question, history, index, total,
    onPrev, onNext, onGoogleSearch
}: SessionMenuProps) {
    const [speaking, setSpeaking] = useState(false)
    const reduceMotion = useReducedMotion()
    const panelRef = useRef<HTMLDivElement>(null)
    const onCloseRef = useRef(onClose)
    const ttsOk = ttsAvailable()

    useEffect(() => {
        onCloseRef.current = onClose
    }, [onClose])

    useEffect(() => {
        if (!open) return
        const previous = document.activeElement as HTMLElement | null
        const panel = panelRef.current
        const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || [])
        const focusFirst = () => (focusable()[0] || panel)?.focus()
        focusFirst()
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                onCloseRef.current()
                return
            }
            if (event.key !== 'Tab') return
            const elements = focusable()
            if (!elements.length) {
                event.preventDefault()
                panel?.focus()
                return
            }
            const current = document.activeElement
            const position = elements.indexOf(current as HTMLElement)
            const next = event.shiftKey
                ? (position <= 0 ? elements.length - 1 : position - 1)
                : (position === elements.length - 1 ? 0 : position + 1)
            event.preventDefault()
            elements[next].focus()
        }
        document.addEventListener('keydown', onKeyDown)
        const priorOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.body.style.overflow = priorOverflow
            previous?.focus?.()
        }
    }, [open])

    // Keep our local state in sync with the module-level TTS state. This also
    // lets us keep speaking even after the menu closes.
    useEffect(() => {
        if (!open) {
            setSpeaking(isSpeaking())
            return
        }
        setSpeaking(isSpeaking())
        setOnTtsEnd(() => setSpeaking(false))
        return () => setOnTtsEnd(null)
    }, [open, question])

    const readQuestion = () => {
        if (speakQuestion(question)) setSpeaking(true)
        else setSpeaking(false)
    }

    const readAnswer = () => {
        const ans = answerSpeechText(question)
        if (!ans) return
        if (speakAnswer(question)) setSpeaking(true)
        else setSpeaking(false)
    }

    const stopReading = () => {
        stopSpeech()
        setSpeaking(false)
    }

    const closeMenu = () => {
        // Intentional: do NOT stop speech — audio keeps playing behind the quiz.
        setOnTtsEnd(null)
        onClose()
    }

    const navigate = (fn: () => void) => {
        stopSpeech()
        setSpeaking(false)
        onClose()
        fn()
    }

    const prompt = questionText(question)
    const correct = answerDisplay(question)
    const explanation = (question.payload?.explanation as string) || ''

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeMenu}
                        aria-hidden="true"
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                        animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                        transition={reduceMotion
                            ? { duration: 0.15 }
                            : { type: 'tween', duration: 0.25, ease: 'easeOut' }}
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="session-tools-heading"
                        tabIndex={-1}
                        className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-surface-dark border-l border-neutral-200 dark:border-neutral-700 overflow-y-auto"
                    >
                        <div className="p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 id="session-tools-heading" className="text-lg font-extrabold">Session Tools</h2>
                                <button
                                    onClick={closeMenu}
                                    className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                                    aria-label="Close menu"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                Question {index + 1} of {total}
                            </p>

                            {/* Reading / TTS */}
                            <div>
                                <h3 className="text-sm font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-3">
                                    Read Aloud {speaking && <span className="ml-1 inline-flex gap-1 align-middle">
                                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                                    </span>}
                                </h3>
                                <div className="space-y-2">
                                    <button
                                        onClick={readQuestion}
                                        disabled={!ttsOk}
                                        className="w-full py-3 rounded-xl bg-primary/10 text-primary dark:text-primary-light font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
                                    >
                                        {speaking && getLastSpokenText() === questionSpeechText(question)
                                            ? <Pause className="w-5 h-5" />
                                            : <Volume2 className="w-5 h-5" />}
                                        {ttsOk ? 'Read the question' : 'TTS not available'}
                                    </button>

                                    <button
                                        onClick={readAnswer}
                                        disabled={!ttsOk || !answerSpeechText(question)}
                                        className="w-full py-3 rounded-xl btn-outline flex items-center justify-center gap-2 disabled:opacity-40"
                                    >
                                        <BookOpen className="w-5 h-5" />
                                        {answerSpeechText(question) ? 'Read the answer' : 'No answer to read'}
                                    </button>

                                    {speaking && (
                                        <button
                                            onClick={stopReading}
                                            className="w-full py-3 rounded-xl bg-error/10 text-error dark:text-red-300 font-semibold flex items-center justify-center gap-2"
                                        >
                                            <VolumeX className="w-5 h-5" /> Stop reading
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
                                    Audio keeps playing after you close this menu.
                                </p>
                            </div>

                            {/* Navigation */}
                            <div>
                                <h3 className="text-sm font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-2">
                                    Navigate
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => navigate(onPrev)}
                                        disabled={index === 0}
                                        className="py-3 rounded-xl btn-outline flex items-center justify-center gap-2 disabled:opacity-40"
                                    >
                                        <ChevronLeft className="w-4 h-4" /> Back
                                    </button>
                                    <button
                                        onClick={() => navigate(onNext)}
                                        disabled={index === total - 1}
                                        className="py-3 rounded-xl btn-outline flex items-center justify-center gap-2 disabled:opacity-40"
                                    >
                                        Forward <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Why wrong / correct */}
                            <div>
                                <h3 className="text-sm font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-2">
                                    Why this answer?
                                </h3>
                                <div className="card p-4 space-y-3">
                                    {history ? (
                                        <div className={`flex items-center gap-2 text-sm font-semibold ${history.correct
                                                ? 'text-secondary dark:text-secondary-light'
                                                : 'text-error dark:text-red-300'
                                            }`}>
                                            {history.correct ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                            {history.correct ? 'Correct' : 'Incorrect'}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                            Answer this question to see an explanation.
                                        </p>
                                    )}

                                    {prompt && (
                                        <div>
                                            <p className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400 font-bold mb-1">You chose</p>
                                            <p className="text-sm text-neutral-700 dark:text-neutral-300 break-words">
                                                {history?.chosen && history.chosen !== '' ? history.chosen : '—'}
                                            </p>
                                        </div>
                                    )}

                                    <div>
                                        <p className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400 font-bold mb-1">Correct answer</p>
                                        <p className="text-sm font-semibold text-secondary dark:text-secondary-light break-words">
                                            {correct || '—'}
                                        </p>
                                    </div>

                                    {explanation && (
                                        <div className="bg-white/50 dark:bg-neutral-800/50 rounded-xl p-3">
                                            <p className="text-[10px] uppercase text-neutral-600 dark:text-neutral-400 font-bold mb-1">Why</p>
                                            <p className="text-sm text-neutral-800 dark:text-neutral-200">{explanation}</p>
                                        </div>
                                    )}

                                    {!explanation && history && (
                                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                            No explanation was provided, but you can search the web for why the answer is
                                            as stated.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Research */}
                            <div>
                                <h3 className="text-sm font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide mb-2">
                                    Research
                                </h3>
                                <button
                                    onClick={onGoogleSearch}
                                    className="w-full py-3 rounded-xl btn-outline flex items-center justify-center gap-2"
                                >
                                    <Search className="w-5 h-5" />
                                    Search the question & answer
                                </button>
                                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
                                    Opens a Google search in a new tab for this question and its answer.
                                </p>
                            </div>

                            <button
                                onClick={closeMenu}
                                className="w-full py-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold"
                            >
                                Close
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
