'use client'

import { useState } from 'react'
import { Question } from '../lib/satTypes'
import { Eye, Check, X, BookOpen } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface QuestionCardProps {
    question: Question
    onAnswer: (correct: boolean) => void
}

export default function QuestionCard({ question, onAnswer }: QuestionCardProps) {
    if (question.type === 'recall') {
        return <RecallCard question={question} onAnswer={onAnswer} />
    }
    if (question.type === 'simple_usage' || question.type === 'sat_cloze') {
        return <MultipleChoiceCard question={question} onAnswer={onAnswer} />
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
    return <div>Unknown question type</div>
}

function RecallCard({ question, onAnswer }: QuestionCardProps) {
    const [revealed, setRevealed] = useState(false)
    const { word, ru, synonyms, example } = question.payload

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
                            <p className="text-2xl font-semibold text-primary dark:text-primary-light mb-2">{ru}</p>
                        </div>

                        <div className="text-left space-y-4">
                            <div>
                                <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">Example</p>
                                <p className="text-lg italic text-neutral-700 dark:text-neutral-300 leading-relaxed">&ldquo;{example}&rdquo;</p>
                            </div>

                            <div>
                                <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">Synonyms</p>
                                <div className="flex flex-wrap gap-2">
                                    {synonyms.map((s: string) => (
                                        <span key={s} className="badge-primary">
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
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

function MultipleChoiceCard({ question, onAnswer }: QuestionCardProps) {
    const [selected, setSelected] = useState<number | null>(null)
    const [submitted, setSubmitted] = useState(false)

    const { sentence, options, correctIndex } = question.payload
    const correctWord = options[correctIndex]

    // Get word data from question
    const wordData = question.payload.wordData || { ru: '', synonyms: [] }

    const handleSubmit = () => {
        if (selected === null) return
        setSubmitted(true)

        setTimeout(() => {
            onAnswer(selected === correctIndex)
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

                {/* Question text */}
                <div className="card p-8 mb-8 min-h-[200px] flex items-center justify-center">
                    <p className="text-xl md:text-2xl font-medium leading-relaxed text-center text-neutral-800 dark:text-neutral-200">
                        {sentence.split('_______').map((part: string, i: number) => (
                            <span key={i}>
                                {part}
                                {i < sentence.split('_______').length - 1 && (
                                    <span className="inline-block min-w-[120px] border-b-4 border-primary/30 dark:border-primary/40 mx-2 relative top-1"></span>
                                )}
                            </span>
                        ))}
                    </p>
                </div>

                {/* Options */}
                <div className="space-y-3 mb-6">
                    {options.map((opt: string, i: number) => {
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
                                        {wordData.synonyms && wordData.synonyms.length > 0 && (
                                            <div>
                                                <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Synonyms:</span>
                                                <div className="flex flex-wrap gap-2 mt-1">
                                                    {wordData.synonyms.map((syn: string) => (
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

    const handleSubmit = () => {
        if (selected === null) return
        setSubmitted(true)
        setTimeout(() => {
            onAnswer(selected === correctIndex)
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

                <div className="card p-8 mb-8 min-h-[160px] flex items-center justify-center">
                    <p className="text-xl md:text-2xl font-medium leading-relaxed text-center text-neutral-800 dark:text-neutral-200">
                        {prompt}
                    </p>
                </div>

                <div className="space-y-3 mb-6">
                    {options.map((opt: string, i: number) => {
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
                                            The correct answer is: <span className="font-bold text-neutral-900 dark:text-neutral-100">{options[correctIndex]}</span>
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
            onAnswer(value === correctAnswer)
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
