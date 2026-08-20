'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'

export default function AuthCallback() {
    const router = useRouter()

    useEffect(() => {
        let cancelled = false

        const finish = async () => {
            try {
                if (isSupabaseConfigured && supabase) {
                    const params = new URLSearchParams(window.location.search)
                    const code = params.get('code')

                    // PKCE flow: exchange the code for a session.
                    // Implicit flow puts the token in the URL hash, which
                    // getSession() picks up automatically.
                    if (code) {
                        const { error } = await supabase.auth.exchangeCodeForSession(code)
                        if (error) console.error('Code exchange error:', error.message)
                    } else {
                        await supabase.auth.getSession()
                    }
                }

                if (!cancelled) router.replace('/')
            } catch (error) {
                console.error('Auth callback error:', error)
                if (!cancelled) router.replace('/')
            }
        }

        finish()
        return () => { cancelled = true }
    }, [router])

    return (
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Completing sign in...</p>
            </div>
        </div>
    )
}