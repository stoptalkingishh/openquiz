'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
    isDriveConfigured,
    signInToDrive,
    restoreDriveSession,
    signOutFromDrive,
    getDriveUser,
    DriveUser
} from '../lib/drive'
import { syncLocalToCloud } from '../lib/db'

/**
 * Hybrid auth:
 *  - With Google Drive keys configured at build time, "Continue with Google"
 *    signs the user in via Google Identity Services and data is stored in a
 *    per-user "OpenQuiz" folder in their Google Drive. Any guest (localStorage)
 *    data is migrated into the cloud on first sign-in.
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
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(user))
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true

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

            // Try to restore an existing Google session (no popup).
            const driveUser = await restoreDriveSession()
            if (!mounted) return

            if (driveUser) {
                setUser(driveUser)
                syncLocalToCloud().catch(() => { })
            } else {
                // Keep the guest profile when signed out, so the app still works.
                const guest = readGuest()
                writeGuest(guest)
                setUser(guest)
            }
            setLoading(false)
        }

        boot()
        return () => {
            mounted = false
        }
    }, [])

    const signInWithGoogle = async () => {
        const driveUser = await signInToDrive()
        setUser(driveUser)
        syncLocalToCloud().catch(() => { })
    }

    const signOut = async () => {
        // Fall back to a fresh guest profile so the app keeps working.
        const guest = defaultGuest()
        writeGuest(guest)
        setUser(guest)
        if (isDriveConfigured()) {
            await signOutFromDrive()
        }
    }

    return (
        <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
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

// Re-export helper so components that only need the current Drive user
// (if any) don't have to reach into the drive module directly.
export function useDriveUser(): DriveUser | null {
    return typeof window !== 'undefined' ? getDriveUser() : null
}