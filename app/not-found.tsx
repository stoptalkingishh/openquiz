'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NotFound() {
    const router = useRouter()

    useEffect(() => {
        const t = setTimeout(() => router.replace('/'), 2000)
        return () => clearTimeout(t)
    }, [router])

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-neutral-900 flex items-center justify-center p-4">
            <div className="text-center text-white">
                <div className="w-24 h-24 bg-white/10 backdrop-blur-sm rounded-2xl mb-6 mx-auto flex items-center justify-center text-5xl font-extrabold">
                    404
                </div>
                <h1 className="text-2xl font-extrabold mb-2">Page not found</h1>
                <p className="text-blue-100 mb-6">
                    Redirecting you to the home page...
                </p>
                <Link
                    href="/"
                    className="inline-block px-6 py-3 bg-white text-primary rounded-xl font-bold hover:bg-blue-50 transition-colors"
                >
                    Go Home
                </Link>
            </div>
        </div>
    )
}