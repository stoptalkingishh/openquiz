'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ShieldCheck, HardDrive } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { isDriveConfigured } from '../lib/drive'
import Logo from '../components/Logo'

export default function AuthPage() {
    const { signInWithGoogle, user, loading } = useAuth()
    const router = useRouter()

    // Redirect if already logged in as a real user (not guest).
    useEffect(() => {
        if (user && user.id !== 'guest') {
            router.push('/')
        }
    }, [user, router])

    const handleGoogle = async () => {
        try {
            await signInWithGoogle()
            router.push('/')
        } catch (err: any) {
            alert(err?.message || 'Google sign-in failed')
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary via-primary-dark to-neutral-900 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
                <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-20 right-10 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md relative z-10"
            >
                {/* Logo and title */}
                <div className="text-center mb-8">
                    <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', delay: 0.2, stiffness: 200 }}
                        className="inline-flex items-center justify-center w-24 h-24 bg-white/10 backdrop-blur-sm rounded-2xl mb-4 shadow-2xl border-2 border-white/20 p-2"
                    >
                        <Logo className="w-full h-full" />
                    </motion.div>
                    <h1 className="text-4xl font-extrabold text-white mb-2">OpenQuiz</h1>
                    <p className="text-blue-100 text-lg font-medium">Learn. Master.</p>
                </div>

                {/* Auth card */}
                <div className="bg-white rounded-3xl p-8 shadow-2xl">
                    {/* Continue with Google */}
                    <button
                        onClick={handleGoogle}
                        disabled={loading || !isDriveConfigured()}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border-2 border-neutral-200 rounded-xl font-bold text-neutral-800 hover:bg-neutral-50 hover:border-neutral-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        {loading ? 'Loading...' : isDriveConfigured() ? 'Sign in with Google' : 'Sign in with Google'}
                    </button>

                    {isDriveConfigured() && (
                        <div className="flex items-start gap-2 bg-primary/5 border-2 border-primary/15 rounded-xl p-3 text-xs text-neutral-600">
                            <HardDrive className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <span>
                                Your quizzes, progress and stats are stored privately in a
                                per-user <strong>&ldquo;OpenQuiz&rdquo;</strong> folder in your
                                Google Drive, synced across devices.
                            </span>
                        </div>
                    )}

                    {!isDriveConfigured() && (
                        <div className="flex items-start gap-2 bg-neutral-100 rounded-xl p-3 text-xs text-neutral-600">
                            <ShieldCheck className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                            <span>
                                You&rsquo;re on the offline build — your data is saved in this
                                browser. Sign-in syncs to the cloud once Google Drive is configured.
                            </span>
                        </div>
                    )}

                    <p className="text-center text-neutral-400 text-xs mt-4 font-medium">
                        By continuing, you agree to our Terms of Service and Privacy Policy
                    </p>
                </div>

                {!isDriveConfigured() && (
                    <p className="text-center text-blue-100 text-sm mt-6 font-medium">
                        Guest mode is on: everything is saved to this browser.
                    </p>
                )}
            </motion.div>
        </div>
    )
}