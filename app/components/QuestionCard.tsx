'use client'

import { useState } from 'react'
import { Question, SimulationStep } from '../lib/satTypes'
import { Eye, Check, X, BookOpen, ChevronRight, ChevronLeft, RotateCcw, ClipboardList } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface QuestionCardProps {
    question: Question
    onAnswer: (correct: boolean, chosen?: string | number | boolean | null, question?: Question) => void
    onRate?: (quality: number) => void
}

const RATINGS: { label: string; quality: number; className: string }[] = [
    { label: 'Again', quality: 1, className: 'border-error/40 text-error dark:text-error-light hover:bg-error/10' },
    { label: 'Hard', quality: 3, className: 'border-accent/40 text-accent dark:text-accent-light hover:bg-accent/10' },
    { label: 'Good', quality: 4, className: 'border-secondary/40 text-secondary dark:text-secondary-light hover:bg-secondary/10' },
    { label: 'Easy', quality: 5, className: 'border-primary/40 text-primary dark:text-primary-light hover:bg-primary/10' },
]

function SelfRatingButtons({ onRate }: { onRate?: (quality: number) => void }) {
    if (!onRate) return null
    return (
        <div className="grid grid-cols-4 gap-2 w-full mt-4">
            {RATINGS.map(r => (
                <button
                    key={r.label}
                    onClick={() => onRate(r.quality)}
                    className={`py-2 rounded-xl text-sm font-bold border-2 transition-all active:scale-95 ${r.className}`}
                >
                    {r.label}
                </button>
            ))}
        </div>
    )
}

function MediaImage({ image }: { image?: string }) {
    if (!image) return null
    return (
        <div className="mb-4 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={image}
                alt="Question media"
                className="rounded-2xl max-h-72 w-full max-w-full object-contain border-2 border-neutral-200 dark:border-neutral-700"
            />
        </div>
    )
}

export default function QuestionCard({ question, onAnswer, onRate }: QuestionCardProps) {
    if (question.type === 'recall') {
        return <RecallCard question={question} onAnswer={onAnswer} onRate={onRate} />
    }
    if (question.type === 'simple_usage' || question.type === 'sat_cloze') {
        return <MultipleChoiceCard question={question} onAnswer={onAnswer} onRate={onRate} />
    }
    if (question.type === 'generic_mc') {
        return <GenericMultipleChoiceCard question={question} onAnswer={onAnswer} />
    }
    if (question.type === 'generic_tf') {
        return <GenericTrueFalseCard question={question} onAnswer={onAnswer} />
    }
    if (question.type === 'generic_flashcard') {
        return <GenericFlashcardCard question={question} onAnswer={onAnswer} />
    }
    if (question.type === 'generic_written') {
        return <GenericWrittenCard question={question} onAnswer={onAnswer} />
    }
    if (question.type === 'simulation') {
        return <SimulationCard question={question} onAnswer={onAnswer} />
    }
    return <div>Unknown question type</div>
}

function RecallCard({ question, onAnswer, onRate }: QuestionCardProps) {
    const [revealed, setRevealed] = useState(false)
    const { word, ru, synonyms, example } = question.payload
    const syns = Array.isArray(synonyms) ? synonyms : []
    const ruText = ru || ''
    const exampleText = example || ''

    return (
        <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full px-4">
            <div className="card w-full p-8 mb-8 text-center min-h-[400px] flex flex-col items-center justify-center">
                <div className="mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light rounded-full text-sm font-semibold mb-4">
                        <BookOpen className="w-4 h-4" />
                        Recall
                    </div>
                </div>

                <h2 className="text-5xl font-bold mb-6 text-neutral-900 dark:text-neutral-50">{word}</h2>

                <MediaImage image={question.image} />

                {!revealed ? (
                    <button
                        onClick={() => setRevealed(true)}
                        className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 hover:text-primary dark:hover:text-primary-light transition-colors font-semibold mt-4 group"
                    >
                        <Eye className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        Tap to reveal meaning
                    </button>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6 mt-4 w-full"
                    >
                        <div className="p-6 bg-primary/5 dark:bg-primary/10 rounded-2xl border-2 border-primary/20 dark:border-primary/30">
                            <p className="text-2xl font-semibold text-primary dark:text-primary-light mb-2">{ruText}</p>
                        </div>

                        <div className="text-left space-y-4">
                            {exampleText && (
                                <div>
                                    <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">Example</p>
                                    <p className="text-lg italic text-neutral-700 dark:text-neutral-300 leading-relaxed">&ldquo;{exampleText}&rdquo;</p>
                                </div>
                            )}

                            {syns.length > 0 && (
                                <div>
                                    <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">Synonyms</p>
                                    <div className="flex flex-wrap gap-2">
                                        {syns.map((s: string) => (
                                        <span key={s} className="badge-primary">
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </div>

            {revealed && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full"
                >
                    <div className="grid grid-cols-2 gap-4 w-full">
                        <button
                            onClick={() => onAnswer(false)}
                            className="btn-outline h-14 text-base font-bold"
                        >
                            <X className="w-5 h-5" />
                            Didn&apos;t Know
                        </button>
                        <button
                            onClick={() => onAnswer(true)}
                            className="btn-primary h-14 text-base font-bold"
                        >
                            <Check className="w-5 h-5" />
                            Got It!
                        </button>
                    </div>
                    <SelfRatingButtons onRate={onRate} />
                </motion.div>
            )}
        </div>
    )
}

function MultipleChoiceCard({ question, onAnswer, onRate }: QuestionCardProps) {
    const [selected, setSelected] = useState<number | null>(null)
    const [submitted, setSubmitted] = useState(false)

    const { sentence, options, correctIndex } = question.payload
    const opts = Array.isArray(options) ? options : []
    const sentenceText = sentence || ''
    const correctWord = opts[correctIndex] || ''

    // Get word data from question
    const wordData = question.payload.wordData || { ru: '', synonyms: [] }
    const wordSynonyms = Array.isArray(wordData.synonyms) ? wordData.synonyms : []

    const handleSubmit = () => {
        if (selected === null) return
        setSubmitted(true)

        setTimeout(() => {
            onAnswer(selected === correctIndex, opts[selected] || null, question)
        }, 3000) // Give time to read the explanation
    }

    const isCorrect = selected === correctIndex

    return (
        <div className="flex flex-col h-full max-w-3xl mx-auto w-full px-4">
            <div className="flex-1 flex flex-col justify-center">
                {/* Question type badge */}
                <div className="mb-6 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light rounded-full text-sm font-semibold">
                        <BookOpen className="w-4 h-4" />
                        {question.type === 'sat_cloze' ? 'SAT Style' : 'Usage'}
                    </div>
                </div>

                <MediaImage image={question.image} />

                {/* Question text */}
                <div className="card p-8 mb-8 min-h-[200px] flex items-center justify-center">
                    <p className="text-xl md:text-2xl font-medium leading-relaxed text-center text-neutral-800 dark:text-neutral-200">
                        {sentenceText.split('_______').map((part: string, i: number) => (
                            <span key={i}>
                                {part}
                                {i < sentenceText.split('_______').length - 1 && (
                                    <span className="inline-block min-w-[120px] border-b-4 border-primary/30 dark:border-primary/40 mx-2 relative top-1"></span>
                                )}
                            </span>
                        ))}
                    </p>
                </div>

                {/* Options */}
                <div className="space-y-3 mb-6">
                    {opts.map((opt: string, i: number) => {
                        let stateClass = 'card-interactive border-2'
                        let iconElement = null

                        if (submitted) {
                            if (i === correctIndex) {
                                stateClass = 'card border-2 border-secondary dark:border-secondary-light bg-secondary/5 dark:bg-secondary/10'
                                iconElement = <Check className="w-5 h-5 text-secondary dark:text-secondary-light" />
                            } else if (i === selected) {
                                stateClass = 'card border-2 border-error dark:border-error-light bg-error/5 dark:bg-error/10'
                                iconElement = <X className="w-5 h-5 text-error dark:text-error-light" />
                            } else {
                                stateClass += ' opacity-40'
                            }
                        } else if (selected === i) {
                            stateClass = 'card border-2 border-primary dark:border-primary-light bg-primary/5 dark:bg-primary/10'
                        }

                        return (
                            <button
                                key={i}
                                onClick={() => !submitted && setSelected(i)}
                                className={`w-full p-5 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center justify-between ${stateClass}`}
                                disabled={submitted}
                            >
                                <span className="text-neutral-900 dark:text-neutral-100">{opt}</span>
                                {iconElement}
                            </button>
                        )
                    })}
                </div>

                {/* Submit button */}
                {!submitted && (
                    <button
                        onClick={handleSubmit}
                        disabled={selected === null}
                        className="w-full btn-primary h-14 text-lg font-bold"
                    >
                        Check Answer
                    </button>
                )}
            </div>

            {/* Result feedback */}
            <AnimatePresence>
                {submitted && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className={`fixed bottom-0 left-0 right-0 p-6 z-50 border-t-4 ${isCorrect
                                ? 'bg-secondary/10 dark:bg-secondary/20 border-secondary dark:border-secondary-light backdrop-blur-xl'
                                : 'bg-error/10 dark:bg-error/20 border-error dark:border-error-light backdrop-blur-xl'
                            }`}
                    >
                        <div className="max-w-3xl mx-auto">
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-full flex-shrink-0 ${isCorrect
                                        ? 'bg-secondary dark:bg-secondary-dark'
                                        : 'bg-error dark:bg-error-dark'
                                    }`}>
                                    {isCorrect ? (
                                        <Check className="w-6 h-6 text-white" />
                                    ) : (
                                        <X className="w-6 h-6 text-white" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h3 className={`font-bold text-xl mb-2 ${isCorrect
                                            ? 'text-secondary-dark dark:text-secondary-light'
                                            : 'text-error-dark dark:text-error-light'
                                        }`}>
                                        {isCorrect ? 'Correct!' : 'Incorrect'}
                                    </h3>

                                    {!isCorrect && (
                                        <p className="text-neutral-700 dark:text-neutral-300 font-medium mb-3">
                                            The correct answer is: <span className="font-bold text-neutral-900 dark:text-neutral-100">{correctWord}</span>
                                        </p>
                                    )}

                                    {/* Show translation and synonyms */}
                                    <div className="space-y-2 p-4 bg-white/50 dark:bg-neutral-800/50 rounded-xl">
                                        <div>
                                            <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Translation:</span>
                                            <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mt-1">{wordData.ru || question.word}</p>
                                        </div>
                                        {wordSynonyms.length > 0 && (
                                            <div>
                                                <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Synonyms:</span>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {wordSynonyms.map((syn: string) => (
                                                        <span key={syn} className="badge-primary text-sm">
                                                            {syn}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <SelfRatingButtons onRate={onRate} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Generic (manual) question cards
// ---------------------------------------------------------------------------

function GenericMultipleChoiceCard({ question, onAnswer }: QuestionCardProps) {
    const [selected, setSelected] = useState<number | null>(null)
    const [submitted, setSubmitted] = useState(false)

    const { prompt, options, correctIndex, explanation } = question.payload
    const opts = Array.isArray(options) ? options : []
    const answerText = opts[correctIndex ?? 0] || ''
    const promptText = prompt || ''

    const handleSubmit = () => {
        if (selected === null) return
        setSubmitted(true)
        setTimeout(() => {
            onAnswer(selected === correctIndex, opts[selected] || null, question)
        }, 3500)
    }

    const isCorrect = selected === correctIndex

    return (
        <div className="flex flex-col h-full max-w-3xl mx-auto w-full px-4">
            <div className="flex-1 flex flex-col justify-center">
                <div className="mb-6 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light rounded-full text-sm font-semibold">
                        <BookOpen className="w-4 h-4" />
                        Multiple Choice
                    </div>
                </div>

                <MediaImage image={question.image} />

                <div className="card p-8 mb-8 min-h-[160px] flex items-center justify-center">
                    <p className="text-xl md:text-2xl font-medium leading-relaxed text-center text-neutral-800 dark:text-neutral-200">
                        {promptText}
                    </p>
                </div>

                <div className="space-y-3 mb-6">
                    {opts.map((opt: string, i: number) => {
                        let stateClass = 'card-interactive border-2'
                        let iconElement = null

                        if (submitted) {
                            if (i === correctIndex) {
                                stateClass = 'card border-2 border-secondary dark:border-secondary-light bg-secondary/5 dark:bg-secondary/10'
                                iconElement = <Check className="w-5 h-5 text-secondary dark:text-secondary-light" />
                            } else if (i === selected) {
                                stateClass = 'card border-2 border-error dark:border-error-light bg-error/5 dark:bg-error/10'
                                iconElement = <X className="w-5 h-5 text-error dark:text-error-light" />
                            } else {
                                stateClass += ' opacity-40'
                            }
                        } else if (selected === i) {
                            stateClass = 'card border-2 border-primary dark:border-primary-light bg-primary/5 dark:bg-primary/10'
                        }

                        return (
                            <button
                                key={i}
                                onClick={() => !submitted && setSelected(i)}
                                className={`w-full p-5 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center justify-between ${stateClass}`}
                                disabled={submitted}
                            >
                                <span className="text-neutral-900 dark:text-neutral-100">{opt}</span>
                                {iconElement}
                            </button>
                        )
                    })}
                </div>

                {!submitted && (
                    <button
                        onClick={handleSubmit}
                        disabled={selected === null}
                        className="w-full btn-primary h-14 text-lg font-bold"
                    >
                        Check Answer
                    </button>
                )}
            </div>

            <AnimatePresence>
                {submitted && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className={`fixed bottom-0 left-0 right-0 p-6 z-50 border-t-4 ${isCorrect
                                ? 'bg-secondary/10 dark:bg-secondary/20 border-secondary dark:border-secondary-light backdrop-blur-xl'
                                : 'bg-error/10 dark:bg-error/20 border-error dark:border-error-light backdrop-blur-xl'
                            }`}
                    >
                        <div className="max-w-3xl mx-auto">
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-full flex-shrink-0 ${isCorrect
                                        ? 'bg-secondary dark:bg-secondary-dark'
                                        : 'bg-error dark:bg-error-dark'
                                    }`}>
                                    {isCorrect ? (
                                        <Check className="w-6 h-6 text-white" />
                                    ) : (
                                        <X className="w-6 h-6 text-white" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h3 className={`font-bold text-xl mb-2 ${isCorrect
                                            ? 'text-secondary-dark dark:text-secondary-light'
                                            : 'text-error-dark dark:text-error-light'
                                        }`}>
                                        {isCorrect ? 'Correct!' : 'Incorrect'}
                                    </h3>

                                    {!isCorrect && selected !== null && (
                                        <p className="text-neutral-700 dark:text-neutral-300 font-medium mb-3">
                                            The correct answer is: <span className="font-bold text-neutral-900 dark:text-neutral-100">{answerText}</span>
                                        </p>
                                    )}

                                    {explanation && (
                                        <div className="p-4 bg-white/50 dark:bg-neutral-800/50 rounded-xl">
                                            <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Explanation</span>
                                            <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mt-1">{explanation}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function GenericTrueFalseCard({ question, onAnswer }: QuestionCardProps) {
    const [selected, setSelected] = useState<boolean | null>(null)
    const [submitted, setSubmitted] = useState(false)

    const { prompt, correctAnswer, explanation } = question.payload

    const handleSubmit = (value: boolean) => {
        setSelected(value)
        setSubmitted(true)
        setTimeout(() => {
            onAnswer(value === correctAnswer, value ? 'True' : 'False', question)
        }, 3500)
    }

    const isCorrect = selected === correctAnswer

    return (
        <div className="flex flex-col h-full max-w-3xl mx-auto w-full px-4">
            <div className="flex-1 flex flex-col justify-center">
                <div className="mb-6 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light rounded-full text-sm font-semibold">
                        <BookOpen className="w-4 h-4" />
                        True / False
                    </div>
                </div>

                <MediaImage image={question.image} />

                <div className="card p-8 mb-8 min-h-[160px] flex items-center justify-center">
                    <p className="text-xl md:text-2xl font-medium leading-relaxed text-center text-neutral-800 dark:text-neutral-200">
                        {prompt}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    {([true, false] as const).map((value) => {
                        const label = value ? 'True' : 'False'
                        let stateClass = 'card-interactive border-2'
                        let iconElement = null

                        if (submitted) {
                            if (value === correctAnswer) {
                                stateClass = 'card border-2 border-secondary dark:border-secondary-light bg-secondary/5 dark:bg-secondary/10'
                                iconElement = <Check className="w-5 h-5 text-secondary dark:text-secondary-light" />
                            } else if (value === selected) {
                                stateClass = 'card border-2 border-error dark:border-error-light bg-error/5 dark:bg-error/10'
                                iconElement = <X className="w-5 h-5 text-error dark:text-error-light" />
                            } else {
                                stateClass += ' opacity-40'
                            }
                        } else if (selected === value) {
                            stateClass = 'card border-2 border-primary dark:border-primary-light bg-primary/5 dark:bg-primary/10'
                        }

                        return (
                            <button
                                key={String(value)}
                                onClick={() => !submitted && handleSubmit(value)}
                                className={`w-full p-6 rounded-xl font-bold text-xl transition-all duration-200 flex items-center justify-between ${stateClass}`}
                                disabled={submitted}
                            >
                                <span className="text-neutral-900 dark:text-neutral-100">{label}</span>
                                {iconElement}
                            </button>
                        )
                    })}
                </div>
            </div>

            <AnimatePresence>
                {submitted && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className={`fixed bottom-0 left-0 right-0 p-6 z-50 border-t-4 ${isCorrect
                                ? 'bg-secondary/10 dark:bg-secondary/20 border-secondary dark:border-secondary-light backdrop-blur-xl'
                                : 'bg-error/10 dark:bg-error/20 border-error dark:border-error-light backdrop-blur-xl'
                            }`}
                    >
                        <div className="max-w-3xl mx-auto">
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-full flex-shrink-0 ${isCorrect
                                        ? 'bg-secondary dark:bg-secondary-dark'
                                        : 'bg-error dark:bg-error-dark'
                                    }`}>
                                    {isCorrect ? (
                                        <Check className="w-6 h-6 text-white" />
                                    ) : (
                                        <X className="w-6 h-6 text-white" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h3 className={`font-bold text-xl mb-2 ${isCorrect
                                            ? 'text-secondary-dark dark:text-secondary-light'
                                            : 'text-error-dark dark:text-error-light'
                                        }`}>
                                        {isCorrect ? 'Correct!' : 'Incorrect'}
                                    </h3>

                                    {!isCorrect && (
                                        <p className="text-neutral-700 dark:text-neutral-300 font-medium mb-3">
                                            The correct answer is: <span className="font-bold text-neutral-900 dark:text-neutral-100">{correctAnswer ? 'True' : 'False'}</span>
                                        </p>
                                    )}

                                    {explanation && (
                                        <div className="p-4 bg-white/50 dark:bg-neutral-800/50 rounded-xl">
                                            <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Explanation</span>
                                            <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mt-1">{explanation}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function GenericFlashcardCard({ question, onAnswer }: QuestionCardProps) {
    const [revealed, setRevealed] = useState(false)
    const { prompt, answer, explanation } = question.payload

    return (
        <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto w-full px-4">
            <div className="card w-full p-8 mb-8 text-center min-h-[360px] flex flex-col items-center justify-center">
                <div className="mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light rounded-full text-sm font-semibold mb-4">
                        <BookOpen className="w-4 h-4" />
                        Flashcard
                    </div>
                </div>

                <MediaImage image={question.image} />

                <h2 className="text-3xl font-bold mb-6 leading-snug text-neutral-900 dark:text-neutral-50">{prompt}</h2>

                {!revealed ? (
                    <button
                        onClick={() => setRevealed(true)}
                        className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 hover:text-primary dark:hover:text-primary-light transition-colors font-semibold mt-4 group"
                    >
                        <Eye className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        Tap to reveal answer
                    </button>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6 mt-4 w-full"
                    >
                        <div className="p-6 bg-primary/5 dark:bg-primary/10 rounded-2xl border-2 border-primary/20 dark:border-primary/30">
                            <p className="text-2xl font-semibold text-primary dark:text-primary-light">{answer}</p>
                        </div>

                        {explanation && (
                            <div className="text-left">
                                <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">Explanation</p>
                                <p className="text-lg italic text-neutral-700 dark:text-neutral-300 leading-relaxed">{explanation}</p>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>

            {revealed && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-2 gap-4 w-full"
                >
                    <button
                        onClick={() => onAnswer(false)}
                        className="btn-outline h-14 text-base font-bold"
                    >
                        <X className="w-5 h-5" />
                        Didn&apos;t Know
                    </button>
                    <button
                        onClick={() => onAnswer(true)}
                        className="btn-primary h-14 text-base font-bold"
                    >
                        <Check className="w-5 h-5" />
                        Got It!
                    </button>
                </motion.div>
            )}
        </div>
    )
}

function GenericWrittenCard({ question, onAnswer }: QuestionCardProps) {
    const [value, setValue] = useState('')
    const [submitted, setSubmitted] = useState(false)

    const { prompt, answer, explanation } = question.payload

    const normalize = (s: string) =>
        s.toLowerCase().trim().replace(/[.,!?;:'"“”‘’()\[\]\/\\\-_]/g, '').replace(/\s+/g, ' ')

    const handleSubmit = () => {
        if (!value.trim()) return
        setSubmitted(true)
        const correct = normalize(value) === normalize(answer || '')
        setTimeout(() => {
            onAnswer(correct, value, question)
        }, 3500)
    }

    return (
        <div className="flex flex-col h-full max-w-3xl mx-auto w-full px-4">
            <div className="flex-1 flex flex-col justify-center">
                <div className="mb-6 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light rounded-full text-sm font-semibold">
                        <BookOpen className="w-4 h-4" />
                        Written Answer
                    </div>
                </div>

                <MediaImage image={question.image} />

                <div className="card p-8 mb-8 min-h-[160px] flex items-center justify-center">
                    <p className="text-xl md:text-2xl font-medium leading-relaxed text-center text-neutral-800 dark:text-neutral-200">
                        {prompt}
                    </p>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        handleSubmit()
                    }}
                    className="space-y-3"
                >
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        disabled={submitted}
                        autoFocus={!submitted}
                        placeholder="Type your answer..."
                        className="input-field text-lg py-4"
                    />
                    {!submitted && (
                        <button
                            type="submit"
                            disabled={!value.trim()}
                            className="w-full btn-primary h-14 text-lg font-bold disabled:opacity-50"
                        >
                            Check Answer
                        </button>
                    )}
                </form>
            </div>

            <AnimatePresence>
                {submitted && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className={`fixed bottom-0 left-0 right-0 p-6 z-50 border-t-4 ${normalize(value) === normalize(answer || '')
                                ? 'bg-secondary/10 dark:bg-secondary/20 border-secondary dark:border-secondary-light backdrop-blur-xl'
                                : 'bg-error/10 dark:bg-error/20 border-error dark:border-error-light backdrop-blur-xl'
                            }`}
                    >
                        <div className="max-w-3xl mx-auto">
                            <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-full flex-shrink-0 ${normalize(value) === normalize(answer || '')
                                    ? 'bg-secondary dark:bg-secondary-dark'
                                    : 'bg-error dark:bg-error-dark'
                                    }`}>
                                    {normalize(value) === normalize(answer || '') ? (
                                        <Check className="w-6 h-6 text-white" />
                                    ) : (
                                        <X className="w-6 h-6 text-white" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h3 className={`font-bold text-xl mb-2 ${normalize(value) === normalize(answer || '')
                                        ? 'text-secondary-dark dark:text-secondary-light'
                                        : 'text-error-dark dark:text-error-light'
                                        }`}>
                                        {normalize(value) === normalize(answer || '') ? 'Correct!' : 'Incorrect'}
                                    </h3>

                                    {normalize(value) !== normalize(answer || '') && (
                                        <p className="text-neutral-700 dark:text-neutral-300 font-medium mb-3">
                                            The correct answer is: <span className="font-bold text-neutral-900 dark:text-neutral-100">{answer}</span>
                                        </p>
                                    )}

                                    {explanation && (
                                        <div className="p-4 bg-white/50 dark:bg-neutral-800/50 rounded-xl">
                                            <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Explanation</span>
                                            <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mt-1">{explanation}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Simulations (Comptia-style performance-based questions)
// ---------------------------------------------------------------------------

interface SimAnswers {
    choice: Record<string, number>
    checkbox: Record<string, Record<string, boolean>>
    placement: Record<string, Record<number, number>>
}

// Last-selected placement chip.
function useChipRequest(): { current: number | null; set: (n: number | null) => void } {
    const [chip, setChip] = useState<number | null>(null)
    return {
        current: chip,
        set: setChip
    }
}

function gradeSimStep(step: SimulationStep, a: SimAnswers): boolean {
    if (step.kind === 'choice') {
        return a.choice[step.id] != null && a.choice[step.id] === step.correctIndex
    }
    if (step.kind === 'checkbox' || step.kind === 'config') {
        const items = step.kind === 'config' ? (step.config || []) : (step.items || [])
        const toggles = a.checkbox[step.id] || {}
        if (!items.length) return false
        return items.every(it => toggles[it.id] === it.correct)
    }
    if (step.kind === 'placement') {
        const mapping = a.placement[step.id] || {}
        const correct = step.correctMapping || []
        const items = step.itemsToPlace || []
        if (!items.length || correct.length === 0) return false
        return items.every((_, i) => mapping[i] === correct[i])
    }
    return false
}

function PlacementEditor({ step, answers, onSetSlot, chip }: {
    step: SimulationStep
    answers: SimAnswers
    onSetSlot: (slotIdx: number) => void
    chip: { current: number | null; set: (n: number | null) => void }
}) {
    const items = step.itemsToPlace || []
    const slots = step.slots || []
    const mapping = answers.placement[step.id] || {}
    return (
        <div className="space-y-4 mb-6">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Tap an item to select it, then tap a slot to place it there.
            </p>
            <div className="flex flex-wrap gap-2">
                {items.map((it, idx) => {
                    const placed = Object.values(mapping).includes(idx)
                    const active = chip.current === idx && !placed
                    return (
                        <button
                            key={idx}
                            onClick={() => chip.set(active ? null : idx)}
                            disabled={!!placed}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${active ? 'border-primary bg-primary/10' : placed ? 'opacity-40 cursor-not-allowed' : 'border-neutral-300 dark:border-neutral-600 hover:border-primary/50'}`}
                        >
                            {it}
                        </button>
                    )
                })}
            </div>
            <div className="space-y-3">
                {slots.map((label, si) => {
                    const placedItem = mapping[si] != null ? items[mapping[si]] : null
                    const active = chip.current != null && mapping[si] == null
                    return (
                        <button
                            key={si}
                            onClick={() => onSetSlot(si)}
                            className={`w-full p-4 rounded-xl border-2 text-left transition-all ${placedItem ? 'border-secondary' : 'border-dashed border-neutral-300 dark:border-neutral-700'} ${active ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-bold text-neutral-600 dark:text-neutral-400">{label}</span>
                                <span className={`flex-1 ${placedItem ? 'text-neutral-900 dark:text-neutral-100 font-semibold' : 'text-neutral-400'}`}>
                                    {placedItem || (active ? 'Tap to place selected' : 'Empty slot')}
                                </span>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

function SimulationCard({ question, onAnswer }: QuestionCardProps) {
    const steps: SimulationStep[] = Array.isArray(question.payload?.steps) ? question.payload.steps : []
    const [stepIdx, setStepIdx] = useState(0)
    const [submitted, setSubmitted] = useState(false)
    const [answers, setAnswers] = useState<SimAnswers>({ choice: {}, checkbox: {}, placement: {} })
    const chip = useChipRequest()

    const step = steps[stepIdx]
    if (!steps.length) {
        return (
            <div className="card p-8 text-center">
                <p className="text-neutral-500 dark:text-neutral-400">This simulation has no steps.</p>
            </div>
        )
    }

    const setChoice = (idx: number) => setAnswers(a => ({ ...a, choice: { ...a.choice, [step.id]: idx } }))
    const setItem = (itemId: string, val: boolean) => setAnswers(a => ({
        ...a,
        checkbox: { ...a.checkbox, [step.id]: { ...(a.checkbox[step.id] || {}), [itemId]: val } }
    }))
    const setSlot = (slotIdx: number) => {
        if (chip.current == null) return
        const itemIdx = chip.current
        setAnswers(a => ({
            ...a,
            placement: { ...a.placement, [step.id]: { ...(a.placement[step.id] || {}), [slotIdx]: itemIdx } }
        }))
        chip.set(null)
    }

    const grades = steps.map(s => gradeSimStep(s, answers))
    const score = Math.round((grades.filter(Boolean).length / steps.length) * 100)
    const allCorrect = grades.every(Boolean)

    return (
        <div className="flex flex-col h-full max-w-3xl mx-auto w-full px-4">
            <div className="flex-1 flex flex-col justify-center">
                <div className="mb-6 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light rounded-full text-sm font-semibold">
                        <ClipboardList className="w-4 h-4" />
                        Simulation · Step {stepIdx + 1}/{steps.length}
                    </div>
                </div>

                {steps.length > 1 && (
                    <div className="mb-6 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
                            style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }} />
                    </div>
                )}

                <div className="card p-8 mb-6 min-h-[120px] flex items-center justify-center">
                    <p className="text-xl md:text-2xl font-medium leading-relaxed text-center text-neutral-800 dark:text-neutral-200">
                        {step.title}
                    </p>
                </div>

                {step.image && <MediaImage image={step.image} />}

                {step.kind === 'choice' && (
                    <div className="space-y-3 mb-6">
                        {(step.options || []).map((opt, i) => {
                            const selected = answers.choice[step.id] === i
                            return (
                                <button
                                    key={i}
                                    onClick={() => setChoice(i)}
                                    className={`w-full p-5 rounded-xl font-semibold text-lg text-left transition-all flex items-center gap-3 border-2 ${selected ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-neutral-200 dark:border-neutral-700 hover:border-primary/50'}`}
                                >
                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${selected ? 'bg-primary/20' : 'border-2 border-neutral-300'}`}>
                                        {selected ? <Check className="w-4 h-4 text-primary" /> : String.fromCharCode(65 + i)}
                                    </span>
                                    <span className="flex-1">{opt}</span>
                                </button>
                            )
                        })}
                    </div>
                )}

                {(step.kind === 'checkbox' || step.kind === 'config') && (
                    <div className="space-y-3 mb-6">
                        {(step.kind === 'config' ? (step.config || []) : (step.items || [])).map(it => {
                            const on = !!(answers.checkbox[step.id] || {})[it.id]
                            return (
                                <button
                                    key={it.id}
                                    onClick={() => setItem(it.id, !on)}
                                    className={`w-full p-4 rounded-xl text-left flex items-center gap-3 transition-all border-2 ${on ? 'border-secondary bg-secondary/10' : 'border-neutral-200 dark:border-neutral-700'}`}
                                >
                                    <span className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'bg-secondary' : ''}`}>
                                        {on && <Check className="w-4 h-4 text-white" />}
                                    </span>
                                    <span className="flex-1 text-neutral-800 dark:text-neutral-200">{it.label}</span>
                                    <span className="text-xs text-neutral-400 uppercase">{on ? 'Enabled' : 'Disabled'}</span>
                                </button>
                            )
                        })}
                    </div>
                )}

                {step.kind === 'placement' && (
                    <PlacementEditor step={step} answers={answers} onSetSlot={setSlot} chip={chip} />
                )}

                <div className="flex items-center justify-between mt-6 gap-3">
                    <button
                        onClick={() => setStepIdx(i => Math.max(0, i - 1))}
                        disabled={stepIdx === 0}
                        className="btn-outline px-5 flex items-center gap-2 disabled:opacity-30"
                    >
                        <ChevronLeft className="w-4 h-4" /> Prev
                    </button>

                    {stepIdx < steps.length - 1 ? (
                        <button
                            onClick={() => setStepIdx(i => Math.min(steps.length - 1, i + 1))}
                            className="btn-primary px-6 flex items-center gap-2"
                        >
                            Next <ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button onClick={() => setSubmitted(true)} className="btn-primary px-6">
                            Submit Simulation
                        </button>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {submitted && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    >
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-2xl relative z-10 max-w-lg w-full max-h-[90vh] overflow-y-auto"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold">Simulation Review</h2>
                                <span className={`px-3 py-1 rounded-full text-sm font-bold ${allCorrect ? 'text-secondary dark:text-secondary-light' : 'text-error dark:text-error-light'}`}>
                                    {score}%
                                </span>
                            </div>

                            <div className="mb-6">
                                {allCorrect ? (
                                    <div className="p-4 rounded-2xl bg-secondary/10 border-2 border-secondary text-secondary-dark dark:text-secondary-light">
                                        <p className="font-bold">Excellent — all {steps.length} steps correct.</p>
                                    </div>
                                ) : (
                                    <div className="p-4 rounded-2xl bg-error/10 border-2 border-error text-error-dark dark:text-error-light">
                                        <p className="font-bold">You got {grades.filter(Boolean).length} of {steps.length} steps correct.</p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                {steps.map((s, i) => {
                                    const ok = grades[i]
                                    return (
                                        <div key={s.id} className={`rounded-xl border-2 ${ok ? 'border-secondary' : 'border-error'} p-4`}>
                                            <div className="flex items-start gap-3">
                                                <span className={`w-7 h-7 shrink-0 ${ok ? 'bg-secondary' : 'bg-error'} rounded-full flex items-center justify-center`}>
                                                    {ok ? <Check className="w-4 h-4 text-white" /> : <X className="w-4 h-4 text-white" />}
                                                </span>
                                                <div>
                                                    <p className="font-semibold text-neutral-900 dark:text-neutral-100">{i + 1}. {s.title}</p>
                                                    {!ok && s.explanation && (
                                                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{s.explanation}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <button
                                onClick={() => onAnswer(allCorrect, null, question)}
                                className="w-full btn-primary mt-4 py-3"
                            >
                                Continue
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
