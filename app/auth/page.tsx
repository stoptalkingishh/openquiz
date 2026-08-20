'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Mail, Lock, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { assetPath } from '../lib/paths'

export default function AuthPage() {
    const [isSignUp, setIsSignUp] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const { signIn, signUp, signInWithGoogle, user } = useAuth()

    // Redirect if already logged in
    useEffect(() => {
        if (user) {
            router.push('/')
        }
    }, [user, router])

    const handleGoogle = async () => {
        setError('')
        setLoading(true)

        try {
            await signInWithGoogle()
        } catch (err: any) {
            setError(err.message || 'Google sign-in failed')
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            if (isSignUp) {
                await signUp(email, password, fullName)
                setError('Check your email to verify your account!')
            } else {
                await signIn(email, password)
                // Redirect will happen via useEffect when user state updates
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed')
        } finally {
            setLoading(false)
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
                        className="inline-flex items-center justify-center w-24 h-24 bg-white/10 backdrop-blur-sm rounded-2xl mb-4 shadow-2xl border-2 border-white/20 p-3"
                    >
                        <div className="relative w-full h-full">
                            <Image
                                src={assetPath('/sat/logo.png')}
                                alt="SAT Vocabulary Logo"
                                fill
                                className="object-contain drop-shadow-lg"
                                priority
                                sizes="96px"
                            />
                        </div>
                    </motion.div>
                    <h1 className="text-4xl font-extrabold text-white mb-2">SAT Vocabulary</h1>
                    <p className="text-blue-100 text-lg font-medium">Master words. Ace the test.</p>
                </div>

                {/* Auth card */}
                <div className="bg-white rounded-3xl p-8 shadow-2xl">
                    {/* Toggle buttons */}
                    <div className="flex gap-2 mb-6 p-1 bg-neutral-100 rounded-xl">
                        <button
                            onClick={() => setIsSignUp(false)}
                            className={`flex-1 py-3 rounded-lg font-bold transition-all ${!isSignUp
                                    ? 'bg-white text-primary shadow-md'
                                    : 'text-neutral-600 hover:text-neutral-900'
                                }`}
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => setIsSignUp(true)}
                            className={`flex-1 py-3 rounded-lg font-bold transition-all ${isSignUp
                                    ? 'bg-white text-primary shadow-md'
                                    : 'text-neutral-600 hover:text-neutral-900'
                                }`}
                        >
                            Sign Up
                        </button>
                    </div>

                    {/* Continue with Google */}
                    <button
                        onClick={handleGoogle}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border-2 border-neutral-200 rounded-xl font-bold text-neutral-800 hover:bg-neutral-50 hover:border-neutral-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Continue with Google
                    </button>

                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex-1 h-px bg-neutral-200" />
                        <span className="text-xs font-bold text-neutral-400 uppercase">or</span>
                        <div className="flex-1 h-px bg-neutral-200" />
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {isSignUp && (
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                                <input
                                    type="text"
                                    placeholder="Full Name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-neutral-50 border-2 border-neutral-200 rounded-xl text-neutral-900 placeholder-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                                    required={isSignUp}
                                />
                            </div>
                        )}

                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-neutral-50 border-2 border-neutral-200 rounded-xl text-neutral-900 placeholder-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                                required
                            />
                        </div>

                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-neutral-50 border-2 border-neutral-200 rounded-xl text-neutral-900 placeholder-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                                required
                            />
                        </div>

                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`${error.includes('Check your email')
                                        ? 'bg-secondary/10 border-2 border-secondary text-secondary-dark'
                                        : 'bg-error/10 border-2 border-error text-error-dark'
                                    } px-4 py-3 rounded-xl text-sm font-medium`}
                            >
                                {error}
                            </motion.div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary shadow-button hover:shadow-button-hover disabled:opacity-50 disabled:cursor-not-allowed h-12 text-base"
                        >
                            {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-blue-100 text-sm mt-6 font-medium">
                    By continuing, you agree to our Terms of Service and Privacy Policy
                </p>
            </motion.div>
        </div>
    )
}
