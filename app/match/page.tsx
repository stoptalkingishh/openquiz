'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Timer, Trophy, RotateCcw, Gamepad2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useQuizStore } from '../lib/quizStore'
import { getCustomQuizById, getQuizSetByPath, recordQuizSession, loadOfficialQuiz } from '../lib/db'
import { Word, QuizQuestion } from '../lib/satTypes'
import { motion, AnimatePresence } from 'framer-motion'

interface MatchPair {
    id: string
    term: string
    answer: string
}

interface MatchCard {
    pairId: string
    side: 'term' | 'answer'
    text: string
}

function shuffle<T>(array: T[]): T[] {
    const arr = [...array]
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
}

export default function MatchPage() {
    const router = useRouter()
    const { user, loading: authLoading } = useAuth()
    const { selectedQuizPath } = useQuizStore()

    const [loading, setLoading] = useState(true)
    const [cards, setCards] = useState<MatchCard[]>([])
    const [selected, setSelected] = useState<number | null>(null)
    const [matched, setMatched] = useState<Record<string, boolean>>({})
    const [attempts, setAttempts] = useState(0)
    const [seconds, setSeconds] = useState(0)
    const [finished, setFinished] = useState(false)
    const [quizMeta, setQuizMeta] = useState<{ id: string; name: string }>({ id: '', name: '' })
    const totalPairs = useMemo(() => cards.length / 2, [cards])
    const matchedPairs = Object.keys(matched).length
    const isDone = totalPairs > 0 && matchedPairs === totalPairs

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/auth')
            return
        }
        if (authLoading) return
        loadQuiz()
    }, [user, authLoading, router, selectedQuizPath])

    const loadQuiz = async () => {
        try {
            let words: Word[] = []
            let questions: QuizQuestion[] = []
            let meta = { id: selectedQuizPath || '/sat/1.json', name: selectedQuizPath || 'Quiz' }

            if (selectedQuizPath.startsWith('/custom-quiz/')) {
                const quizId = selectedQuizPath.replace('/custom-quiz/', '')
                const quiz = await getCustomQuizById(quizId)
                if (!quiz) {
                    router.push('/quizzes')
                    return
                }
                meta = { id: quizId, name: quiz.name || quizId }
                words = Array.isArray(quiz.words) ? quiz.words : []
                questions = Array.isArray(quiz.questions) ? quiz.questions : []
            } else {
                const official = await getQuizSetByPath(selectedQuizPath)
                if (official) meta = { id: selectedQuizPath, name: official.name }
                const loaded = await loadOfficialQuiz(selectedQuizPath)
                words = loaded.words
                questions = loaded.questions
            }

            setQuizMeta(meta)
            const pairs = buildPairs(words, questions)
            if (pairs.length < 3) {
                setCards([])
                setLoading(false)
                return
            }
            setCards(buildCards(pairs))
            setLoading(false)
        } catch (err) {
            console.error('Error loading quiz:', err)
            router.push('/quizzes')
        }
    }

    const buildPairs = (words: Word[], questions: QuizQuestion[]): MatchPair[] => {
        const pairs: MatchPair[] = []
        if (questions && questions.length) {
            for (const q of questions) {
                if (q.kind === 'flashcard' && q.prompt && q.answer) {
                    pairs.push({ id: q.id, term: q.prompt, answer: q.answer })
                } else if (q.kind === 'multiple_choice' && q.options && q.options.length) {
                    const correct = q.options[q.correctIndex ?? 0]
                    if (correct) pairs.push({ id: q.id, term: q.prompt, answer: correct })
                }
            }
        } else {
            for (const w of words) {
                if (!w.word) continue
                const answer = (w.ru || '').trim() || (Array.isArray(w.synonyms) && w.synonyms[0]) || ''
                if (!answer) continue
                pairs.push({ id: w.word, term: w.word, answer })
            }
        }
        return shuffle(pairs).slice(0, 8)
    }

    const buildCards = (pairs: MatchPair[]): MatchCard[] =>
        shuffle(pairs.flatMap(p => ([
            { pairId: p.id, side: 'term' as const, text: p.term },
            { pairId: p.id, side: 'answer' as const, text: p.answer }
        ])))

    useEffect(() => {
        if (isDone && !finished) {
            setFinished(true)
            const elapsed = seconds
            recordQuizSession(quizMeta.id, quizMeta.name, { correct: totalPairs, total: totalPairs, seconds: elapsed })
                .catch(e => console.error('Failed to record match:', e))
        }
    }, [isDone, finished, seconds, totalPairs, quizMeta])

    // Timer
    useEffect(() => {
        if (finished) return
        const interval = setInterval(() => setSeconds(s => s + 1), 1000)
        return () => clearInterval(interval)
    }, [finished])

    const handleCardClick = (i: number) => {
        if (finished) return
        const card = cards[i]
        if (matched[card.pairId]) return

        if (selected === null) {
            setSelected(i)
            return
        }
        if (selected === i) {
            setSelected(null)
            return
        }

        const first = cards[selected]
        const isMatch = first.pairId === card.pairId && first.side !== card.side
        setAttempts(a => a + 1)
        if (isMatch) {
            setMatched(m => ({
                ...m,
                [card.pairId]: true
            }))
            // remove selection after match
            setSelected(null)
        } else {
            // wrong pair: briefly keep both highlighted, then clear
            setSelected(null)
        }
    }

    const handleRestart = () => {
        // Rebuild a fresh shuffled board with the same pairs.
        const pairMap: Record<string, { term: string; answer: string }> = {}
        for (const c of cards) {
            pairMap[c.pairId] = { ...(pairMap[c.pairId] || { term: '', answer: '' }), [c.side]: c.text }
        }
        const freshPairs: MatchPair[] = Object.entries(pairMap)
            .filter(([, p]) => p.term && p.answer)
            .map(([id, p]) => ({ id, term: p.term, answer: p.answer }))
        setCards(buildCards(freshPairs))
        setSelected(null)
        setMatched({})
        setAttempts(0)
        setSeconds(0)
        setFinished(false)
    }

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${m}:${sec.toString().padStart(2, '0')}`
    }

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    )

    if (cards.length < 3) return (
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark p-6">
            <div className="card max-w-md w-full text-center p-8">
                <Gamepad2 className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                <h2 className="text-xl font-bold mb-2">No matchable cards</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
                    Match needs at least 3 vocabulary words or flashcard / multiple-choice questions.
                </p>
                <button onClick={() => router.push('/quizzes')} className="btn-primary w-full">
                    Back to Quizzes
                </button>
            </div>
        </div>
    )

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24">
            <div className="max-w-3xl mx-auto p-6">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <button
                        onClick={() => router.back()}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                        aria-label="Back"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-extrabold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                            <Gamepad2 className="w-5 h-5 text-primary" />
                            Match
                        </h1>
                    </div>
                    <div className="flex items-center gap-3 text-sm font-bold text-neutral-600 dark:text-neutral-400">
                        <span className="flex items-center gap-1">
                            <Timer className="w-4 h-4" />
                            {formatTime(seconds)}
                        </span>
                        <span className="px-3 py-1 rounded-full bg-primary/10 text-primary dark:text-primary-light">
                            {matchedPairs}/{totalPairs}
                        </span>
                    </div>
                </div>

                <p className="text-center text-sm text-neutral-500 dark:text-neutral-400 mb-6">
                    Tap the word and its matching answer
                </p>

                {/* Board */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {cards.map((card, i) => {
                        const isMatched = matched[card.pairId]
                        const isSelected = selected === i
                        let stateClass = 'card-interactive border-2'
                        if (isMatched) {
                            stateClass = 'card border-2 border-secondary bg-secondary/10 dark:border-secondary-light opacity-60'
                        } else if (isSelected) {
                            stateClass = 'card border-2 border-primary dark:border-primary-light bg-primary/10'
                        }
                        return (
                            <motion.button
                                key={`${card.pairId}-${card.side}-${i}`}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.02 }}
                                onClick={() => handleCardClick(i)}
                                disabled={isMatched}
                                className={`p-4 min-h-[80px] rounded-xl font-semibold text-sm md:text-base text-neutral-800 dark:text-neutral-200 transition-all duration-150 ${stateClass}`}
                            >
                                {card.text}
                            </motion.button>
                        )
                    })}
                </div>

                {attempts > 0 && !finished && (
                    <p className="text-center text-xs text-neutral-500 dark:text-neutral-400 mt-4">
                        Attempts: {attempts}
                    </p>
                )}

                {/* Completion */}
                <AnimatePresence>
                    {finished && (
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        >
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                            <motion.div className="card relative z-10 max-w-sm w-full text-center p-8">
                                <div className="w-16 h-16 mx-auto rounded-full bg-secondary/10 flex items-center justify-center mb-4">
                                    <Trophy className="w-8 h-8 text-secondary" />
                                </div>
                                <h2 className="text-2xl font-extrabold mb-2">Matched!</h2>
                                <p className="text-neutral-600 dark:text-neutral-400 mb-1">
                                    {matchedPairs} pairs in {formatTime(seconds)}
                                </p>
                                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
                                    {attempts} attempts · {totalPairs} points
                                </p>
                                <button onClick={handleRestart} className="btn-primary w-full flex items-center justify-center gap-2 mb-3">
                                    <RotateCcw className="w-4 h-4" />
                                    Play Again
                                </button>
                                <button onClick={() => router.back()} className="btn-outline w-full">
                                    Back
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
