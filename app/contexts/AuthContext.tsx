'use client'

import { createContext, useContext, useEffect, useState, useRef, Fragment } from 'react'
import {
    isDriveConfigured,
    signInToDrive,
    restoreDriveSession,
    signOutFromDrive,
    getStoredDriveUser,
    DriveUser
} from '../lib/drive'
import { syncLocalToCloud } from '../lib/db'

/**
 * Hybrid auth:
 *  - With Google Drive keys configured at build time, "Continue with Google"
 *    signs the user in via Google Identity Services and data is stored in a
 *    per-user "OpenQuiz" folder in their Google Drive. Guest data stays separate.
 *  - Without keys, a stable local "guest" profile is used so the app works
 *    fully offline.
 *
 * The interface is the same in both modes (user, loading, signInWithGoogle,
 * signOut).
 */

export type AuthUser = DriveUser

interface AuthContextType {
    user: AuthUser | null
    loading: boolean
    signInWithGoogle: () => Promise<void>
    signOut: () => Promise<void>
}

const GUEST_KEY = 'oquiz:guest_user'
const GUEST_ID = 'guest'

function defaultGuest(): DriveUser {
    return {
        id: GUEST_ID,
        email: 'guest',
        name: 'Guest',
        picture: '',
        created_at: new Date().toISOString()
    }
}

function readGuest(): DriveUser {
    if (typeof window === 'undefined') return defaultGuest()
    try {
        const stored = window.localStorage.getItem(GUEST_KEY)
        return stored ? JSON.parse(stored) : defaultGuest()
    } catch {
        return defaultGuest()
    }
}

function writeGuest(user: DriveUser) {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(GUEST_KEY, JSON.stringify(user)) } catch { /* Guest identity works in memory when storage is full. */ }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [loading, setLoading] = useState(true)
    const transition = useRef(0)

    useEffect(() => {
        let mounted = true
        const generation = transition.current

        const boot = async () => {
            if (!isDriveConfigured()) {
                const guest = readGuest()
                writeGuest(guest)
                if (mounted) {
                    setUser(guest)
                    setLoading(false)
                }
                return
            }

            // Rehydrate an already-signed-in Drive user so a reload never
            // bounces the user back to the login screen. A fresh token is
            // fetched silently in the background when the app needs Drive.
            const stored = getStoredDriveUser()
            if (stored) {
                if (!mounted) return
                setUser(stored)
                setLoading(false)
                restoreDriveSession()
                    .then(u => {
                        if (!mounted || transition.current !== generation) return
                        if (u) {
                            setUser(u)
                        }
                        syncLocalToCloud().catch(() => { })
                    })
                    .catch(() => { })
                return
            }

            // A visitor who has never signed in shouldn't trigger a Google
            // account-chooser popup on page load. They'll click the button
            // consciously. If stale storage references a Drive user, the
            // guarded background restore above gives a graceful second chance.
            const guest = readGuest()
            writeGuest(guest)
            if (mounted) {
                setUser(guest)
                setLoading(false)
            }
        }

        boot()
        return () => {
            mounted = false
        }
    }, [])

    const signInWithGoogle = async () => {
        const generation = ++transition.current
        const driveUser = await signInToDrive()
        if (generation !== transition.current) return
        setUser(driveUser)
        syncLocalToCloud().catch(() => { })
    }

    const signOut = async () => {
        const generation = ++transition.current
        if (isDriveConfigured()) await signOutFromDrive()
        if (generation !== transition.current) return
        // Fall back to a fresh guest profile so the app keeps working.
        const guest = defaultGuest()
        writeGuest(guest)
        setUser(guest)
    }

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
            <Fragment key={user?.id || 'loading'}>{children}</Fragment>
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
