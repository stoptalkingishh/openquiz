'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Dumbbell, Brain, Award, AlertCircle, ChevronRight, LogOut, ClipboardList, Gamepad2 } from 'lucide-react'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import Logo from './components/Logo'
import { Word } from './lib/satTypes'
import { useAuth } from './contexts/AuthContext'
import { getWordProgress, getStreak, getCustomQuizzes, loadOfficialQuiz } from './lib/db'
import { useQuizStore } from './lib/quizStore'

export default function Home() {
  const [words, setWords] = useState<Word[]>([])
  const [loading, setLoading] = useState(true)
  const [masteredCount, setMasteredCount] = useState(0)
  const [streak, setStreak] = useState(0)
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const { selectedQuizPath } = useQuizStore()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return

    const loadPreviewWords = async () => {
      // Preview the selected pre-made/official quiz (works for everyone).
      if (selectedQuizPath && !selectedQuizPath.startsWith('/custom-quiz/')) {
        const loaded = await loadOfficialQuiz(selectedQuizPath)
        setWords(loaded.words.filter(w => w?.word))
        setLoading(false)
        return
      }

      // Otherwise gather words from the user's own quizzes.
      if (user && user.id !== 'guest') {
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
        setWords(collected)
        setLoading(false)
        return
      }

      setLoading(false)
    }

    loadPreviewWords()

    // Load progress
    getWordProgress(user.id).then(progress => {
      const mastered = Object.values(progress).filter((p: any) => p.status === 'mastered').length
      setMasteredCount(mastered)
    }).catch(error => {
      console.error('Error loading progress:', error)
    })

    // Load streak
    getStreak(user.id).then(setStreak).catch(error => {
      console.error('Error loading streak:', error)
    })
  }, [user, selectedQuizPath])

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth')
  }

  const modeHref = (path: string) => path

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-36 bg-background-light dark:bg-background-dark dark:bg-stars">
      <Header streak={streak} />

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-8">
        {/* Progress Card */}
        <div className="bg-gradient-to-br from-primary via-primary to-secondary rounded-3xl p-6 sm:p-8 text-white shadow-glow relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-white/80 font-bold text-sm uppercase mb-1">Daily Goal</p>
                <h2 className="text-3xl sm:text-4xl font-extrabold">{masteredCount} / 40</h2>
              </div>
              <div className="text-right">
                <p className="text-white/80 font-bold text-sm uppercase mb-1">Sprint</p>
                <p className="font-bold">4 days left</p>
              </div>
            </div>

            <div className="h-3 bg-black/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${(masteredCount / 40) * 100}%` }}
              />
            </div>
          </div>

          {/* Logo decoration */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-15 dark:opacity-10 hidden sm:block">
            <div className="w-40 h-40">
              <Logo className="w-full h-full" />
            </div>
          </div>

          {/* Background decoration */}
          <div className="absolute -right-4 -bottom-12 w-32 h-32 bg-white/10 rounded-full blur-2xl opacity-50" />
          <div className="absolute -left-4 -top-12 w-32 h-32 bg-white/10 rounded-full blur-2xl opacity-50" />
        </div>

        {/* Modes */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <Link href={modeHref('/session/learn')} className="card hover:border-primary/50 transition-all group flex flex-col items-center text-center hover:shadow-glow">
            <Brain className="w-10 h-10 text-primary mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-lg">Learn</h3>
            <p className="text-sm text-gray-400">New words</p>
          </Link>

          <Link href={modeHref('/session/drill')} className="card hover:border-secondary/50 transition-all group flex flex-col items-center text-center hover:shadow-glow">
            <Dumbbell className="w-10 h-10 text-secondary mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-lg">Drill</h3>
            <p className="text-sm text-gray-400">Practice</p>
          </Link>

          <Link href={modeHref('/session/exam')} className="card hover:border-accent/50 transition-all group flex flex-col items-center text-center hover:shadow-glow">
            <Award className="w-10 h-10 text-accent mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-lg">Exam</h3>
            <p className="text-sm text-gray-400">Test yourself</p>
          </Link>

          <Link href={modeHref('/session/mistakes')} className="card hover:border-warning/50 transition-all group flex flex-col items-center text-center hover:shadow-glow">
            <AlertCircle className="w-10 h-10 text-warning mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-lg">Mistakes</h3>
            <p className="text-sm text-gray-400">Fix errors</p>
          </Link>

          <Link href={modeHref('/session/test')} className="card hover:border-secondary/50 transition-all group flex flex-col items-center text-center hover:shadow-glow">
            <ClipboardList className="w-10 h-10 text-secondary mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-lg">Test</h3>
            <p className="text-sm text-gray-400">Mixed questions</p>
          </Link>

          <Link href={modeHref('/match')} className="card hover:border-accent/50 transition-all group flex flex-col items-center text-center hover:shadow-glow">
            <Gamepad2 className="w-10 h-10 text-accent mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-lg">Match</h3>
            <p className="text-sm text-gray-400">Speed game</p>
          </Link>
        </div>

        {/* Today's Focus */}
        <div>
          <h3 className="font-bold text-neutral-500 dark:text-neutral-400 uppercase text-sm mb-4">Today&apos;s Focus</h3>
          <div className="flex flex-wrap gap-2">
            {words.slice(0, 5).map(w => (
              <div key={w.word} className="px-4 py-2 bg-white dark:bg-surface-dark border-2 border-gray-200 dark:border-white/10 rounded-xl font-bold text-gray-700 dark:text-gray-300">
                {w.word}
              </div>
            ))}
            <Link href="/library" className="px-4 py-2 rounded-xl font-bold text-primary flex items-center gap-1 hover:bg-primary/10 transition-colors">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
