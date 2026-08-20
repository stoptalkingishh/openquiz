'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Mail, Calendar } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../contexts/AuthContext'
import { getStreak, getDailyStats } from '../lib/db'

export default function ProfilePage() {
    const { user, signOut } = useAuth()
    const router = useRouter()
    const [streak, setStreak] = useState(0)
    const [stats, setStats] = useState<any>(null)

    useEffect(() => {
        if (!user) {
            router.push('/auth')
            return
        }

        getStreak(user.id).then(setStreak)
        getDailyStats(user.id).then(setStats)
    }, [user, router])

    const handleSignOut = async () => {
        await signOut()
        router.push('/auth')
    }

    if (!user) return null

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark dark:bg-stars pb-24">
            <div className="p-6 space-y-6">
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
