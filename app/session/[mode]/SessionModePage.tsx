'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { X, AlertCircle } from 'lucide-react'
import { buildSession, updateProgress } from '../../lib/session'
import { Word, Question, SessionMode } from '../../lib/satTypes'
import QuestionCard from '../../components/QuestionCard'
import { useAuth } from '../../contexts/AuthContext'
import { getWordProgress, saveWordProgress, getCustomQuizById } from '../../lib/db'
import { useQuizStore } from '../../lib/quizStore'
import { assetPath } from '../../lib/paths'
import { motion, AnimatePresence } from 'framer-motion'

export default function SessionModePage() {
    const params = useParams()
    const router = useRouter()
    const mode = params.mode as SessionMode
    const { user } = useAuth()
    const { selectedQuizPath } = useQuizStore()

    const [words, setWords] = useState<Word[]>([])
    const [questions, setQuestions] = useState<Question[]>([])
    const [index, setIndex] = useState(0)
    const [progress, setProgress] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState(true)
    const [showExitConfirm, setShowExitConfirm] = useState(false)

    useEffect(() => {
        if (!user) {
            router.push('/auth')
            return
        }

        // Load words and progress
        const loadWords = async () => {
            // Check if it's a custom quiz (starts with /custom-quiz/)
            if (selectedQuizPath.startsWith('/custom-quiz/')) {
                const quizId = selectedQuizPath.replace('/custom-quiz/', '')
                const quiz = await getCustomQuizById(quizId)
                if (quiz && quiz.words) {
                    return quiz.words
                }
                return []
            } else {
                // Regular JSON file
                const res = await fetch(assetPath(selectedQuizPath))
                return res.json()
            }
        }

        Promise.all([
            loadWords(),
            getWordProgress(user.id)
        ]).then(([wordsData, progressData]) => {
            setWords(wordsData)
            setProgress(progressData)

            // Build session with all words or reasonable limit
            // For learn mode: use all words to ensure full coverage
            // For other modes: use larger limit to avoid cycling
            const sessionLimit = mode === 'learn' ? undefined : Math.min(50, wordsData.length)
            const q = buildSession(mode, wordsData, progressData, sessionLimit)
            setQuestions(q)
            setLoading(false)
        }).catch(err => {
            console.error('Error loading quiz:', err)
            setLoading(false)
        })
    }, [user, mode, router, selectedQuizPath])

    const handleAnswer = async (correct: boolean) => {
        if (!user) return

        const currentQ = questions[index]
        const newProgress = updateProgress(progress[currentQ.word], correct, currentQ.word)

        // Persist progress locally (cloud sync comes later)
        await saveWordProgress(user.id, currentQ.word, newProgress)

        // Update local state
        setProgress({
            ...progress,
            [currentQ.word]: newProgress
        })

        if (index + 1 < questions.length) {
            setIndex(index + 1)
        } else {
            // Finish
            router.push('/')
        }
    }

    const handleExit = async () => {
        // Save current progress before exiting
        if (user && questions[index]) {
            const currentQ = questions[index]
            const currentProgress = progress[currentQ.word]
            if (currentProgress) {
                await saveWordProgress(user.id, currentQ.word, currentProgress)
            }
        }
        router.push('/')
    }

    const handleExitClick = () => {
        if (index > 0) {
            // Show confirmation if there's progress
            setShowExitConfirm(true)
        } else {
            // No progress, exit immediately
            handleExit()
        }
    }

    if (loading || !questions.length) return (
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    )

    const current = questions[index]
    const progressPercent = ((index) / questions.length) * 100

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark dark:bg-stars flex flex-col">
            {/* Header */}
            <div className="px-6 py-6 flex items-center gap-4">
                <button 
                    onClick={handleExitClick} 
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    title="Exit session"
                >
                    <X className="w-6 h-6" />
                </button>
                <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300 rounded-full"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
                <span className="text-sm font-bold text-gray-600 dark:text-gray-400">
                    {index + 1}/{questions.length}
                </span>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 flex flex-col items-center justify-center">
                <QuestionCard
                    key={current.id}
                    question={current}
                    onAnswer={handleAnswer}
                />
            </div>

            {/* Exit Confirmation Modal */}
            <AnimatePresence>
                {showExitConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowExitConfirm(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-2xl relative z-10 max-w-sm w-full"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                                    <AlertCircle className="w-6 h-6 text-orange-500" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
                                        Exit Session?
                                    </h3>
                                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                        Your progress will be saved
                                    </p>
                                </div>
                            </div>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
                                You&apos;ve completed {index} of {questions.length} questions. Your progress will be saved automatically.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowExitConfirm(false)}
                                    className="flex-1 py-3 px-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                >
                                    Continue
                                </button>
                                <button
                                    onClick={handleExit}
                                    className="flex-1 py-3 px-4 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                                >
                                    Exit
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}