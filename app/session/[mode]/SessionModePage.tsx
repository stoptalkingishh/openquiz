'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { X, AlertCircle } from 'lucide-react'
import { buildSession, updateProgress, buildQuestionSession, buildTestSession } from '../../lib/session'
import { Word, Question, SessionMode, QuizQuestion } from '../../lib/satTypes'
import QuestionCard from '../../components/QuestionCard'
import { useAuth } from '../../contexts/AuthContext'
import { getWordProgress, saveWordProgress, getCustomQuizById, getQuizSetByPath, recordQuizSession, loadOfficialQuiz } from '../../lib/db'
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
    const [loadError, setLoadError] = useState<string | null>(null)
    const [showExitConfirm, setShowExitConfirm] = useState(false)
    const [retryKey, setRetryKey] = useState(0)

    const startTimeRef = useRef<number>(Date.now())
    const correctCountRef = useRef(0)
    const quizMetaRef = useRef<{ id: string; name: string }>({ id: selectedQuizPath, name: selectedQuizPath })

    useEffect(() => {
        if (!user) {
            router.push('/auth')
            return
        }

        // Everyone may run both custom quizzes and pre-made/official sets.

        setLoading(true)
        setLoadError(null)

        // If the quiz data or Drive cannot be reached, fail fast instead of
        // sitting on an infinite spinner.
        const timeout = setTimeout(() => {
            setLoadError('This is taking too long. Check your connection and try again.')
            setLoading(false)
        }, 12000)

        // Load words and progress
        const loadQuizData = async (): Promise<{ words?: Word[]; questions?: QuizQuestion[] }> => {
            // Check if it's a custom quiz (starts with /custom-quiz/)
            if (selectedQuizPath.startsWith('/custom-quiz/')) {
                const quizId = selectedQuizPath.replace('/custom-quiz/', '')
                const quiz = await getCustomQuizById(quizId)
                if (!quiz) return { words: [] }
                quizMetaRef.current = { id: quizId, name: quiz.name || quizId }
                if (Array.isArray(quiz.questions) && quiz.questions.length) {
                    return { questions: quiz.questions }
                }
                return { words: Array.isArray(quiz.words) ? quiz.words : [] }
            } else {
                // Regular JSON file — may be vocab words OR manual questions.
                const official = await getQuizSetByPath(selectedQuizPath)
                const setName = official?.name || selectedQuizPath.split('/').pop()?.replace('.json', '') || selectedQuizPath
                quizMetaRef.current = { id: selectedQuizPath, name: setName }
                const { words, questions } = await loadOfficialQuiz(selectedQuizPath)
                if (questions.length) return { questions }
                return { words }
            }
        }

        startTimeRef.current = Date.now()
        correctCountRef.current = 0

        Promise.all([
            loadQuizData(),
            getWordProgress(user.id)
        ]).then(([quizData, progressData]) => {
            clearTimeout(timeout)
            setWords(quizData.words || [])
            setProgress(progressData)

            const buildFromQuestions = (q: Question[]) => {
                if (!q.length) {
                    setLoadError('This quiz has no studyable content. Try another quiz.')
                    setLoading(false)
                    return
                }
                setQuestions(q)
                setLoading(false)
            }

            if (quizData.questions && quizData.questions.length) {
                // Question-based quiz: build directly from the manual questions.
                const q = mode === 'test'
                    ? buildTestSession(undefined, quizData.questions, Math.min(20, quizData.questions.length))
                    : buildQuestionSession(mode, quizData.questions, progressData, Math.min(50, quizData.questions.length))
                buildFromQuestions(q)
                return
            }

            // Build session with all words or reasonable limit
            // For learn mode: use all words to ensure full coverage
            // For other modes: use larger limit to avoid cycling
            const wordsOrUndefined = quizData.words || []
            const sessionLimit = mode === 'learn' ? undefined : Math.min(50, wordsOrUndefined.length)
            const q = mode === 'test'
                ? buildTestSession(wordsOrUndefined, undefined, 20)
                : buildSession(mode, wordsOrUndefined, progressData, sessionLimit)
            buildFromQuestions(q)
        }).catch(err => {
            clearTimeout(timeout)
            console.error('Error loading quiz:', err)
            setLoadError('Something went wrong while loading this quiz. Please try again.')
            setLoading(false)
        })
    }, [user, mode, router, selectedQuizPath, retryKey])

    const finishSession = (correct: number, total: number) => {
        const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000)
        recordQuizSession(quizMetaRef.current.id, quizMetaRef.current.name, { correct, total, seconds: elapsed })
            .catch(e => console.error('Failed to record session:', e))
        router.push('/')
    }

    const handleAnswer = async (correct: boolean) => {
        if (!user) return

        const currentQ = questions[index]
        const newProgress = updateProgress(progress[currentQ.word], correct, currentQ.word)

        if (correct) correctCountRef.current += 1

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
            finishSession(correctCountRef.current, questions.length)
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

    if (loadError) return (
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-6">
            <div className="card max-w-md w-full text-center p-8">
                <AlertCircle className="w-12 h-12 text-warning mx-auto mb-3" />
                <h2 className="text-xl font-bold mb-2">Couldn&apos;t Start Studying</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">{loadError}</p>
                <button onClick={() => setRetryKey(k => k + 1)} className="btn-primary w-full mb-3">
                    Try Again
                </button>
                <button onClick={() => router.push('/quizzes')} className="btn-outline w-full">
                    Back to Quizzes
                </button>
            </div>
        </div>
    )

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