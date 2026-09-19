'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Mail, Calendar, History, Trophy, BarChart3 } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../contexts/AuthContext'
import { getStreak, getDailyStats, getRecentActivity, getStudyAnalytics, StudyAnalytics } from '../lib/db'

export default function ProfilePage() {
    const { user, loading: authLoading, signOut } = useAuth()
    const router = useRouter()
    const [streak, setStreak] = useState(0)
    const [stats, setStats] = useState<any>(null)
    const [recent, setRecent] = useState<any[]>([])
    const [analytics, setAnalytics] = useState<StudyAnalytics | null>(null)

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/auth')
            return
        }
        if (authLoading || !user) return
        const currentUser = user

        getStreak(currentUser.id).then(setStreak).catch(() => {})
        getDailyStats(currentUser.id).then(setStats).catch(() => {})
        getRecentActivity(8).then(setRecent).catch(() => {})
        getStudyAnalytics(currentUser.id).then(setAnalytics).catch(() => {})
    }, [user, authLoading, router])

    const handleSignOut = async () => {
        await signOut()
        router.push('/auth')
    }

    if (authLoading || !user) return null

    const maxCount = analytics ? Math.max(1, ...analytics.studyDays.map(d => d.count)) : 1
    const shadeFor = (count: number) => {
        if (!count) return 'bg-neutral-100 dark:bg-neutral-800'
        const ratio = count / maxCount
        if (ratio <= 0.33) return 'bg-primary/30'
        if (ratio <= 0.66) return 'bg-primary/60'
        return 'bg-primary'
    }

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark dark:bg-stars pb-40">
            <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Profile
                </h1>

                <div className="card text-center">
                    {user.picture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={user.picture}
                            alt={user.name || 'User avatar'}
                            className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
                        />
                    ) : (
                        <div className="w-24 h-24 bg-gradient-to-br from-primary to-secondary rounded-full mx-auto mb-4 flex items-center justify-center text-white text-3xl font-bold">
                            {(user.name?.[0] || user.email?.[0] || 'U').toUpperCase()}
                        </div>
                    )}
                    <h2 className="text-xl font-bold mb-1">{user.name || 'User'}</h2>
                    <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
                        <Mail className="w-4 h-4" />
                        {user.email === 'guest' ? 'Guest account' : user.email}
                    </div>
                    <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 text-sm mt-2">
                        <Calendar className="w-4 h-4" />
                        Joined {new Date(user.created_at).toLocaleDateString()}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="card text-center">
                        <div className="text-3xl font-bold text-primary mb-1">{streak}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Day Streak</div>
                    </div>
                    <div className="card text-center">
                        <div className="text-3xl font-bold text-secondary mb-1">{stats?.words_learned || 0}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Words Today</div>
                    </div>
                </div>

                {analytics && (
                    <div className="card">
                        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-primary" />
                            Analytics
                        </h2>

                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-primary">{analytics.totals.sessions}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Sessions</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-secondary">{analytics.totals.accuracy}%</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Accuracy</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-accent">{analytics.weakestWords.length}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Weak Words</div>
                            </div>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Study activity · last 90 days</p>
                        <div className="flex flex-wrap gap-1 mb-6">
                            {analytics.studyDays.map(day => (
                                <div
                                    key={day.date}
                                    title={`${day.date} · ${day.count} answers`}
                                    className={`w-3 h-3 rounded-sm ${shadeFor(day.count)}`}
                                />
                            ))}
                        </div>

                        <h3 className="font-bold text-base mb-3">Weakest Words</h3>
                        {analytics.weakestWords.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No weak words yet — keep studying!</p>
                        ) : (
                            <div className="space-y-3">
                                {analytics.weakestWords.map(w => (
                                    <div key={w.word}>
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="font-medium truncate">{w.word}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                                {w.wrongStreak > 0 && <span className="text-error">{w.wrongStreak}×</span>}
                                                {Math.round(w.strength * 100)}%
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-accent"
                                                style={{ width: `${Math.round(w.strength * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {recent.length > 0 && (
                    <div className="card">
                        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <History className="w-5 h-5 text-primary" />
                            Recent Study
                        </h2>
                        <div className="space-y-3">
                            {recent.map((entry, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <Trophy className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate">{entry.quizName}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {new Date(entry.date).toLocaleDateString()} · {entry.correct}/{entry.total}
                                            {entry.seconds ? ` · ${Math.round(entry.seconds / 60)}m` : ''}
                                        </p>
                                    </div>
                                    <div className="text-sm font-bold text-secondary">
                                        {entry.total ? Math.round((entry.correct / entry.total) * 100) : 0}%
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <button
                    onClick={handleSignOut}
                    className="w-full btn-accent flex items-center justify-center gap-2"
                >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                </button>
            </div>
            <BottomNav />
        </div>
    )
}
