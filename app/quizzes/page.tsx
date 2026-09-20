'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Sparkles, BookOpen, Check, Users, Play, Globe, Lock, Share2, Copy, Twitter, Facebook, MessageCircle, X, Folder, FolderPlus, FolderOpen, Gamepad2, ClipboardList, Trash2, ChevronDown, Search, Pencil } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../contexts/AuthContext'
import { getQuizSets, getCustomQuizzes, getPublicQuizzes, createCustomQuiz, getFolders, createFolder, normalizeImportedQuizItems, validateQuizJSON, deleteCustomQuiz, csvToWords, delimitedToWords } from '../lib/db'
import { buildShareData } from '../lib/share'
import { useQuizStore } from '../lib/quizStore'
import { buildPlannedQuizPrompt, generateQuizFromNotes, getAiSettings, planQuizzesFromMaterial, saveAiSettings, AiSettings, AiProvider, DEFAULT_OPENAI_MODEL, DEFAULT_GEMINI_MODEL, PlannedQuiz } from '../lib/ai'
import { assetPath, BASE_PATH } from '../lib/paths'
import { motion, AnimatePresence } from 'framer-motion'
import QuizBuilder from '../components/QuizBuilder'
import { QuizQuestion } from '../lib/satTypes'

const loadItemCount = async (filePath: string): Promise<number> => {
    try {
        const response = await fetch(assetPath(filePath))
        const data = await response.json()
        return Array.isArray(data) ? data.length : 0
    } catch {
        return 0
    }
}

export default function QuizzesPage() {
    const [quizSets, setQuizSets] = useState<any[]>([])
    const [customQuizzes, setCustomQuizzes] = useState<any[]>([])
    const [peerQuizzes, setPeerQuizzes] = useState<any[]>([])
    const [folders, setFolders] = useState<any[]>([])
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showFolderModal, setShowFolderModal] = useState(false)
    const [showShareModal, setShowShareModal] = useState(false)
    const [shareQuiz, setShareQuiz] = useState<any>(null)
    const [wordCounts, setWordCounts] = useState<Record<string, number>>({})
    const [search, setSearch] = useState('')
    const { user, loading: authLoading } = useAuth()
    const router = useRouter()
    const { selectedQuizPath, setSelectedQuizPath } = useQuizStore()

    const loadQuizzes = useCallback(async () => {
        if (!user) return

        // Everyone sees pre-made Official sets. "Peer Sets" (locally shared
        // public community quizzes) remain guest-only.
        const isGuest = user.id === 'guest'

        const [sets, custom, peers, folderList] = await Promise.all([
            getQuizSets(),
            getCustomQuizzes(user.id),
            isGuest ? getPublicQuizzes(user.id) : Promise.resolve<any[]>([]),
            getFolders()
        ])

        setQuizSets(sets)
        setCustomQuizzes(custom)
        setPeerQuizzes(peers)
        setFolders(folderList)

        // Load item counts for all quiz sets
        const counts: Record<string, number> = {}
        for (const set of sets) {
            counts[set.file_path] = await loadItemCount(set.file_path)
        }
        setWordCounts(counts)
    }, [user])

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/auth')
            return
        }

        if (authLoading) return
        loadQuizzes()
    }, [user, authLoading, router, loadQuizzes])

    const handleQuizSelect = (filePath: string) => {
        setSelectedQuizPath(filePath)
    }

    const handleStartQuiz = (filePath: string) => {
        setSelectedQuizPath(filePath)
        router.push('/session/learn')
    }

    const handlePlayMode = (path: string, mode: 'test' | 'match') => {
        setSelectedQuizPath(path)
        router.push(mode === 'test' ? '/session/test' : '/match')
    }

    const activeFolder = folders.find(f => f.id === activeFolderId) || null
    const folderQuizIds = activeFolder?.quiz_ids || []

    const query = search.trim().toLowerCase()
    const matchesNameDesc = (item: any) =>
        !query ||
        (item.name || '').toLowerCase().includes(query) ||
        (item.description || '').toLowerCase().includes(query)
    const matchesCustom = (item: any) =>
        matchesNameDesc(item) ||
        (Array.isArray(item.tags) && item.tags.some((t: string) => (t || '').toLowerCase().includes(query)))

    const visibleCustomQuizzes = customQuizzes
        .filter(q => activeFolderId ? folderQuizIds.includes(q.id) : true)
        .filter(matchesCustom)
    const visiblePeerQuizzes = peerQuizzes.filter(matchesCustom)

    const handleShare = (quiz: any, isCustom: boolean = false) => {
        setShareQuiz({ ...quiz, isCustom })
        setShowShareModal(true)
    }

    const [confirmDelete, setConfirmDelete] = useState<any>(null)

    const handleDelete = async (quiz: any) => {
        setConfirmDelete(null)
        try {
            if (user) {
                await deleteCustomQuiz(quiz.id)
                const fresh = await getCustomQuizzes(user.id)
                setCustomQuizzes(fresh)
                if (selectedQuizPath === `/custom-quiz/${quiz.id}`) {
                    setSelectedQuizPath('')
                }
            }
        } catch (err) {
            console.error('Failed to delete quiz:', err)
            alert('Could not delete the quiz. Please try again.')
        }
    }

    const getShareUrl = (quiz: any) => {
        const origin = window.location.origin
        if (quiz.isCustom) {
            // Embed the whole quiz in the URL so the link works on any static host
            const data = buildShareData(quiz)
            if (data === null) return ''
            return `${origin}${BASE_PATH}/quiz/share?data=${data}`
        } else {
            // For official quizzes, create a shareable link
            // Normalize file_path: remove leading slash if present, ensure it starts with /
            const filePath = (quiz.file_path || selectedQuizPath || '').trim()
            const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
            return `${origin}${BASE_PATH}/quiz/share?path=${encodeURIComponent(normalizedPath)}`
        }
    }

    const copyShareLink = async (quiz: any) => {
        const url = getShareUrl(quiz)
        try {
            await navigator.clipboard.writeText(url)
            // Show toast or feedback
            alert('Link copied to clipboard!')
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    const shareToSocial = (platform: 'twitter' | 'facebook' | 'telegram', quiz: any) => {
        const url = getShareUrl(quiz)
        // Get proper quiz name - use name from database or fallback
        const quizName = quiz.name || (quiz.file_path ? `OpenQuiz Set` : 'OpenQuiz Quiz')
        const text = `Check out this SAT vocabulary quiz: ${quizName}`
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

    // Group official sets by category so pre-made content stays tidy
    // (e.g. one "CompTIA Security+" group instead of many loose cards).
    const categorized = quizSets.filter(matchesNameDesc).reduce<Record<string, any[]>>((acc, set) => {
        const key = set.category_label || 'Official Sets'
        if (!acc[key]) acc[key] = []
        acc[key].push(set)
        return acc
    }, {})

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24">
            <div className="p-6 space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-dark bg-clip-text text-transparent">
                            Quizzes
                        </h1>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                            Choose a quiz and start learning
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" /> Create
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search quizzes by name, description, or tags..."
                        className="input-field pl-12"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* Folders */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                            <Folder className="w-5 h-5 text-primary" />
                            Folders
                        </h2>
                        <button
                            onClick={() => setShowFolderModal(true)}
                            className="flex items-center gap-1 text-sm font-semibold text-primary hover:bg-primary/10 rounded-lg px-3 py-2 transition-colors"
                        >
                            <FolderPlus className="w-4 h-4" />
                            New Folder
                        </button>
                    </div>
                    {folders.length === 0 ? (
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                            Organize your custom quizzes into folders.
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setActiveFolderId(null)}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border-2 ${!activeFolderId
                                        ? 'bg-primary/10 text-primary border-primary'
                                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-700'
                                    }`}
                            >
                                All
                            </button>
                            {folders.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setActiveFolderId(activeFolderId === f.id ? null : f.id)}
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border-2 flex items-center gap-2 ${activeFolderId === f.id
                                            ? 'bg-primary/10 text-primary border-primary'
                                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 dark:hover:bg-neutral-700'
                                        }`}
                                >
                                    {activeFolderId === f.id
                                        ? <FolderOpen className="w-4 h-4" />
                                        : <Folder className="w-4 h-4" />}
                                    {f.name}
                                    <span className="text-xs opacity-70">({f.quiz_ids.length})</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Official Quiz Sets (grouped by category) */}
                {Object.entries(categorized).map(([label, sets]) => (
                    <div key={label}>
                        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                            {label} <span className="text-sm font-semibold text-neutral-400">({sets.length})</span>
                        </h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            {sets.map((set: any) => {
                            const isSelected = selectedQuizPath === set.file_path

                            return (
                                <div
                                    key={set.id}
                                    className={`card-interactive group relative ${isSelected ? 'border-primary dark:border-primary-light ring-2 ring-primary/20' : ''
                                        }`}
                                >
                                    {isSelected && (
                                        <div className="absolute top-4 right-4 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                            <Check className="w-4 h-4 text-white" />
                                        </div>
                                    )}

                                    <div className="text-left mb-4">
                                        <div className="flex items-start justify-between mb-3 pr-8">
                                            <h3 className="font-bold text-xl text-neutral-900 dark:text-neutral-100 group-hover:text-primary dark:group-hover:text-primary-light transition-colors">
                                                {set.name}
                                            </h3>
                                            <div className="badge-primary">Official</div>
                                        </div>
                                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">{set.description}</p>
                                        <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                                            <span className="flex items-center gap-1">
                                                <BookOpen className="w-4 h-4" />
                                                {wordCounts[set.file_path] || '...'} {set.item_type === 'questions' ? 'questions' : set.item_type === 'flashcards' ? 'cards' : 'words'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => router.push(`/quiz-detail/?path=${encodeURIComponent(set.file_path)}`)}
                                            className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                            title="View details"
                                        >
                                            <BookOpen className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleQuizSelect(set.file_path)}
                                            className={`flex-1 py-2 px-4 rounded-xl font-semibold text-sm transition-all ${
                                                isSelected
                                                    ? 'bg-primary/10 text-primary border-2 border-primary'
                                                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                                            }`}
                                        >
                                            {isSelected ? 'Selected' : 'Select'}
                                        </button>
                                        <button
                                            onClick={() => handleStartQuiz(set.file_path)}
                                            className="flex-1 btn-primary py-2 px-4 flex items-center justify-center gap-2 text-sm"
                                        >
                                            <Play className="w-4 h-4" />
                                            Start
                                        </button>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => handlePlayMode(set.file_path, 'test')}
                                            className="py-2 rounded-xl text-sm font-semibold border-2 border-neutral-200 dark:border-neutral-700 hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <ClipboardList className="w-4 h-4" />
                                            Test
                                        </button>
                                        <button
                                            onClick={() => handlePlayMode(set.file_path, 'match')}
                                            className="py-2 rounded-xl text-sm font-semibold border-2 border-neutral-200 dark:border-neutral-700 hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Gamepad2 className="w-4 h-4" />
                                            Match
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                        </div>
                    </div>
                ))}

                {/* Peer Sets */}
                {visiblePeerQuizzes.length > 0 && (
                    <div>
                        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-primary" />
                            Peer Sets
                        </h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            {visiblePeerQuizzes.map((quiz) => {
                                const quizPath = `/custom-quiz/${quiz.id}`
                                const isSelected = selectedQuizPath === quizPath
                                
                                return (
                                    <div
                                        key={quiz.id}
                                        className={`card-interactive group relative ${isSelected ? 'border-primary dark:border-primary-light ring-2 ring-primary/20' : ''
                                            }`}
                                    >
                                        {isSelected && (
                                            <div className="absolute top-4 right-14 w-6 h-6 bg-primary rounded-full flex items-center justify-center" aria-label="Selected quiz">
                                                <Check className="w-4 h-4 text-white" />
                                            </div>
                                        )}

                                        <div className="text-left mb-4">
                                            <div className="flex items-start justify-between mb-3 pr-8">
                                                <h3 className="font-bold text-xl text-neutral-900 dark:text-neutral-100 group-hover:text-primary dark:group-hover:text-primary-light transition-colors">
                                                    {quiz.name}
                                                </h3>
                                                <div className="badge-secondary flex items-center gap-1">
                                                    <Globe className="w-3 h-3" />
                                                    Public
                                                </div>
                                            </div>
                                            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">{quiz.description}</p>
                                            <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                                                <span className="flex items-center gap-1">
                                                    <BookOpen className="w-4 h-4" />
                                                    {quizItemCount(quiz)} {quizItemLabel(quiz)}
                                                </span>
                                                {quiz.author_name && (
                                                    <span className="flex items-center gap-1">
                                                        <Users className="w-3 h-3" />
                                                        {quiz.author_name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => router.push(`/quiz-detail/?id=${quiz.id}`)}
                                                className="py-2 px-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2 text-sm font-semibold"
                                                title="Edit quiz details and content"
                                            >
                                                <Pencil className="w-4 h-4" />
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleQuizSelect(quizPath)}
                                                className={`flex-1 py-2 px-4 rounded-xl font-semibold text-sm transition-all ${
                                                    isSelected
                                                        ? 'bg-primary/10 text-primary border-2 border-primary'
                                                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                                                }`}
                                            >
                                                {isSelected ? 'Selected' : 'Select'}
                                            </button>
                                            <button
                                                onClick={() => handleStartQuiz(quizPath)}
                                                className="flex-1 btn-primary py-2 px-4 flex items-center justify-center gap-2 text-sm"
                                            >
                                                <Play className="w-4 h-4" />
                                                Start
                                            </button>
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => handlePlayMode(quizPath, 'test')}
                                                className="py-2 rounded-xl text-sm font-semibold border-2 border-neutral-200 dark:border-neutral-700 hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <ClipboardList className="w-4 h-4" />
                                                Test
                                            </button>
                                            <button
                                                onClick={() => handlePlayMode(quizPath, 'match')}
                                                className="py-2 rounded-xl text-sm font-semibold border-2 border-neutral-200 dark:border-neutral-700 hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Gamepad2 className="w-4 h-4" />
                                                Match
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Custom Quizzes */}
                <div>
                    <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-4">
                        {activeFolder ? `${activeFolder.name} · ` : ''}My Custom Quizzes
                    </h2>
                    {visibleCustomQuizzes.length === 0 ? (
                        <div className="card text-center py-8">
                            <Sparkles className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                            <p className="text-neutral-500 dark:text-neutral-400">
                                {activeFolderId ? 'No quizzes in this folder yet' : 'No custom quizzes yet'}
                            </p>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="btn-primary mt-4 mx-auto"
                            >
                                Create Your First Quiz
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {visibleCustomQuizzes.map((quiz) => {
                                const quizPath = `/custom-quiz/${quiz.id}`
                                const isSelected = selectedQuizPath === quizPath
                                
                                return (
                                    <div
                                        key={quiz.id}
                                        className={`card-interactive group relative ${isSelected ? 'border-primary dark:border-primary-light ring-2 ring-primary/20' : ''
                                            }`}
                                    >
                                        {isSelected && (
                                            <div className="absolute top-4 right-4 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                                <Check className="w-4 h-4 text-white" />
                                            </div>
                                        )}

                                        <div className="text-left mb-4">
                                            <div className="flex items-start justify-between mb-3 pr-8">
                                                <h3 className="font-bold text-xl text-neutral-900 dark:text-neutral-100 group-hover:text-primary dark:group-hover:text-primary-light transition-colors">
                                                    {quiz.name}
                                                </h3>
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
                                                <button
                                                    onClick={() => setConfirmDelete(quiz)}
                                                    className="absolute top-4 right-4 p-2 rounded-lg text-neutral-400 hover:text-error hover:bg-error/10 transition-colors"
                                                    title="Delete quiz"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">{quiz.description}</p>
                                            <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                                                <span className="flex items-center gap-1">
                                                    <BookOpen className="w-4 h-4" />
                                                    {quizItemCount(quiz)} {quizItemLabel(quiz)}
                                                </span>
                                                {quiz.author_name && (
                                                    <span className="flex items-center gap-1">
                                                        <Users className="w-3 h-3" />
                                                        {quiz.author_name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => router.push(`/quiz-detail/?id=${quiz.id}`)}
                                                className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                                title="View details"
                                            >
                                                <BookOpen className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleQuizSelect(quizPath)}
                                                className={`flex-1 py-2 px-4 rounded-xl font-semibold text-sm transition-all ${
                                                    isSelected
                                                        ? 'bg-primary/10 text-primary border-2 border-primary'
                                                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                                                }`}
                                            >
                                                {isSelected ? 'Selected' : 'Select'}
                                            </button>
                                            <button
                                                onClick={() => handleStartQuiz(quizPath)}
                                                className="flex-1 btn-primary py-2 px-4 flex items-center justify-center gap-2 text-sm"
                                            >
                                                <Play className="w-4 h-4" />
                                                Start
                                            </button>
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => handlePlayMode(quizPath, 'test')}
                                                className="py-2 rounded-xl text-sm font-semibold border-2 border-neutral-200 dark:border-neutral-700 hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <ClipboardList className="w-4 h-4" />
                                                Test
                                            </button>
                                            <button
                                                onClick={() => handlePlayMode(quizPath, 'match')}
                                                className="py-2 rounded-xl text-sm font-semibold border-2 border-neutral-200 dark:border-neutral-700 hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Gamepad2 className="w-4 h-4" />
                                                Match
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {showFolderModal && (
                    <CreateFolderModal
                        onClose={() => setShowFolderModal(false)}
                        onCreated={async () => {
                            setShowFolderModal(false)
                            setFolders(await getFolders())
                        }}
                    />
                )}
                {showCreateModal && (
                    <CreateQuizModal
                        onClose={() => setShowCreateModal(false)}
                        onCreated={loadQuizzes}
                    />
                )}
                {showShareModal && shareQuiz && (
                    <ShareQuizModal
                        quiz={shareQuiz}
                        onClose={() => {
                            setShowShareModal(false)
                            setShareQuiz(null)
                        }}
                        onCopyLink={() => copyShareLink(shareQuiz)}
                        onShareSocial={(platform: 'twitter' | 'facebook' | 'telegram') => shareToSocial(platform, shareQuiz)}
                    />
                )}
                {confirmDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setConfirmDelete(null)}
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
                                <div className="w-12 h-12 bg-error/10 dark:bg-error/20 rounded-full flex items-center justify-center">
                                    <Trash2 className="w-6 h-6 text-error" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
                                        Delete Quiz?
                                    </h3>
                                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                        &ldquo;{confirmDelete.name}&rdquo; will be permanently removed.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="flex-1 py-3 px-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleDelete(confirmDelete)}
                                    className="flex-1 py-3 px-4 bg-error text-white rounded-xl font-semibold hover:bg-error/90 transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <BottomNav />
        </div>
    )
}

// Number of "things" a quiz contains (words for vocab quizzes, questions otherwise).
function quizItemCount(quiz: any): number {
    if (Array.isArray(quiz.questions) && quiz.questions.length) return quiz.questions.length
    return Array.isArray(quiz.words) ? quiz.words.length : 0
}

function quizItemLabel(quiz: any): string {
    return Array.isArray(quiz.questions) && quiz.questions.length ? 'questions' : 'words'
}

function CreateFolderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (folderId: string) => void }) {
    const [name, setName] = useState('')
    const [error, setError] = useState('')
    const { user } = useAuth()

    const handleCreate = async () => {
        if (!user) return
        if (!name.trim()) {
            setError('Give your folder a name')
            return
        }
        setError('')
        const folder = await createFolder(user.id, name)
        onCreated(folder.id)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-2xl relative z-10 max-w-sm w-full"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-xl font-bold mb-4">New Folder</h2>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                    className="input-field mb-4"
                    placeholder="e.g., SAT Vocab, Biology, Spanish"
                    autoFocus
                />
                {error && (
                    <p className="text-sm text-error mb-4">{error}</p>
                )}
                <div className="flex gap-3">
                    <button onClick={onClose} className="btn-outline flex-1">
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!name.trim()}
                        className="btn-primary flex-1 disabled:opacity-50"
                    >
                        Create
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

function CreateQuizModal({ onClose, onCreated }: { onClose: () => void, onCreated: () => void }) {
    const [step, setStep] = useState<'info' | 'method' | 'json-mode' | 'builder' | 'ai'>('info')
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [authorName, setAuthorName] = useState('')
    const [tagsText, setTagsText] = useState('')
    const [isPublic, setIsPublic] = useState(false)
    const [jsonText, setJsonText] = useState('')
    const [questions, setQuestions] = useState<QuizQuestion[]>([])
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [aiNotes, setAiNotes] = useState('')
    const [aiSettings, setAiSettings] = useState<AiSettings>(() => getAiSettings())
    const [showAiSettings, setShowAiSettings] = useState(false)
    const [aiError, setAiError] = useState('')
    const [aiGenerating, setAiGenerating] = useState(false)
    const [aiPreparing, setAiPreparing] = useState(false)
    const [aiPlan, setAiPlan] = useState<{ overview: string, quizzes: Array<PlannedQuiz & { selected: boolean, instructions: string }> } | null>(null)
    const [sourceFileName, setSourceFileName] = useState('')
    const { user, signInWithGoogle } = useAuth()

    const setAiProvider = (provider: AiProvider) => {
        setAiSettings(prev => ({
            ...prev,
            provider,
            model: provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL
        }))
    }

    const handleSourceFile = async (file: File | undefined) => {
        if (!file) return
        setAiError('')
        setSourceFileName(file.name)
        try {
            if (file.size > 15 * 1024 * 1024) throw new Error('Choose a PDF or text file smaller than 15 MB.')
            if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
                const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
                const pages: string[] = []
                for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
                    const page = await document.getPage(pageNumber)
                    const content = await page.getTextContent()
                    pages.push(content.items.map((item: any) => typeof item.str === 'string' ? item.str : '').join(' '))
                }
                const extracted = pages.join('\n\n').trim()
                if (!extracted) throw new Error('This PDF has no selectable text. Use a text-based PDF or paste an OCR transcript.')
                setAiNotes(extracted.slice(0, 150000))
                if (extracted.length > 150000) setAiError('The first 150,000 characters were extracted. For complete coverage, upload one chapter at a time.')
            } else {
                setAiNotes((await file.text()).slice(0, 150000))
            }
            setAiPlan(null)
        } catch (err: any) {
            setAiError(err.message || 'Could not read this file.')
        }
    }

    const promptText = `You are building an SAT vocabulary trainer.

Your job:
Given a list of entries with

* Word
* Definition (in English or bilingual)
* Example sentence

you must return a JSON array of objects in the following format (use straight quotes " only):

[
  {
    "word": "string",
    "ru": "string",
    "synonyms": ["string", ...],
    "simple_examples": ["string", ...],
    "advanced_example": "string",
    "confusions": ["string", ...]
  }
]

### GLOBAL JSON RULES (VERY STRICT)

1. Output format

* Return ONLY valid JSON, no explanations, no markdown, no comments.
* Top level must be a JSON array [...].
* Use EXACT keys: word, ru, synonyms, simple_examples, advanced_example, confusions.

2. Quotes and characters

* Use ONLY straight ASCII double quotes " (U+0022) in JSON.
* DO NOT use any "smart quotes" or "curly quotes".
* Inside JSON string values:
  * DO NOT use double quotes " at all.
  * If you need quotes in English text, replace them with single quotes ' instead.
* Use ONLY the straight ASCII apostrophe ' (U+0027) in words like 'tis, ne'er, etc.
* Do NOT use any other lookalike apostrophes.
* Do NOT use backticks.

3. Safety for JSON parsing

* Do NOT include line breaks inside a single string value; each sentence must be on one line.
* Do NOT add trailing commas.
* Do NOT add comments.
* Make sure the JSON would pass a strict JSON parser.

4. "ru" field

* The ru field must contain the original definition text EXACTLY as given in the input.
* Do NOT translate, shorten, or paraphrase the definition.
* Keep punctuation as in the original, but convert any smart quotes to straight quotes.

---

### SYNONYMS

* synonyms must be an array of 2–5 real English words or short phrases.
* Same part of speech as the target word (verb/adj/noun/adv).
* Similar meaning and similar register (formal/informal).
* Do NOT include the target word itself.
* Prefer test-relevant academic vocabulary when possible.

Example:
For abate → "synonyms": ["diminish", "decrease", "subside"]

---

### SIMPLE EXAMPLES

* simple_examples = array of 1–3 sentences.
* CEFR B1 level: clear, short sentences.
* At least one simple example should be close to the original example sentence, but you may edit for clarity.
* No slang.
* No double quotes. If you need quoting, use single quotes.

---

### ADVANCED_EXAMPLE (SAT CLOZE SENTENCE)

* advanced_example must be:
  * Exactly ONE sentence.
  * Contains EXACTLY ONE blank, written as four underscores: ____
  * No other blanks.
  * No double quotes at all in this sentence.
* The blank must be the position where the TARGET WORD (in the correct grammatical form) is logically and grammatically the BEST answer.

**Very important grammar rule:**

For each word:

1. Choose the grammatical form for the blank (base verb, past tense, adjective, noun, adverb, etc.).
2. All words in confusions must:
   * Be the SAME part of speech as the target word.
   * Fit grammatically into the same blank position in the sentence.
3. Only the TARGET WORD should make the overall meaning clearly correct and precise in context.

Tone and style:

* The sentence should sound like it comes from a humanities or social-science SAT passage.
* Use context clues that favor the correct word over the distractors.

Example pattern:

* "advanced_example": "For reformers, protecting public safety was important, but ensuring equal access to justice was even more ____."
  Here the correct answer might be paramount, and confusions could be ["significant", "visible", "apparent", "basic"].

---

### CONFUSIONS (DISTRACTOR WORDS)

* confusions must be an array of 3–7 words.
* They are NOT random.
* They MUST:
  * Be the SAME part of speech as the target word.
  * Be in the SAME morphological form required by the blank in advanced_example.
    * If the blank needs a base-form verb, all confusions must be base-form verbs.
    * If the blank needs an adjective, all confusions must be adjectives, etc.
  * Be realistically confusable with the target word in an SAT sentence-completion question.
* They should be:
  * Near-synonyms with slightly different meaning, tone, or precision, OR
  * Words that feel plausible in the sentence but are subtly wrong in meaning.
* Do NOT include the target word itself.
* Do NOT repeat any word inside confusions.

---

### INPUT FORMAT

You will receive a block like:

Word
Definition
Example Sentence
Abate
v. to become less active, less intense, or less in amount
As I began my speech, my feelings of nervousness quickly abated.
Abrupt
adj. Sudden and unexpected.
His abrupt departure surprised everyone.
...

You must silently parse this structure:

* Every set of three lines:
  1. Word
  2. Definition
  3. Example Sentence
     is one entry.
* For each entry, produce one JSON object in the format above.
* Return one JSON array containing all objects, and nothing else.

Remember:

* No markdown.
* No explanations.
* No smart quotes.
* No double quotes inside text values. Use single quotes ' instead.
`


    const handleCreate = async () => {
        if (!user) return
        setError('')
        setLoading(true)

        const tags = tagsText.split(',').map(t => t.trim()).filter(Boolean)

        try {
            if (step === 'json-mode') {
                let parsed: any
                let isJson = true
                try {
                    parsed = JSON.parse(jsonText)
                } catch {
                    isJson = false
                }

                if (!isJson) {
                    const csv = csvToWords(jsonText)
                    if (csv.words.length) {
                        await createCustomQuiz(user.id, name, description, csv.words, isPublic, authorName || undefined)
                    } else {
                        const delimited = delimitedToWords(jsonText)
                        if (delimited.words.length) {
                            await createCustomQuiz(user.id, name, description, delimited.words, isPublic, authorName || undefined)
                        } else {
                            throw new Error('Could not parse the pasted text as JSON, CSV, or a simple word list.')
                        }
                    }
                } else if (!Array.isArray(parsed)) {
                    throw new Error('JSON must be an array')
                } else {
                    const { words, questions, errors } = normalizeImportedQuizItems(parsed)
                    if (errors.length) {
                        throw new Error('Some items were invalid:\n' + errors.slice(0, 10).map((e: string) => `• ${e}`).join('\n'))
                    }
                    if (questions.length) {
                        await createCustomQuiz(user.id, name, description, [], isPublic, authorName || undefined, questions, tags)
                    } else {
                        if (!words.length) throw new Error('No valid quiz content found in JSON')
                        await createCustomQuiz(user.id, name, description, words, isPublic, authorName || undefined, undefined, tags)
                    }
                }
            } else {
                const cleanQuestions = questions
                    .filter(q => q.prompt.trim())
                    .map(q => {
                        if (q.kind === 'multiple_choice') {
                            return {
                                ...q,
                                options: (q.options || []).map(o => o.trim())
                            }
                        }
                        return q
                    })

                if (cleanQuestions.length === 0) {
                    throw new Error('Add at least one question with a prompt')
                }

                const mcInvalid = cleanQuestions.find(q => q.kind === 'multiple_choice' && ((q.options || []).length < 2 || (q.options || []).some(o => !o)))
                if (mcInvalid) {
                    throw new Error('Every multiple-choice question needs at least 2 non-empty options. Fill or remove blank options before saving.')
                }

                await createCustomQuiz(user.id, name, description, [], isPublic, authorName || undefined, cleanQuestions, tags)
            }

            onCreated()
            onClose()
        } catch (err: any) {
            setError(err.message || 'Failed to create quiz')
        } finally {
            setLoading(false)
        }
    }

    const handleAiPrepare = async () => {
        if (!user) return
        setAiError('')
        if (!aiNotes.trim()) {
            setAiError('Paste or upload source material first.')
            return
        }
        setAiPreparing(true)
        try {
            saveAiSettings(aiSettings)
            const plan = await planQuizzesFromMaterial(aiNotes.trim(), aiSettings)
            setAiPlan({ overview: plan.overview, quizzes: plan.quizzes.map(quiz => ({ ...quiz, selected: true, instructions: '' })) })
        } catch (err: any) {
            setAiError(err.message || 'Failed to prepare study material')
        } finally {
            setAiPreparing(false)
        }
    }

    const handleAiGenerate = async () => {
        if (!user || !aiPlan) return
        const selected = aiPlan.quizzes.filter(quiz => quiz.selected)
        if (!selected.length) return setAiError('Select at least one planned quiz.')
        setAiError('')
        setAiGenerating(true)
        try {
            saveAiSettings(aiSettings)
            for (const planned of selected) {
                const source = buildPlannedQuizPrompt(aiNotes.trim(), planned, planned.instructions)
                const { words, questions } = await generateQuizFromNotes(source, aiSettings)
                const tags = planned.tags.length ? planned.tags : tagsText.split(',').map(tag => tag.trim()).filter(Boolean)
                if (questions.length) {
                    await createCustomQuiz(user.id, planned.title, planned.description, [], isPublic, authorName || undefined, questions, tags, source)
                } else {
                    if (!words.length) throw new Error(`No quiz content was generated for ${planned.title}.`)
                    await createCustomQuiz(user.id, planned.title, planned.description, words, isPublic, authorName || undefined, undefined, tags, source)
                }
            }
            onCreated()
            onClose()
        } catch (err: any) {
            setAiError(err.message || 'Failed to generate quiz')
        } finally {
            setAiGenerating(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white dark:bg-surface-dark w-full max-w-2xl rounded-3xl p-6 shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto"
            >
                <h2 className="text-2xl font-bold mb-4">Create Custom Quiz</h2>

                {step === 'info' ? (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                Quiz Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="input-field"
                                placeholder="e.g., My SAT Words"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                Description
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="input-field min-h-[100px]"
                                placeholder="Brief description of your quiz"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                Tags (comma-separated)
                            </label>
                            <input
                                type="text"
                                value={tagsText}
                                onChange={(e) => setTagsText(e.target.value)}
                                className="input-field"
                                placeholder="e.g., biology, cells, exam-prep"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                Author Name
                            </label>
                            <input
                                type="text"
                                value={authorName}
                                onChange={(e) => setAuthorName(e.target.value)}
                                className="input-field"
                                placeholder="Your name (optional)"
                            />
                        </div>

                        <div className="flex items-center gap-3 p-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
                            <input
                                type="checkbox"
                                id="isPublic"
                                checked={isPublic}
                                onChange={(e) => setIsPublic(e.target.checked)}
                                className="w-5 h-5 text-primary rounded focus:ring-primary"
                            />
                            <label htmlFor="isPublic" className="flex-1 cursor-pointer">
                                <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                                    Make this quiz public
                                </div>
                                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                                    Other users will be able to see and use your quiz
                                </div>
                            </label>
                            {isPublic && (
                                <Globe className="w-5 h-5 text-primary" />
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button onClick={onClose} className="btn-outline flex-1">
                                Cancel
                            </button>
                            <button
                                onClick={() => setStep('method')}
                                disabled={!name}
                                className="btn-primary flex-1 disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                ) : step === 'method' ? (
                    <div className="space-y-4">
                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                            How do you want to add your questions?
                        </p>

                        <button
                            onClick={() => setStep('json-mode')}
                            className="w-full p-5 rounded-2xl border-2 border-neutral-200 dark:border-neutral-700 hover:border-primary hover:bg-primary/5 transition-all text-left"
                        >
                            <div className="font-bold text-lg text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-primary" />
                                Paste from an LLM (JSON)
                            </div>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                                Generate an SAT vocabulary quiz with AI, then paste its JSON here. Great for building big lists fast.
                            </p>
                        </button>

                        <button
                            onClick={() => setStep('ai')}
                            className="w-full p-5 rounded-2xl border-2 border-neutral-200 dark:border-neutral-700 hover:border-primary hover:bg-primary/5 transition-all text-left"
                        >
                            <div className="font-bold text-lg text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-primary" />
                                AI Generate
                            </div>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                                Paste your notes and generate a quiz using Google Gemini (sign in) or your own AI API key.
                            </p>
                        </button>

                        <button
                            onClick={() => {
                                setQuestions(questions.length ? questions : [])
                                setStep('builder')
                            }}
                            className="w-full p-5 rounded-2xl border-2 border-neutral-200 dark:border-neutral-700 hover:border-primary hover:bg-primary/5 transition-all text-left"
                        >
                            <div className="font-bold text-lg text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                                <Plus className="w-5 h-5 text-primary" />
                                Build It Yourself
                            </div>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                                Add multiple-choice, true/false, or flashcard questions by hand. Works for any subject.
                            </p>
                        </button>

                        <div className="flex gap-3">
                            <button onClick={() => setStep('info')} className="btn-outline flex-1">
                                Back
                            </button>
                        </div>
                    </div>
                ) : step === 'json-mode' ? (
                    <div className="space-y-4">
                        <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-xl">
                            <p className="text-sm font-bold mb-2 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" />
                                Copy this prompt to your LLM:
                            </p>
                            <pre className="text-xs bg-white dark:bg-neutral-900 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                                {promptText}
                            </pre>
                            <button
                                onClick={() => navigator.clipboard.writeText(promptText)}
                                className="btn-secondary mt-2 text-xs py-2"
                            >
                                Copy Prompt
                            </button>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                Paste JSON Response
                            </label>
                            <textarea
                                value={jsonText}
                                onChange={(e) => setJsonText(e.target.value)}
                                className="input-field min-h-[200px] font-mono text-sm"
                                placeholder='[{"word": "...", "ru": "...", ...}]  or  [{"question": "...", "options": ["A) ..."], "answer": "A"}]'
                            />
                        </div>

                        {error && (
                            <div className="bg-error/10 border-2 border-error text-error-dark dark:text-error-light px-4 py-3 rounded-xl text-sm whitespace-pre-wrap">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setStep('method')} className="btn-outline flex-1">
                                Back
                            </button>
                            <button
                                onClick={() => {
                                    setError('')
                                    const result = validateQuizJSON(jsonText)
                                    if (result.ok) {
                                        setError(`Valid! ${result.count} item${result.count === 1 ? '' : 's'} ready to create.`)
                                        return
                                    }
                                    try {
                                        JSON.parse(jsonText)
                                        setError('Validation failed:\n' + result.errors.map((e: string) => `• ${e}`).join('\n'))
                                    } catch {
                                        const csv = csvToWords(jsonText)
                                        if (csv.words.length) {
                                            setError(`Detected CSV — ${csv.words.length} word${csv.words.length === 1 ? '' : 's'} ready to create.`)
                                            return
                                        }
                                        const delimited = delimitedToWords(jsonText)
                                        if (delimited.words.length) {
                                            setError(`Detected a word list — ${delimited.words.length} word${delimited.words.length === 1 ? '' : 's'} ready to create.`)
                                            return
                                        }
                                        setError('Could not parse the pasted text as JSON, CSV, or a simple word list.')
                                    }
                                }}
                                disabled={!jsonText || loading}
                                className="btn-secondary flex-1 disabled:opacity-50"
                            >
                                Validate
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!jsonText || loading}
                                className="btn-primary flex-1 disabled:opacity-50"
                            >
                                {loading ? 'Creating...' : 'Create Quiz'}
                            </button>
                        </div>
                    </div>
                ) : step === 'ai' ? (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-neutral-700 dark:text-neutral-300 mb-2">
                                Notes, course material, or PDF
                            </label>
                            <textarea
                                value={aiNotes}
                                onChange={(e) => { setAiNotes(e.target.value); setAiPlan(null) }}
                                className="input-field min-h-[160px]"
                                placeholder="Paste a chapter, course outline, notes, or a transcript. You will review a study plan before quizzes are generated."
                            />
                            <label className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-primary cursor-pointer">
                                <input type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" className="sr-only" onChange={e => handleSourceFile(e.target.files?.[0])} />
                                Upload PDF or text file
                            </label>
                            {sourceFileName && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Loaded from {sourceFileName}</p>}
                        </div>

                        {aiPlan && <section className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                            <div><h3 className="font-bold">Review the study plan</h3><p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{aiPlan.overview || 'Select the sections you want to generate. Each becomes its own editable custom quiz.'}</p></div>
                            <div className="space-y-3">
                                {aiPlan.quizzes.map((planned, index) => <div key={index} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 space-y-2">
                                    <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" className="mt-1" checked={planned.selected} onChange={e => setAiPlan(plan => plan ? { ...plan, quizzes: plan.quizzes.map((item, i) => i === index ? { ...item, selected: e.target.checked } : item) } : plan)} /><span>{planned.title}</span></label>
                                    <input value={planned.title} onChange={e => setAiPlan(plan => plan ? { ...plan, quizzes: plan.quizzes.map((item, i) => i === index ? { ...item, title: e.target.value } : item) } : plan)} className="input-field text-sm" aria-label={`Quiz ${index + 1} title`} />
                                    <textarea value={planned.description} onChange={e => setAiPlan(plan => plan ? { ...plan, quizzes: plan.quizzes.map((item, i) => i === index ? { ...item, description: e.target.value } : item) } : plan)} className="input-field text-sm min-h-16" aria-label={`Quiz ${index + 1} description`} />
                                    <div className="grid grid-cols-2 gap-2"><input value={planned.tags.join(', ')} onChange={e => setAiPlan(plan => plan ? { ...plan, quizzes: plan.quizzes.map((item, i) => i === index ? { ...item, tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean) } : item) } : plan)} className="input-field text-sm" placeholder="Tags" /><input type="number" min="8" max="25" value={planned.questionCount} onChange={e => setAiPlan(plan => plan ? { ...plan, quizzes: plan.quizzes.map((item, i) => i === index ? { ...item, questionCount: Math.min(25, Math.max(8, Number(e.target.value) || 8)) } : item) } : plan)} className="input-field text-sm" aria-label={`Quiz ${index + 1} question count`} /></div>
                                    <textarea value={planned.instructions} onChange={e => setAiPlan(plan => plan ? { ...plan, quizzes: plan.quizzes.map((item, i) => i === index ? { ...item, instructions: e.target.value } : item) } : plan)} className="input-field text-sm min-h-16" placeholder="Optional changes, e.g. use scenario questions" />
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Scope: {planned.scope}</p>
                                </div>)}
                            </div>
                        </section>}

                        <div className="border-2 border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
                            <button
                                onClick={() => setShowAiSettings(v => !v)}
                                className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                            >
                                <span>AI Settings</span>
                                <ChevronDown className={`w-4 h-4 transition-transform ${showAiSettings ? 'rotate-180' : ''}`} />
                            </button>
                            {showAiSettings && (
                                <div className="p-4 space-y-4 border-t border-neutral-200 dark:border-neutral-700">
                                    <div>
                                        <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                                            AI Provider
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setAiProvider('openai')}
                                                className={`px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all ${aiSettings.provider !== 'gemini' ? 'border-primary bg-primary/10 text-primary dark:text-primary-light' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
                                            >
                                                OpenAI-compatible
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAiProvider('gemini')}
                                                className={`px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all ${aiSettings.provider === 'gemini' ? 'border-primary bg-primary/10 text-primary dark:text-primary-light' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
                                            >
                                                Google Gemini
                                            </button>
                                        </div>
                                    </div>

                                    {aiSettings.provider === 'gemini' ? (
                                        <>
                                            {(!user || user.id === 'guest') ? (
                                                <div className="p-3 rounded-xl bg-primary/5 border-2 border-primary/20">
                                                    <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Sign in with Google to try Gemini without an API key.</p>
                                                    <button type="button" onClick={() => signInWithGoogle().catch(() => {})} className="btn-primary w-full text-sm">Sign in with Google</button>
                                                </div>
                                            ) : <p className="text-xs text-neutral-500 dark:text-neutral-400">Using your Google account ({user.email}) for Gemini beta. You can add an API key below as a fallback.</p>}
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                                                    Gemini API Key (optional fallback)
                                                </label>
                                                <input
                                                    type="password"
                                                    value={aiSettings.apiKey}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
                                                    className="input-field"
                                                    placeholder="AIza..."
                                                />
                                                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                                                    Leave this blank to use the signed-in Google account beta. A key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline">Google AI Studio</a> is the more reliable fallback and is stored only on this device.
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                                                    Model
                                                </label>
                                                <input
                                                    type="text"
                                                    value={aiSettings.model}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                                                    className="input-field"
                                                    placeholder="gemini-2.0-flash"
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                                                    API Key
                                                </label>
                                                <input
                                                    type="password"
                                                    value={aiSettings.apiKey}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, apiKey: e.target.value })}
                                                    className="input-field"
                                                    placeholder="sk-..."
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                                                    Base URL
                                                </label>
                                                <input
                                                    type="text"
                                                    value={aiSettings.baseUrl}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, baseUrl: e.target.value })}
                                                    className="input-field"
                                                    placeholder="https://api.openai.com/v1"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                                                    Model
                                                </label>
                                                <input
                                                    type="text"
                                                    value={aiSettings.model}
                                                    onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                                                    className="input-field"
                                                    placeholder="gpt-4o-mini"
                                                />
                                            </div>
                                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                                Your key is sent directly from your browser and stored locally on this device.
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {aiError && (
                            <div className="bg-error/10 border-2 border-error text-error-dark dark:text-error-light px-4 py-3 rounded-xl text-sm whitespace-pre-wrap">
                                {aiError}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setStep('method')} className="btn-outline flex-1">
                                Back
                            </button>
                            <button
                                onClick={aiPlan ? handleAiGenerate : handleAiPrepare}
                                disabled={!aiNotes.trim() || aiGenerating || aiPreparing}
                                className="btn-primary flex-1 disabled:opacity-50"
                            >
                                {aiPreparing ? 'Preparing…' : aiGenerating ? 'Generating…' : aiPlan ? `Generate selected quizzes (${aiPlan.quizzes.filter(quiz => quiz.selected).length})` : 'Prepare material'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <QuizBuilder
                            onChange={setQuestions}
                            initialQuestions={questions}
                        />

                        {error && (
                            <div className="bg-error/10 border-2 border-error text-error-dark dark:text-error-light px-4 py-3 rounded-xl text-sm">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setStep('method')} className="btn-outline flex-1">
                                Back
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={loading}
                                className="btn-primary flex-1 disabled:opacity-50"
                            >
                                {loading ? 'Creating...' : 'Create Quiz'}
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    )
}

function ShareQuizModal({ 
    quiz, 
    onClose, 
    onCopyLink, 
    onShareSocial 
}: { 
    quiz: any
    onClose: () => void
    onCopyLink: () => void
    onShareSocial: (platform: 'twitter' | 'facebook' | 'telegram') => void
}) {
    const getShareUrl = () => {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        if (quiz.isCustom) {
            const data = buildShareData(quiz)
            if (data === null) return ''
            return `${origin}${BASE_PATH}/quiz/share?data=${data}`
        } else {
            // Normalize file_path: ensure it starts with /
            const filePath = (quiz.file_path || '').trim()
            const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
            return `${origin}${BASE_PATH}/quiz/share?path=${encodeURIComponent(normalizedPath)}`
        }
    }
    const shareUrl = getShareUrl()
    const shareTooLarge = quiz.isCustom && shareUrl === ''

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
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
                        onClick={onClose}
                        className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                    >
                        <X className="w-5 h-5" />
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
                        <>
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
                                        value={shareUrl}
                                        readOnly
                                        className="flex-1 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-700 dark:text-neutral-300"
                                    />
                                    <button
                                        onClick={onCopyLink}
                                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 text-sm font-semibold"
                                    >
                                        <Copy className="w-4 h-4" />
                                        Copy
                                    </button>
                                </div>
                            </div>

                            {/* Social Share Buttons */}
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase mb-3">
                                    Share on Social Media
                                </p>
                                <div className="grid grid-cols-3 gap-3">
                                    <button
                                        onClick={() => onShareSocial('twitter')}
                                        className="flex flex-col items-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group"
                                    >
                                        <Twitter className="w-6 h-6 text-blue-500 group-hover:scale-110 transition-transform" />
                                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Twitter</span>
                                    </button>
                                    <button
                                        onClick={() => onShareSocial('facebook')}
                                        className="flex flex-col items-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group"
                                    >
                                        <Facebook className="w-6 h-6 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Facebook</span>
                                    </button>
                                    <button
                                        onClick={() => onShareSocial('telegram')}
                                        className="flex flex-col items-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group"
                                    >
                                        <MessageCircle className="w-6 h-6 text-blue-500 group-hover:scale-110 transition-transform" />
                                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Telegram</span>
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-3 px-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                    Close
                </button>
            </motion.div>
        </div>
    )
}
