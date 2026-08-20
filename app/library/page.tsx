'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import WordModal from '../components/WordModal'
import { Word } from '../lib/satTypes'
import { AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { getWordProgress, getCustomQuizzes } from '../lib/db'
import { assetPath } from '../lib/paths'

export default function LibraryPage() {
    const [words, setWords] = useState<Word[]>([])
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<'all' | 'new' | 'learning' | 'mastered'>('all')
    const [selectedWord, setSelectedWord] = useState<Word | null>(null)
    const [progress, setProgress] = useState<Record<string, any>>({})
    const { user } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!user) {
            router.push('/auth')
            return
        }

        const loadWords = async (): Promise<Word[]> => {
            // Signed-in users only see words from their own quizzes.
            if (user.id !== 'guest') {
                const quizzes = await getCustomQuizzes(user.id)
                const seen = new Set<string>()
                const collected: Word[] = []
                for (const quiz of quizzes) {
                    if (!Array.isArray(quiz.words) || !quiz.words.length) continue
                    for (const w of quiz.words) {
                        if (w?.word && !seen.has(w.word)) {
                            seen.add(w.word)
                            collected.push(w)
                        }
                    }
                }
                return collected
            }

            // Guests get the pre-made official SAT set.
            const res = await fetch(assetPath('/sat/1.json'))
            return res.json()
        }

        loadWords().then(setWords)
        getWordProgress(user.id).then(setProgress)
    }, [user, router])

    const filteredWords = words.filter(w => {
        const matchesSearch = w.word.toLowerCase().includes(search.toLowerCase()) ||
            w.ru.toLowerCase().includes(search.toLowerCase())

        if (!matchesSearch) return false

        const status = progress[w.word]?.status || 'new'
        if (filter === 'all') return true
        return status === filter
    })

    return (
        <div className="min-h-screen pb-24 bg-background-light dark:bg-background-dark dark:bg-stars">
            <div className="sticky top-0 z-30 bg-white dark:bg-surface-dark border-b-2 border-gray-200 dark:border-white/10 p-4 space-y-4 backdrop-blur-xl bg-opacity-90 dark:bg-opacity-90">
                <h1 className="text-xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Library
                </h1>
                {user?.id !== 'guest' && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Your vocabulary from your quizzes
                    </p>
                )}

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search word or meaning..."
                        className="input-field pl-12"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {(['all', 'new', 'learning', 'mastered'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${filter === f
                                    ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-glow'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 space-y-2">
                {words.length === 0 && (
                    <div className="card text-center py-8">
                        <p className="text-neutral-500 dark:text-neutral-400">
                            {user?.id !== 'guest'
                                ? 'No vocabulary found yet. Create a vocabulary quiz to see your words here.'
                                : 'No words found'}
                        </p>
                    </div>
                )}
                {filteredWords.map(w => {
                    const status: 'new' | 'learning' | 'mastered' = (progress[w.word]?.status || 'new') as 'new' | 'learning' | 'mastered'
                    const statusColorMap: Record<'new' | 'learning' | 'mastered', string> = {
                        new: 'bg-blue-500',
                        learning: 'bg-yellow-500',
                        mastered: 'bg-green-500'
                    }
                    const statusColor = statusColorMap[status]

                    return (
                        <button
                            key={w.word}
                            onClick={() => setSelectedWord(w)}
                            className="w-full text-left card hover:bg-gray-50 dark:hover:bg-white/5 transition-all flex items-center justify-between group hover:shadow-glow"
                        >
                            <div>
                                <h3 className="font-bold text-lg text-gray-800 dark:text-white">{w.word}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{w.ru}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${statusColor} shadow-lg`} />
                            </div>
                        </button>
                    )
                })}
            </div>

            <AnimatePresence>
                {selectedWord && (
                    <WordModal word={selectedWord} onClose={() => setSelectedWord(null)} />
                )}
            </AnimatePresence>

            <BottomNav />
        </div>
    )
}
