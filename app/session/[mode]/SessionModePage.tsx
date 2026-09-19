'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { X, AlertCircle, Menu, Volume2, VolumeX } from 'lucide-react'
import { buildSession, updateProgress, buildQuestionSession, buildTestSession, buildWriteSession } from '../../lib/session'
import { Word, Question, SessionMode, QuizQuestion } from '../../lib/satTypes'
import QuestionCard from '../../components/QuestionCard'
import SessionMenu, { ReviewRecord } from '../../components/SessionMenu'
import { useAuth } from '../../contexts/AuthContext'
import { getWordProgress, saveWordProgress, getCustomQuizById, getQuizSetByPath, recordQuizSession, loadOfficialQuiz } from '../../lib/db'
import { useQuizStore } from '../../lib/quizStore'
import { stopSpeech, isSpeaking, setOnTtsEnd } from '../../lib/tts'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

export default function SessionModePage() {
    const params = useParams()
    const router = useRouter()
    const mode = params.mode as SessionMode
    const { user, loading: authLoading } = useAuth()
    const { selectedQuizPath } = useQuizStore()

    const [words, setWords] = useState<Word[]>([])
    const [questions, setQuestions] = useState<Question[]>([])
    const [index, setIndex] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [showExitConfirm, setShowExitConfirm] = useState(false)
    const [retryKey, setRetryKey] = useState(0)
    const [menuOpen, setMenuOpen] = useState(false)
    const [history, setHistory] = useState<Record<string, ReviewRecord>>({})
    const [reading, setReading] = useState(false)
    const [answerRetryKey, setAnswerRetryKey] = useState(0)
    const [finishError, setFinishError] = useState<string | null>(null)

    const startTimeRef = useRef<number>(Date.now())
    const correctCountRef = useRef(0)
    const quizMetaRef = useRef<{ id: string; name: string }>({ id: selectedQuizPath, name: selectedQuizPath })
    const progressRef = useRef<Record<string, any>>({})
    const questionsRef = useRef<Question[]>([])
    const indexRef = useRef(0)
    const historyRef = useRef<Record<string, ReviewRecord>>({})
    const submittedRef = useRef<Set<string>>(new Set())
    const savePromisesRef = useRef<Record<string, Promise<void>>>({})
    const finishedRef = useRef(false)
    const sessionIdRef = useRef<string | null>(null)
    const pendingFinishRef = useRef<{ correct: number; total: number } | null>(null)
    const reduceMotion = useReducedMotion()

    // Reflect TTS state so a floating "reading" pill can appear even while the
    // tools menu is closed.
    useEffect(() => {
        const tick = () => setReading(isSpeaking())
        tick()
        const iv = setInterval(tick, 500)
        setOnTtsEnd(() => setReading(false))
        return () => { clearInterval(iv); setOnTtsEnd(null) }
    }, [])

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/auth')
            return
        }
        if (authLoading || !user) return
        const currentUser = user

        // Everyone may run both custom quizzes and pre-made/official sets.

        let cancelled = false

        setLoading(true)
        setLoadError(null)

        // If the quiz data or Drive cannot be reached, fail fast instead of
        // sitting on an infinite spinner.
        const timeout = setTimeout(() => {
            if (cancelled) return
            setLoadError('This is taking too long. Check your connection and try again.')
            setLoading(false)
        }, 12000)

        // Load words and progress
        const loadQuizData = async (): Promise<{ words?: Word[]; questions?: QuizQuestion[] }> => {
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
            getWordProgress(currentUser.id)
        ]).then(([quizData, progressData]) => {
            clearTimeout(timeout)
            if (cancelled) return
            setWords(quizData.words || [])
            progressRef.current = progressData

            const buildFromQuestions = (q: Question[]) => {
                if (quizData.questions?.length) {
                    q = q.map(question => ({ ...question, progressKey: question.progressKey || `${selectedQuizPath}::${question.id}` }))
                }
                if (cancelled) return
                if (!q.length) {
                    setLoadError('This quiz has no studyable content. Try another quiz.')
                    setLoading(false)
                    return
                }
                setQuestions(q)
                questionsRef.current = q
                indexRef.current = 0
                submittedRef.current.clear()
                historyRef.current = {}
                setHistory({})
                setIndex(0)
                finishedRef.current = false
                sessionIdRef.current = null
                pendingFinishRef.current = null
                setFinishError(null)
                setLoading(false)
            }

            if (quizData.questions && quizData.questions.length) {
                const q = mode === 'test'
                    ? buildTestSession(undefined, quizData.questions, Math.min(20, quizData.questions.length))
                    : buildQuestionSession(mode, quizData.questions, progressData, Math.min(50, quizData.questions.length), selectedQuizPath)
                buildFromQuestions(q)
                return
            }

            const wordsOrUndefined = quizData.words || []
            const sessionLimit = mode === 'learn' ? undefined : Math.min(50, wordsOrUndefined.length)
            const q = mode === 'test'
                ? buildTestSession(wordsOrUndefined, undefined, 20)
                : mode === 'write'
                    ? buildWriteSession(wordsOrUndefined, 20)
                    : buildSession(mode, wordsOrUndefined, progressData, sessionLimit)
            buildFromQuestions(q)
        }).catch(err => {
            clearTimeout(timeout)
            if (cancelled) return
            console.error('Error loading quiz:', err)
            setLoadError('Something went wrong while loading this quiz. Please try again.')
            setLoading(false)
        })

        return () => {
            cancelled = true
            clearTimeout(timeout)
        }
    }, [user, authLoading, mode, router, selectedQuizPath, retryKey])

    const finishSession = useCallback(async (correct: number, total: number) => {
        if (finishedRef.current) return
        finishedRef.current = true
        pendingFinishRef.current = { correct, total }
        setFinishError(null)
        if (!sessionIdRef.current) {
            sessionIdRef.current = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        }
        const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000)
        try {
            await recordQuizSession(quizMetaRef.current.id, quizMetaRef.current.name, {
                correct, total, seconds: elapsed, id: sessionIdRef.current
            })
            pendingFinishRef.current = null
            router.push('/')
        } catch (error) {
            finishedRef.current = false
            setFinishError(error instanceof Error ? error.message : 'Could not save this session. Please retry.')
            console.error('Failed to record session:', error)
        }
    }, [router])

    const handleAnswer = async (correct: boolean, chosen?: string | number | boolean | null, answeredQuestion?: Question, quality?: number) => {
        if (!user) return

        // Bind to the question that was actually answered. If the user
        // navigated during the feedback delay, this is still the original
        // question, not the one currently on screen.
        const currentQ = answeredQuestion || questionsRef.current[indexRef.current]
        if (!currentQ) return

        // Stop reading aloud if audio was playing.
        stopSpeech()

        // Guard against double-submit of the same question (e.g. double tap
        // on a simulation Continue button).
        if (submittedRef.current.has(currentQ.id)) return
        submittedRef.current.add(currentQ.id)

        const progressKey = (currentQ as Question & { progressKey?: string }).progressKey || currentQ.word
        const newProgress = updateProgress(progressRef.current[progressKey], correct, progressKey, quality)
        newProgress.word = currentQ.progressKey ? String(currentQ.payload.prompt || currentQ.word) : currentQ.word

        // Persist before committing the in-memory review. If local storage
        // rejects, the card remains retryable and the score is unchanged.
        const savePromise = saveWordProgress(user.id, progressKey, newProgress).then(() => {
            progressRef.current = { ...progressRef.current, [progressKey]: newProgress }
            if (correct) correctCountRef.current += 1
            const record = { correct, chosen: chosen ?? null }
            historyRef.current = { ...historyRef.current, [currentQ.id]: record }
            setHistory(historyRef.current)
        }).catch(error => {
            submittedRef.current.delete(currentQ.id)
            setAnswerRetryKey(key => key + 1)
            console.error('Failed to save answer:', error)
        })
        savePromisesRef.current[currentQ.id] = savePromise
        await savePromise
    }

    const handleContinue = useCallback(async (answeredQuestion?: Question) => {
        const currentQ = answeredQuestion || questionsRef.current[indexRef.current]
        if (!currentQ) return
        const pending = savePromisesRef.current[currentQ.id]
        if (pending) await pending
        if (!historyRef.current[currentQ.id]) return
        const currentIndex = indexRef.current
        if (questionsRef.current[currentIndex]?.id !== currentQ.id) return
        if (currentIndex + 1 < questionsRef.current.length) {
            indexRef.current = currentIndex + 1
            setIndex(currentIndex + 1)
        } else {
            const firstUnanswered = questionsRef.current.findIndex(q => !historyRef.current[q.id])
            if (firstUnanswered >= 0) {
                indexRef.current = firstUnanswered
                setIndex(firstUnanswered)
            } else {
                finishSession(correctCountRef.current, questionsRef.current.length)
            }
        }
    }, [finishSession])

    const goPrev = useCallback(() => {
        stopSpeech()
        const next = Math.max(0, indexRef.current - 1)
        indexRef.current = next
        setIndex(next)
    }, [])

    const goNext = useCallback(() => {
        stopSpeech()
        if (indexRef.current + 1 < questionsRef.current.length) {
            indexRef.current += 1
            setIndex(indexRef.current)
        }
    }, [])

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return
            if (e.key === 'ArrowLeft') goPrev()
            else if (e.key === 'ArrowRight') goNext()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [goPrev, goNext])

    const googleSearch = () => {
        const q = questions[index]
        const payload = q?.payload || {}
        let query = q?.word || String(payload.prompt || payload.sentence || '') || ''
        let answer = ''
        const options = Array.isArray(payload.options) ? payload.options : []
        if (options.length) {
            answer = String(options[payload.correctIndex ?? 0] ?? '')
        } else if (typeof payload.correctAnswer === 'boolean') {
            answer = payload.correctAnswer ? 'True' : 'False'
        } else if (payload.answer) {
            answer = String(payload.answer)
        } else if (q?.type === 'recall' && payload.ru) {
            answer = String(payload.ru)
        }
        const search = `${query} ${answer}`.trim()
        if (search) {
            window.open(`https://www.google.com/search?q=${encodeURIComponent(search)}`, '_blank', 'noopener,noreferrer')
        }
    }

    const handleExit = async () => {
        if (user && questions[index]) {
            const currentQ = questions[index]
            const progressKey = (currentQ as Question & { progressKey?: string }).progressKey || currentQ.word
            const currentProgress = progressRef.current[progressKey]
            if (currentProgress) {
                await saveWordProgress(user.id, progressKey, currentProgress)
            }
        }
        router.push('/')
    }

    const handleExitClick = () => {
        if (index > 0) {
            setShowExitConfirm(true)
        } else {
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

    if (finishError) return (
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-6">
            <div className="card max-w-md w-full text-center p-8">
                <AlertCircle className="w-12 h-12 text-warning mx-auto mb-3" />
                <h2 className="text-xl font-bold mb-2">Session not saved</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">{finishError}</p>
                <button
                    onClick={() => {
                        const pending = pendingFinishRef.current
                        if (pending) void finishSession(pending.correct, pending.total)
                    }}
                    className="btn-primary w-full"
                >
                    Retry saving
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
                <button
                    onClick={() => setMenuOpen(true)}
                    className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    title="Session tools"
                    aria-label="Open session tools"
                >
                    <Menu className="w-6 h-6" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 flex flex-col items-center justify-center">
                <QuestionCard
                    key={`${current.id}-${answerRetryKey}`}
                    question={current}
                    onAnswer={handleAnswer}
                    onContinue={handleContinue}
                    answered={history[current.id]}
                />
            </div>

            {/* Floating "reading aloud" pill when the menu is closed */}
            <AnimatePresence>
                {reading && !menuOpen && (
                    <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
                    >
                        <button
                            onClick={() => stopSpeech()}
                            className="flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 shadow-xl"
                            title="Stop reading"
                        >
                            <span className="flex gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '300ms' }} />
                            </span>
                            <span className="text-sm font-semibold">Reading</span>
                            <VolumeX className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Session tools drawer */}
            <SessionMenu
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                question={current}
                history={history[current.id]}
                index={index}
                total={questions.length}
                onPrev={goPrev}
                onNext={goNext}
                onGoogleSearch={googleSearch}
            />

            {/* Exit Confirmation Modal */}
            <AnimatePresence>
                {showExitConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={reduceMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowExitConfirm(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={reduceMotion ? false : { scale: 0.9, opacity: 0 }}
                            animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
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
