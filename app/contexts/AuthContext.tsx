'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { syncLocalToCloud } from '../lib/db'
import { BASE_PATH } from '../lib/paths'

/**
 * Hybrid auth:
 *  - With Supabase keys configured at build time, this is real auth
 *    (email/password + Google OAuth) and every sign-in migrates any
 *    guest localStorage data into the user's cloud account.
 *  - Without keys, a stable local "guest" profile is used so the app
 *    works fully offline.
 *
 * The interface is the same in both modes (user, loading, signIn,
 * signUp, signOut, signInWithGoogle).
 */

export type AuthUser = User | {
    id: string
    email?: string | null
    user_metadata?: Record<string, any>
    created_at: string
}

interface AuthContextType {
    user: AuthUser | null
    loading: boolean
    signIn: (email: string, password: string) => Promise<void>
    signUp: (email: string, password: string, fullName: string) => Promise<void>
    signOut: () => Promise<void>
    signInWithGoogle: () => Promise<void>
}

const GUEST_KEY = 'oquiz:guest_user'

function defaultGuest(): { id: string; email: string | null; user_metadata: Record<string, any>; created_at: string } {
    return {
        id: 'guest',
        email: 'guest',
        user_metadata: { full_name: 'Guest' },
        created_at: new Date().toISOString()
    }
}

function readGuest(): { id: string; email: string | null; user_metadata: Record<string, any>; created_at: string } {
    if (typeof window === 'undefined') return defaultGuest()
    try {
        const stored = window.localStorage.getItem(GUEST_KEY)
        return stored ? JSON.parse(stored) : defaultGuest()
    } catch {
        return defaultGuest()
    }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true

        if (!isSupabaseConfigured) {
            const guest = readGuest()
            window.localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
            if (mounted) {
                setUser(guest)
                setLoading(false)
            }
            return
        }

        supabase!.auth.getSession().then(({ data: { session } }) => {
            if (session?.user && mounted) {
                setUser(session.user)
                syncLocalToCloud(session.user.id).catch(() => { })
            }
            if (mounted) setLoading(false)
        })

        const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
            if (!mounted) return
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session?.user) {
                    setUser(session.user)
                    syncLocalToCloud(session.user.id).catch(() => { })
                }
            } else if (event === 'SIGNED_OUT') {
                setUser(null)
            }
        })

        return () => {
            mounted = false
            subscription.unsubscribe()
        }
    }, [])

    const signIn = async (email: string, password: string) => {
        if (!isSupabaseConfigured || !supabase) {
            const guest = readGuest()
            guest.email = email || guest.email
            if (!guest.user_metadata?.full_name) {
                guest.user_metadata = { full_name: email.split('@')[0] || 'Guest' }
            }
            window.localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
            setUser(guest)
            return
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
    }

    const signUp = async (email: string, password: string, fullName: string) => {
        if (!isSupabaseConfigured || !supabase) {
            const guest = defaultGuest()
            guest.email = email
            guest.user_metadata = { full_name: fullName || email.split('@')[0] || 'Guest' }
            window.localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
            setUser(guest)
            return
        }

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        })
        if (error) throw error
    }

    const signOut = async () => {
        if (!isSupabaseConfigured || !supabase) {
            const guest = defaultGuest()
            window.localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
            setUser(guest)
            return
        }

        const { error } = await supabase.auth.signOut()
        if (error) throw error
    }

    const signInWithGoogle = async () => {
        if (!isSupabaseConfigured || !supabase) {
            throw new Error('Online sign-in is coming soon — you are using the offline build right now.')
        }

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}${BASE_PATH}/auth/callback`
            }
        })
        if (error) throw error
    }

    return (
        <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, signInWithGoogle }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}