'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Play, BookOpen } from 'lucide-react'
import { useQuizStore } from '../../lib/quizStore'
import { useAuth } from '../../contexts/AuthContext'
import { createCustomQuiz, getQuizSetByPath, loadOfficialQuiz, normalizeImportedQuizItems } from '../../lib/db'
import Logo from '../../components/Logo'

interface SharedQuiz {
    name: string
    description: string
    words: any[]
    questions: any[]
    author_name?: string | null
}

const MAX_SHARED_PAYLOAD_CHARS = 100_000

function textValue(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value.trim() : fallback
}

function normalizeOfficialPath(value: string): string {
    let normalized = value.trim()
    if (!normalized.startsWith('/')) normalized = `/${normalized}`
    return normalized.replace(new RegExp('/{2,}', 'g'), '/')
}

function parseSharedQuiz(dataParam: string): SharedQuiz {
    if (dataParam.length > MAX_SHARED_PAYLOAD_CHARS) {
        throw new Error('This shared quiz link is too large to load.')
    }

    let raw: any
    try {
        raw = JSON.parse(dataParam)
    } catch {
        throw new Error('The shared quiz link contains invalid data.')
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('The shared quiz payload must be an object.')
    }

    const hasWords = Array.isArray(raw.words)
    const hasQuestions = Array.isArray(raw.questions)
    if (!hasWords && !hasQuestions) {
        throw new Error('The shared quiz does not contain any quiz items.')
    }

    // Normalize the complete payload together so mixed vocabulary/question
    // links preserve every item instead of silently dropping one category.
    const normalized = normalizeImportedQuizItems([
        ...(hasWords ? raw.words : []),
        ...(hasQuestions ? raw.questions : [])
    ])
    if (normalized.errors.length) {
        throw new Error(`The shared quiz is invalid: ${normalized.errors.slice(0, 3).join(' ')}`)
    }
    if (!normalized.words.length && !normalized.questions.length) {
        throw new Error('The shared quiz does not contain any valid items.')
    }

    return {
        name: textValue(raw.name, 'Shared Vocabulary Quiz'),
        description: textValue(raw.description),
        author_name: textValue(raw.author_name) || null,
        words: normalized.words,
        questions: normalized.questions
    }
}

export default function QuizShareClient() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathParam = searchParams.get('path')
    const dataParam = searchParams.get('data')
    const { setSelectedQuizPath } = useQuizStore()
    const { user } = useAuth()
    const [words, setWords] = useState<any[]>([])
    const [questions, setQuestions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [quizName, setQuizName] = useState('')
    const [authorName, setAuthorName] = useState<string | null>(null)
    const [description, setDescription] = useState('')
    const [embeddedQuiz, setEmbeddedQuiz] = useState<SharedQuiz | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [starting, setStarting] = useState(false)

    const loadQuiz = useCallback(async () => {
        setLoading(true)
        setError(null)
        setWords([])
        setQuestions([])
        setEmbeddedQuiz(null)
        try {
            if (dataParam) {
                const data = parseSharedQuiz(dataParam)
                setWords(data.words)
                setQuestions(data.questions)
                setQuizName(data.name)
                setDescription(data.description)
                setAuthorName(data.author_name || null)
                setEmbeddedQuiz(data)
                setLoading(false)
                return
            }

            if (pathParam) {
                const normalizedPath = normalizeOfficialPath(pathParam)
                // The manifest is the allowlist for official share links. Do
                // not fetch arbitrary paths supplied in the URL.
                const quizSet = await getQuizSetByPath(normalizedPath)
                if (!quizSet || typeof quizSet.file_path !== 'string') {
                    throw new Error('That official quiz link is not recognized.')
                }

                const loaded = await loadOfficialQuiz(quizSet.file_path)
                if (!loaded.words.length && !loaded.questions.length) {
                    throw new Error('The official quiz contains no valid items.')
                }
                setQuizName(textValue(quizSet.name, 'OpenQuiz Set'))
                setDescription(textValue(quizSet.description))
                setAuthorName(textValue(quizSet.author_name) || 'OpenQuiz')
                setWords(loaded.words)
                setQuestions(loaded.questions)
                setEmbeddedQuiz(null)
                setLoading(false)
                return
            }

            throw new Error('This share link is missing a quiz.')
        } catch (loadError) {
            console.error('Error loading quiz:', loadError)
            setError(loadError instanceof Error ? loadError.message : 'Could not load this quiz.')
            setLoading(false)
        }
    }, [dataParam, pathParam])

    useEffect(() => {
        loadQuiz()
    }, [loadQuiz])

    useEffect(() => {
        if (quizName) {
            document.title = `${quizName} | OpenQuiz`
            const metaDescription = document.querySelector('meta[name="description"]')
            if (metaDescription) {
                metaDescription.setAttribute('content', `${quizName} - Practice on OpenQuiz.`)
            } else {
                const meta = document.createElement('meta')
                meta.name = 'description'
                meta.content = `${quizName} - Practice on OpenQuiz.`
                document.head.appendChild(meta)
            }
        }
    }, [quizName])

    const handleStart = async () => {
        if (starting) return
        if (!user) {
            router.push('/auth')
            return
        }

        setStarting(true)
        setError(null)
        try {
            if (embeddedQuiz) {
                // Always create a new private quiz. The embedded id belongs to
                // the sender and must never select an existing local quiz.
                const created = await createCustomQuiz(
                    user.id,
                    quizName,
                    description,
                    embeddedQuiz.words,
                    false,
                    authorName || user.name || 'Guest',
                    embeddedQuiz.questions.length ? embeddedQuiz.questions : undefined
                )
                setSelectedQuizPath(`/custom-quiz/${created.id}`)
                router.push('/session/learn')
                return
            }

            if (pathParam) {
                const normalizedPath = normalizeOfficialPath(pathParam)
                const quizSet = await getQuizSetByPath(normalizedPath)
                if (!quizSet || typeof quizSet.file_path !== 'string') {
                    throw new Error('That official quiz link is not recognized.')
                }
                setSelectedQuizPath(quizSet.file_path)
                router.push('/session/learn')
            }
        } catch (startError) {
            console.error('Error starting shared quiz:', startError)
            setError(startError instanceof Error ? startError.message : 'Could not start this quiz.')
        } finally {
            setStarting(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        )
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

                <div className="max-w-2xl mx-auto">
                    {error && (
                        <div role="alert" className="card mb-6 border-2 border-red-400 bg-red-50 dark:bg-red-950/30 p-4 text-red-800 dark:text-red-200">
                            {error}
                        </div>
                    )}

                    {(embeddedQuiz || words.length > 0 || questions.length > 0) && (
                        <div className="card mb-6">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-16 h-16 flex-shrink-0 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 p-1.5 shadow-sm border border-primary/20 dark:border-primary/30">
                                    <Logo className="w-full h-full" />
                                </div>
                                <div className="flex-1">
                                    <h1 className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-100 mb-2">
                                        {quizName}
                                    </h1>
                                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                        {authorName ? `Shared by ${authorName}` : 'Official OpenQuiz Set'}
                                    </p>
                                    {description && (
                                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                                            {description}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-6 text-sm text-neutral-600 dark:text-neutral-400 mb-6">
                                <span className="flex items-center gap-2">
                                    <BookOpen className="w-4 h-4" />
                                    {questions.length ? `${questions.length} questions` : `${words.length} words`}
                                </span>
                            </div>

                            {!user ? (
                                <div className="bg-primary/10 border-2 border-primary rounded-xl p-4 mb-4">
                                    <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-3">
                                        Sign in to start practicing this quiz
                                    </p>
                                    <button
                                        onClick={() => router.push('/auth')}
                                        className="btn-primary w-full"
                                    >
                                        Sign In to Start
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleStart}
                                    disabled={starting}
                                    className="w-full btn-primary py-4 flex items-center justify-center gap-2 text-lg disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    <Play className="w-5 h-5" />
                                    {starting ? 'Starting...' : 'Start Learning'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
