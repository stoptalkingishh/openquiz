'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthCallback() {
    const router = useRouter()

    useEffect(() => {
        // In the offline build sign-in is instant; used as the landing page that
        // Supabase OAuth redirects to once Google sign-in is wired in.
        router.replace('/')
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