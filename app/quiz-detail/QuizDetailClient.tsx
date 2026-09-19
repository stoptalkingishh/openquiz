'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Play, BookOpen, Globe, Lock, Share2, Copy, Users, Check, Gamepad2, ClipboardList, Folder, FolderPlus, Trophy, Trash2 } from 'lucide-react'
import { getCustomQuizById, getQuizSetByPath, getFolders, setQuizInFolder, createFolder, getQuizStats, loadOfficialQuiz, deleteCustomQuiz } from '../lib/db'
import { buildShareData } from '../lib/share'
import { useQuizStore } from '../lib/quizStore'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'
import { motion, AnimatePresence } from 'framer-motion'

export default function QuizDetailClient() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const quizId = searchParams.get('id')
    const pathParam = searchParams.get('path')
    const { setSelectedQuizPath, selectedQuizPath } = useQuizStore()
    const { user } = useAuth()
    const [quiz, setQuiz] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [showShareModal, setShowShareModal] = useState(false)
    const [expandedWord, setExpandedWord] = useState<string | null>(null)
    const [folders, setFolders] = useState<any[]>([])
    const [stats, setStats] = useState<any>(null)
    const [showFolderPicker, setShowFolderPicker] = useState(false)
    const [newFolderName, setNewFolderName] = useState('')

    const loadQuiz = useCallback(async () => {
        try {
            if (quizId) {
                const customQuiz = await getCustomQuizById(quizId)
                if (!customQuiz) {
                    router.push('/quizzes')
                    return
                }
                setQuiz({ ...customQuiz, isCustom: true })
                setLoading(false)
                return
            }

            if (pathParam) {
                const normalized = pathParam.startsWith('/') ? pathParam : `/${pathParam}`
                const officialQuiz = await getQuizSetByPath(normalized)
                if (!officialQuiz) {
                    router.push('/quizzes')
                    return
                }
                const { words, questions } = await loadOfficialQuiz(officialQuiz.file_path)
                setQuiz({ ...officialQuiz, words, questions, isCustom: false })
                setLoading(false)
                return
            }

            router.push('/quizzes')
        } catch (error) {
            console.error('Error loading quiz:', error)
            router.push('/quizzes')
        }
    }, [quizId, pathParam, router])

    useEffect(() => {
        if (!quizId && !pathParam) {
            router.push('/quizzes')
            return
        }
        loadQuiz()
    }, [quizId, pathParam, router, loadQuiz])

    useEffect(() => {
        getFolders().then(setFolders)
    }, [])

    useEffect(() => {
        if (!quiz) return
        getQuizStats(quiz.isCustom ? quizId || '' : quiz.file_path || '').then(setStats)
    }, [quiz, quizId])

    useEffect(() => {
        if (quiz && quiz.name) {
            document.title = `${quiz.name} | OpenQuiz`
        }
    }, [quiz])

    const handleStart = () => {
        if (quiz.isCustom) {
            setSelectedQuizPath(`/custom-quiz/${quizId}`)
        } else if (quiz.file_path) {
            setSelectedQuizPath(quiz.file_path)
        }
        router.push('/session/learn')
    }

    const handlePlayMode = (mode: 'test' | 'match') => {
        if (quiz.isCustom) {
            setSelectedQuizPath(`/custom-quiz/${quizId}`)
        } else if (quiz.file_path) {
            setSelectedQuizPath(quiz.file_path)
        }
        router.push(mode === 'test' ? '/session/test' : '/match')
    }

    const handleDeleteQuiz = async () => {
        if (!quiz?.isCustom || !quizId) return
        const ok = window.confirm(`Delete "${quiz.name}" permanently? This cannot be undone.`)
        if (!ok) return
        await deleteCustomQuiz(quizId)
        if (selectedQuizPath === `/custom-quiz/${quizId}`) {
            setSelectedQuizPath('')
        }
        router.push('/quizzes')
    }

    // `quiz` starts as null on the first render, so every dereference here
    // must be optional-chained — the `if (!quiz)` guard below only exists
    // after the early-return checks, and `quizStorageId` is computed above it.
    const quizStorageId = quiz?.isCustom ? (quizId || '') : (quiz?.file_path || '')

    const handleFolderSelect = async (folderId: string | null) => {
        await setQuizInFolder(folderId, quizStorageId)
        setShowFolderPicker(false)
        setFolders(await getFolders())
    }

    const handleCreateFolder = async () => {
        if (!newFolderName.trim() || !user) return
        const fresh = await createFolder(user.id, newFolderName.trim())
        setNewFolderName('')
        setFolders(await getFolders())
        if (fresh) await handleFolderSelect(fresh.id)
    }

    const shareData = quiz?.isCustom ? buildShareData(quiz) : null
    const shareTooLarge = quiz?.isCustom && shareData === null

    const getShareUrl = () => {
        if (quiz.isCustom) {
            // Embed the whole quiz in the URL so the link works on any static host
            if (shareData === null) return ''
            return `${typeof window !== 'undefined' ? window.location.origin : ''}${process.env.NEXT_PUBLIC_BASE_PATH || ''}/quiz/share?data=${shareData}`
        }
        return `${typeof window !== 'undefined' ? window.location.origin : ''}${process.env.NEXT_PUBLIC_BASE_PATH || ''}/quiz/share?path=${encodeURIComponent(quiz.file_path || '')}`
    }

    const copyShareLink = async () => {
        const url = getShareUrl()
        try {
            await navigator.clipboard.writeText(url)
            alert('Link copied to clipboard!')
        } catch {
            prompt('Copy this link:', url)
        }
    }

    const shareToSocial = (platform: 'twitter' | 'facebook' | 'telegram') => {
        const url = getShareUrl()
        const text = `Check out this SAT vocabulary quiz: ${quiz.name}`
        const encodedUrl = encodeURIComponent(url)
        const encodedText = encodeURIComponent(text)

        let shareUrl = ''
        switch (platform) {
            case 'twitter':
                shareUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`
                break
            case 'facebook':
                shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
                break
            case 'telegram':
                shareUrl = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
                break
        }

        window.open(shareUrl, '_blank', 'width=600,height=400,noopener,noreferrer')
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (!quiz) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
                <div className="text-center">
                    <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-4">Quiz not found</p>
                    <button
                        onClick={() => router.push('/quizzes')}
                        className="btn-primary"
                    >
                        Go to Quizzes
                    </button>
                </div>
            </div>
        )
    }

    const words = Array.isArray(quiz.words) ? quiz.words : []
const questions = Array.isArray(quiz.questions) ? quiz.questions : []
const itemLabel = questions.length ? 'questions' : 'words'
const itemCount = questions.length || words.length

function kindLabel(kind: string): string {
    switch (kind) {
        case 'multiple_choice': return 'Multiple Choice'
        case 'true_false': return 'True / False'
        case 'flashcard': return 'Flashcard'
        case 'simulation': return 'Simulation'
        default: return 'Question'
    }
}

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24">
            <div className="p-6">
                <button
                    onClick={() => router.push('/quizzes')}
                    className="mb-6 flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Quizzes
                </button>

                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Quiz Header Card */}
                    <div className="card">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-20 h-20 flex-shrink-0 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 p-1.5 shadow-sm border border-primary/20 dark:border-primary/30">
                                <Logo className="w-full h-full" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-start justify-between mb-2">
                                    <h1 className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">
                                        {quiz.name}
                                    </h1>
                                    <div className={`badge-secondary flex items-center gap-1 ${quiz.is_public ? '' : 'opacity-60'}`}>
                                        {quiz.is_public ? (
                                            <>
                                                <Globe className="w-3 h-3" />
                                                Public
                                            </>
                                        ) : (
                                            <>
                                                <Lock className="w-3 h-3" />
                                                Private
                                            </>
                                        )}
                                    </div>
                                    {quiz.isCustom && (
                                        <button
                                            onClick={handleDeleteQuiz}
                                            className="p-2 rounded-lg text-neutral-400 hover:text-error hover:bg-error/10 transition-colors"
                                            title="Delete quiz"
                                            aria-label="Delete quiz"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                                {quiz.author_name && (
                                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2 flex items-center gap-2">
                                        <Users className="w-4 h-4" />
                                        by {quiz.author_name}
                                    </p>
                                )}
                                <p className="text-neutral-700 dark:text-neutral-300 mb-4">
                                    {quiz.description}
                                </p>
                                {Array.isArray(quiz.tags) && quiz.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {quiz.tags.map((tag: string, i: number) => (
                                            <span
                                                key={i}
                                                className="px-3 py-1 bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light rounded-lg text-xs font-semibold"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
                                    <span className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4" />
                                        {itemCount} {itemLabel}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setShowShareModal(true)}
                                className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2 font-semibold"
                            >
                                <Share2 className="w-5 h-5" />
                                Share
                            </button>
                            <button
                                onClick={() => handlePlayMode('test')}
                                className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2 font-semibold"
                            >
                                <ClipboardList className="w-5 h-5" />
                                Test
                            </button>
                            <button
                                onClick={() => handlePlayMode('match')}
                                className="py-3 px-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2 font-semibold"
                            >
                                <Gamepad2 className="w-5 h-5" />
                                Match
                            </button>
                            <button
                                onClick={handleStart}
                                className="py-3 px-4 btn-primary flex items-center justify-center gap-2 text-lg"
                            >
                                <Play className="w-5 h-5" />
                                Learn
                            </button>
                        </div>

                        {/* Folder picker (custom quizzes only) */}
                        {quiz.isCustom && (
                            <div className="mt-4">
                                <button
                                    onClick={() => setShowFolderPicker(v => !v)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                >
                                    <span className="flex items-center gap-2 font-semibold text-neutral-700 dark:text-neutral-300">
                                        <Folder className="w-5 h-5" />
                                        {folders.find(f => (f.quiz_ids || []).includes(quizStorageId))?.name || 'No folder'}
                                    </span>
                                    <FolderPlus className="w-5 h-5 text-neutral-400" />
                                </button>

                                {showFolderPicker && (
                                    <div className="mt-2 p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl space-y-2">
                                        <button
                                            onClick={() => handleFolderSelect(null)}
                                            className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
                                        >
                                            No folder
                                        </button>
                                        {folders.map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => handleFolderSelect(f.id)}
                                                className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors flex items-center gap-2"
                                            >
                                                <Folder className="w-4 h-4" />
                                                {f.name}
                                                {(f.quiz_ids || []).includes(quizStorageId) && (
                                                    <Check className="w-4 h-4 text-secondary ml-auto" />
                                                )}
                                            </button>
                                        ))}
                                        <div className="flex gap-2 pt-2 border-t-2 border-neutral-200 dark:border-neutral-700">
                                            <input
                                                type="text"
                                                value={newFolderName}
                                                onChange={(e) => setNewFolderName(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder() }}
                                                placeholder="New folder name..."
                                                className="input-field flex-1 py-2 text-sm"
                                            />
                                            <button
                                                onClick={handleCreateFolder}
                                                disabled={!newFolderName.trim()}
                                                className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Study stats */}
                        {stats && (
                            <div className="mt-4 grid grid-cols-3 gap-3">
                                <div className="card text-center py-3">
                                    <Trophy className="w-5 h-5 text-secondary mx-auto mb-1" />
                                    <div className="text-xl font-bold">{stats.plays}</div>
                                    <div className="text-xs text-neutral-500 dark:text-neutral-400">Studied</div>
                                </div>
                                <div className="card text-center py-3">
                                    <div className="text-xl font-bold">{stats.bestAccuracy}%</div>
                                    <div className="text-xs text-neutral-500 dark:text-neutral-400">Best accuracy</div>
                                </div>
                                <div className="card text-center py-3">
                                    <div className="text-xl font-bold">{stats.bestCorrect}</div>
                                    <div className="text-xs text-neutral-500 dark:text-neutral-400">Best score</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Content List */}
                    <div className="card">
                        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                            {questions.length ? `Questions (${questions.length})` : `Vocabulary Words (${words.length})`}
                        </h2>
                        {questions.length ? (
                            <div className="space-y-2">
                                {questions.map((q: any, qIndex: number) => (
                                    <div
                                        key={q.id}
                                        className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden"
                                    >
                                        <div className="p-4">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 w-8 shrink-0">
                                                    {qIndex + 1}
                                                </span>
                                                <span className="badge-primary">{kindLabel(q.kind)}</span>
                                            </div>
                                            <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100 pl-11">
                                                {q.prompt}
                                            </h3>
                                            {q.image && (
                                                <div className="pl-11 mt-2">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={q.image} alt="Question media" className="rounded-xl max-h-48 w-full max-w-full object-contain border-2 border-neutral-200 dark:border-neutral-700" />
                                                </div>
                                            )}
                                            {q.kind === 'simulation' && Array.isArray(q.steps) && (
                                                <div className="pl-11 mt-2 space-y-1">
                                                    {q.steps.map((s: any, si: number) => (
                                                        <p key={s.id || si} className="text-sm text-neutral-600 dark:text-neutral-400">
                                                            Step {si + 1}: {s.title || '(untitled)'}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                            {q.kind === 'multiple_choice' && Array.isArray(q.options) && (
                                                <div className="pl-11 mt-2 space-y-1">
                                                    {q.options.map((opt: string, oi: number) => (
                                                        <p key={oi} className={`text-sm ${oi === q.correctIndex ? 'text-secondary dark:text-secondary-light font-semibold' : 'text-neutral-600 dark:text-neutral-400'}`}>
                                                            {String.fromCharCode(65 + oi)}. {opt} {oi === q.correctIndex && '(answer)'}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                            {q.kind === 'true_false' && (
                                                <p className="pl-11 mt-2 text-sm text-secondary dark:text-secondary-light font-semibold">
                                                    Answer: {q.correctAnswer ? 'True' : 'False'}
                                                </p>
                                            )}
                                            {q.kind === 'flashcard' && q.answer && (
                                                <p className="pl-11 mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                                                    Answer: {q.answer}
                                                </p>
                                            )}
                                            {q.explanation && (
                                                <p className="pl-11 mt-2 text-sm italic text-neutral-500 dark:text-neutral-400">
                                                    {q.explanation}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                        <div className="space-y-2">
                            {words.map((word: any, index: number) => {
                                const isExpanded = expandedWord === word.word

                                return (
                                    <motion.div
                                        key={word.word}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.02 }}
                                        className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden hover:border-primary/50 transition-colors"
                                    >
                                        <button
                                            onClick={() => setExpandedWord(isExpanded ? null : word.word)}
                                            className="w-full p-4 text-left flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                                        >
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 w-8">
                                                        {index + 1}
                                                    </span>
                                                    <div>
                                                        <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
                                                            {word.word}
                                                        </h3>
                                                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                                            {word.ru}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            <motion.div
                                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                                transition={{ duration: 0.3 }}
                                            >
                                                <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </motion.div>
                                        </button>

                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3 }}
                                                    className="border-t-2 border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
                                                >
                                                    <div className="p-4 space-y-4">
                                                        {/* Media */}
                                                        {word.image && (
                                                            <div>
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={word.image} alt={word.word} className="rounded-xl max-h-48 w-full max-w-full object-contain border-2 border-neutral-200 dark:border-neutral-700" />
                                                            </div>
                                                        )}

                                                        {/* Synonyms */}
                                                        {word.synonyms && word.synonyms.length > 0 && (
                                                            <div>
                                                                <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                                                    Synonyms:
                                                                </p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {word.synonyms.map((syn: string, i: number) => (
                                                                        <span
                                                                            key={i}
                                                                            className="px-3 py-1 bg-secondary/10 text-secondary dark:bg-secondary/20 rounded-lg text-sm font-semibold"
                                                                        >
                                                                            {syn}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Examples */}
                                                        {word.simple_examples && word.simple_examples.length > 0 && (
                                                            <div>
                                                                <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                                                    Examples:
                                                                </p>
                                                                <ul className="space-y-2">
                                                                    {word.simple_examples.map((example: string, i: number) => (
                                                                        <li
                                                                            key={i}
                                                                            className="text-sm text-neutral-700 dark:text-neutral-300 italic pl-4 border-l-2 border-primary/30"
                                                                        >
                                                                            {example}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}

                                                        {/* Advanced Example */}
                                                        {word.advanced_example && (
                                                            <div>
                                                                <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                                                    Advanced (SAT-style):
                                                                </p>
                                                                <p className="text-sm text-neutral-700 dark:text-neutral-300 italic pl-4 border-l-2 border-accent/30">
                                                                    {word.advanced_example}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Confusions */}
                                                        {word.confusions && word.confusions.length > 0 && (
                                                            <div>
                                                                <p className="text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                                                    Often confused with:
                                                                </p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {word.confusions.map((conf: string, i: number) => (
                                                                        <span
                                                                            key={i}
                                                                            className="px-3 py-1 bg-warning/10 text-warning dark:bg-warning/20 rounded-lg text-sm font-semibold"
                                                                        >
                                                                            {conf}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )
                            })}
                        </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Share Modal */}
            <AnimatePresence>
                {showShareModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowShareModal(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />

                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-2xl relative z-10 max-w-md w-full"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                                    Share Quiz
                                </h2>
                                <button
                                    onClick={() => setShowShareModal(false)}
                                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                                    aria-label="Close share dialog"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="mb-6">
                                <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100 mb-2">
                                    {quiz.name}
                                </h3>
                                <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                                    {quiz.description}
                                </p>

                                {/* Share Link */}
                                {shareTooLarge ? (
                                    <div className="bg-warning/10 border-2 border-warning rounded-xl p-4 mb-4">
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">
                                            This quiz is too large to share as a link — export it as JSON instead.
                                        </p>
                                    </div>
                                ) : (
                                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-4 mb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Share2 className="w-4 h-4 text-neutral-500" />
                                        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase">
                                            Share Link
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={getShareUrl()}
                                            readOnly
                                            className="flex-1 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-700 dark:text-neutral-300"
                                        />
                                        <button
                                            onClick={copyShareLink}
                                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-semibold"
                                        >
                                            <Copy className="w-4 h-4" />
                                            Copy
                                        </button>
                                    </div>
                                </div>
                                )}
                            </div>

                            <button
                                onClick={() => setShowShareModal(false)}
                                className="w-full py-3 px-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                            >
                                Close
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}