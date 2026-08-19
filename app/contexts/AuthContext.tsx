'use client'

import { createContext, useContext, useEffect, useState } from 'react'

/**
 * Local "guest" auth for the static GitHub Pages build.
 *
 * The interface mirrors the original Supabase-backed context (user, loading,
 * signIn, signUp, signOut, signInWithGoogle) so Google sign-in via Supabase
 * can be dropped in later without touching any consuming component.
 */

export interface LocalUser {
    id: string
    email: string | null
    user_metadata: { full_name?: string }
    created_at: string
}

interface AuthContextType {
    user: LocalUser | null
    loading: boolean
    signIn: (email: string, password: string) => Promise<void>
    signUp: (email: string, password: string, fullName: string) => Promise<void>
    signOut: () => Promise<void>
    signInWithGoogle: () => Promise<void>
}

const GUEST_KEY = 'oquiz:guest_user'

function defaultGuest(): LocalUser {
    return {
        id: 'guest',
        email: 'guest',
        user_metadata: { full_name: 'Guest' },
        created_at: new Date().toISOString()
    }
}

function readGuest(): LocalUser {
    if (typeof window === 'undefined') return defaultGuest()
    try {
        const stored = window.localStorage.getItem(GUEST_KEY)
        return stored ? (JSON.parse(stored) as LocalUser) : defaultGuest()
    } catch {
        return defaultGuest()
    }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<LocalUser | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const guest = readGuest()
        window.localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
        setUser(guest)
        setLoading(false)
    }, [])

    const signIn = async (email: string, _password: string) => {
        const guest = readGuest()
        guest.email = email
        if (!guest.user_metadata?.full_name) {
            guest.user_metadata = { full_name: email.split('@')[0] || 'Guest' }
        }
        window.localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
        setUser(guest)
    }

    const signUp = async (email: string, _password: string, fullName: string) => {
        const guest: LocalUser = {
            id: readGuest().id,
            email,
            user_metadata: { full_name: fullName || email.split('@')[0] || 'Guest' },
            created_at: new Date().toISOString()
        }
        window.localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
        setUser(guest)
    }

    const signOut = async () => {
        const guest = defaultGuest()
        window.localStorage.setItem(GUEST_KEY, JSON.stringify(guest))
        setUser(guest)
    }

    const signInWithGoogle = async () => {
        throw new Error('Google sign-in is coming soon. You are using the local offline build for now.')
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