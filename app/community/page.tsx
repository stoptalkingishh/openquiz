'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Globe, Users, BookOpen, Play, Download, Sparkles } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../contexts/AuthContext'
import { getQuizSets, getQuizzesReadyToShare } from '../lib/db'
import { useQuizStore } from '../lib/quizStore'
import { assetPath } from '../lib/paths'

const loadItemCount = async (filePath: string): Promise<number> => {
    try {
        const response = await fetch(assetPath(filePath))
        const data = await response.json()
        return Array.isArray(data) ? data.length : 0
    } catch {
        return 0
    }
}

interface CommunityItem {
    kind: 'official' | 'community'
    id: string
    name: string
    description: string
    author: string | null
    category: string
    filePath?: string
    itemCount: number | string
    itemLabel: string
    words: any[]
    questions?: any[]
}

function quizItemCount(quiz: any): number {
    if (Array.isArray(quiz.questions) && quiz.questions.length) return quiz.questions.length
    return Array.isArray(quiz.words) ? quiz.words.length : 0
}

function quizItemLabel(quiz: any): string {
    return Array.isArray(quiz.questions) && quiz.questions.length ? 'questions' : 'words'
}

export default function CommunityPage() {
    const [items, setItems] = useState<CommunityItem[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState<string>('All')
    const { user, loading: authLoading } = useAuth()
    const router = useRouter()
    const { setSelectedQuizPath } = useQuizStore()

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/auth')
            return
        }
        if (authLoading || !user) return

        const load = async () => {
            setLoading(true)
            try {
                const [sets, publicQuizzes] = await Promise.all([
                    getQuizSets(),
                    getQuizzesReadyToShare(user.id)
                ])

                const counts: Record<string, number> = {}
                for (const set of sets) {
                    counts[set.file_path] = await loadItemCount(set.file_path)
                }

                const merged: CommunityItem[] = [
                    ...sets.map((set: any) => ({
                        kind: 'official' as const,
                        id: set.id,
                        name: set.name,
                        description: set.description,
                        author: set.author_name || null,
                        category: set.category_label || 'Official Sets',
                        filePath: set.file_path,
                        itemCount: counts[set.file_path] ?? '...',
                        itemLabel: set.item_type === 'questions' ? 'questions' : set.item_type === 'flashcards' ? 'cards' : 'words',
                        words: []
                    })),
                    ...publicQuizzes.map((quiz: any) => ({
                        kind: 'community' as const,
                        id: quiz.id,
                        name: quiz.name,
                        description: quiz.description,
                        author: quiz.author_name || null,
                        category: 'My sharing list',
                        itemCount: quizItemCount(quiz),
                        itemLabel: quizItemLabel(quiz),
                        words: Array.isArray(quiz.words) ? quiz.words : [],
                        questions: Array.isArray(quiz.questions) && quiz.questions.length ? quiz.questions : undefined
                    }))
                ]
                setItems(merged)
            } catch (err) {
                console.error('Failed to load community sets:', err)
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [user, authLoading, router])

    const categories = ['All', ...Array.from(new Set(items.filter(i => i.kind === 'official').map(i => i.category))), 'My sharing list']

    const filtered = items.filter(item => {
        const q = search.trim().toLowerCase()
        const matchesSearch = !q ||
            item.name.toLowerCase().includes(q) ||
            (item.description || '').toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q) ||
            (item.author || '').toLowerCase().includes(q)
        if (!matchesSearch) return false
        if (category === 'All') return true
        return item.category === category
    })

    const handleStudy = (item: CommunityItem) => {
        if (!item.filePath) return
        setSelectedQuizPath(item.filePath)
        router.push('/session/learn')
    }

    if (authLoading) return null

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-24">
            <div className="p-6 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-dark bg-clip-text text-transparent">
                        Community
                    </h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        Browse official sets and manage your sharing list
                    </p>
                </div>

                <div className="card text-sm space-y-3">
                    <p>Custom quizzes are stored privately. Marking a quiz for sharing adds it to your list here; it does not publish it for other accounts to discover. Use Share to send a copy by link or JSON file.</p>
                    <button className="btn-outline" onClick={() => router.push('/quiz/share/')}>Open a shared quiz file</button>
                    <button className="btn-outline ml-2" onClick={() => router.push('/quiz/share/?drive=pick')}>Open from Google Drive</button>
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search name, description or category..."
                        className="input-field pl-12"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {categories.map(c => (
                        <button
                            key={c}
                            onClick={() => setCategory(c)}
                            className={`px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${category === c
                                    ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-glow'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="card text-center py-12">
                        <Sparkles className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                        <p className="text-neutral-500 dark:text-neutral-400">
                            {category === 'My sharing list' && !search ? 'Your sharing list is empty. Edit a custom quiz and select “Add to my sharing list”, or share directly from its details.' : 'Nothing matches your search'}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {filtered.map(item => (
                            <div key={`${item.kind}-${item.id}`} className="card-interactive group relative">
                                <div className="text-left mb-4">
                                    <div className="flex items-start justify-between mb-3 pr-8">
                                        <h3 className="font-bold text-xl text-neutral-900 dark:text-neutral-100 group-hover:text-primary dark:group-hover:text-primary-light transition-colors">
                                            {item.name}
                                        </h3>
                                        {item.kind === 'official' ? (
                                            <div className="badge-primary">Official</div>
                                        ) : (
                                            <div className="badge-secondary flex items-center gap-1">
                                                <Globe className="w-3 h-3" />
                                                Ready to share
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">{item.description}</p>
                                    <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
                                        <span className="flex items-center gap-1">
                                            <BookOpen className="w-4 h-4" />
                                            {item.itemCount} {item.itemLabel}
                                        </span>
                                        {item.author && (
                                            <span className="flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {item.author}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {item.kind === 'official' ? (
                                    <button
                                        onClick={() => handleStudy(item)}
                                        className="w-full btn-primary py-2 px-4 flex items-center justify-center gap-2 text-sm"
                                    >
                                        <Play className="w-4 h-4" />
                                        Study
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => router.push(`/quiz-detail/?id=${encodeURIComponent(item.id)}&share=1`)}
                                        className="w-full btn-primary py-2 px-4 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                                    >
                                        <Download className="w-4 h-4" />
                                        Share
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <BottomNav />
        </div>
    )
}
