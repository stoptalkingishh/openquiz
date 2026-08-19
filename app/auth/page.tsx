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

    const { signIn, signUp, user } = useAuth()

    // Redirect if already logged in
    useEffect(() => {
        if (user) {
            router.push('/')
        }
    }, [user, router])

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
