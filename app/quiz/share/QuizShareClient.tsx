'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ArrowLeft, Play, BookOpen } from 'lucide-react'
import { useQuizStore } from '../../lib/quizStore'
import { useAuth } from '../../contexts/AuthContext'
import { getQuizSetByPath, getCustomQuizzes, createCustomQuiz } from '../../lib/db'
import { assetPath } from '../../lib/paths'
import Image from 'next/image'

interface SharedQuiz {
    name: string
    description: string
    words: any[]
    author_name?: string | null
    id?: string
}

export default function QuizShareClient() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathParam = searchParams.get('path')
    const dataParam = searchParams.get('data')
    const { setSelectedQuizPath } = useQuizStore()
    const { user } = useAuth()
    const [words, setWords] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [quizName, setQuizName] = useState('')
    const [authorName, setAuthorName] = useState<string | null>(null)
    const [description, setDescription] = useState('')
    const [embeddedQuiz, setEmbeddedQuiz] = useState<{ id?: string } | null>(null)

    useEffect(() => {
        if (!pathParam && !dataParam) {
            router.push('/quizzes')
            return
        }

        loadQuiz()
    }, [pathParam, dataParam, router])

    // Update document title and meta tags
    useEffect(() => {
        if (quizName) {
            document.title = `${quizName} | SAT Vocabulary`

            // Update meta description
            const metaDescription = document.querySelector('meta[name="description"]')
            if (metaDescription) {
                metaDescription.setAttribute('content', `${quizName} - Practice ${words.length} SAT vocabulary words with spaced repetition.`)
            } else {
                const meta = document.createElement('meta')
                meta.name = 'description'
                meta.content = `${quizName} - Practice ${words.length} SAT vocabulary words with spaced repetition.`
                document.head.appendChild(meta)
            }
        }
    }, [quizName, words.length])

    const loadQuiz = async () => {
        try {
            // Case 1: custom quiz embedded in the URL (fully static sharing)
            if (dataParam) {
                const data = JSON.parse(decodeURIComponent(dataParam)) as SharedQuiz
                setWords(Array.isArray(data.words) ? data.words : [])
                setQuizName(data.name || 'Shared Vocabulary Quiz')
                setDescription(data.description || '')
                setAuthorName(data.author_name || null)
                setEmbeddedQuiz(data)
                setLoading(false)
                return
            }

            // Case 2: official JSON set referenced by path
            if (pathParam) {
                let normalizedPath = decodeURIComponent(pathParam).trim()
                if (!normalizedPath.startsWith('/')) {
                    normalizedPath = `/${normalizedPath}`
                }
                normalizedPath = normalizedPath.replace(/([^:]\/)\/+/g, '$1')

                let nameToUse = ''
                try {
                    const quizSet = await getQuizSetByPath(normalizedPath)
                    if (quizSet && quizSet.name) {
                        nameToUse = quizSet.name
                    }
                } catch {
                    // fall through to filename parsing
                }

                if (!nameToUse) {
                    const pathParts = normalizedPath.split('/')
                    const fileName = pathParts[pathParts.length - 1].replace('.json', '')
                    const setNumber = fileName.match(/\d+/)?.[0] || fileName
                    nameToUse = `SAT Vocabulary - Set ${setNumber}`
                }

                setQuizName(nameToUse)

                const response = await fetch(assetPath(normalizedPath))
                if (!response.ok) {
                    throw new Error('Failed to load quiz')
                }
                const data = await response.json()
                setWords(Array.isArray(data) ? data : [])
                setLoading(false)
            }
        } catch (error) {
            console.error('Error loading quiz:', error)
            router.push('/quizzes')
        }
    }

    const handleStart = async () => {
        if (!user) {
            router.push('/auth')
            return
        }

        // Embedded custom quiz: persist locally so /session can load it by id
        if (embeddedQuiz) {
            const existing = await getCustomQuizzes(user.id)
            let id = embeddedQuiz.id
            if (!id || !existing.some(q => q.id === id)) {
                const created = await createCustomQuiz(
                    user.id,
                    quizName,
                    description,
                    words,
                    true,
                    authorName || user.name || 'Guest'
                )
                id = created.id
            }
            setSelectedQuizPath(`/custom-quiz/${id}`)
            router.push('/session/learn')
            return
        }

        if (pathParam) {
            let normalizedPath = decodeURIComponent(pathParam).trim()
            if (!normalizedPath.startsWith('/')) {
                normalizedPath = `/${normalizedPath}`
            }
            normalizedPath = normalizedPath.replace(/([^:]\/)\/+/g, '$1')
            setSelectedQuizPath(normalizedPath)
            router.push('/session/learn')
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
                    <div className="card mb-6">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="relative w-16 h-16 flex-shrink-0 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 p-2 shadow-sm border border-primary/20 dark:border-primary/30">
                                <div className="relative w-full h-full rounded-lg overflow-hidden">
                                    <Image
                                        src="/sat/logo.png"
                                        alt="Logo"
                                        fill
                                        className="object-contain drop-shadow-sm"
                                        sizes="64px"
                                    />
                                </div>
                            </div>
                            <div className="flex-1">
                                <h1 className="text-3xl font-extrabold text-neutral-900 dark:text-neutral-100 mb-2">
                                    {quizName}
                                </h1>
                                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                    {authorName ? `Shared by ${authorName}` : 'Official SAT Vocabulary Set'}
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
                                {words.length} words
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
                                className="w-full btn-primary py-4 flex items-center justify-center gap-2 text-lg"
                            >
                                <Play className="w-5 h-5" />
                                Start Learning
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}