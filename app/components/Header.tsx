'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Zap, Flame, Sun, Moon } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import Logo from './Logo'

interface HeaderProps {
    streak?: number
}

const NAV = [
    { href: '/', label: 'Home' },
    { href: '/quizzes', label: 'Quizzes' },
    { href: '/community', label: 'Community' },
    { href: '/library', label: 'Library' },
    { href: '/profile', label: 'Profile' },
]

export default function Header({ streak = 0 }: HeaderProps) {
    const { darkMode, toggleDarkMode } = useTheme()
    const pathname = usePathname()

    return (
        <header className="sticky top-0 z-40 border-b border-neutral-200/70 dark:border-neutral-700/70 bg-white/85 dark:bg-surface-dark/85 backdrop-blur-xl">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
                <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 p-1 group-hover:scale-105 transition-transform">
                        <Logo className="w-full h-full" />
                    </div>
                    <div className="leading-tight">
                        <h1 className="text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                            OpenQuiz
                        </h1>
                        <p className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 font-medium hidden sm:block">
                            Learn · Master
                        </p>
                    </div>
                </Link>

                {/* Desktop nav */}
                <nav className="hidden md:flex items-center gap-1">
                    {NAV.map(item => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${pathname === item.href
                                    ? 'text-primary dark:text-primary-light bg-primary/10'
                                    : 'text-neutral-600 dark:text-neutral-300 hover:text-primary hover:bg-neutral-100 dark:hover:bg-neutral-800'
                                }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="flex items-center gap-1 bg-orange-100 dark:bg-orange-900/30 px-2.5 sm:px-3 py-1.5 rounded-xl" title="Day streak">
                        <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                        <span className="font-bold text-sm text-orange-600 dark:text-orange-400">{streak}</span>
                    </div>

                    <div className="hidden sm:flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 px-3 py-1.5 rounded-xl" title="XP">
                        <Zap className="w-4 h-4 text-blue-500 fill-blue-500" />
                        <span className="font-bold text-sm text-blue-600 dark:text-blue-400">450</span>
                    </div>

                    <button
                        onClick={toggleDarkMode}
                        className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                        aria-label="Toggle theme"
                    >
                        {darkMode ? (
                            <Sun className="w-4 h-4 text-amber-500" />
                        ) : (
                            <Moon className="w-4 h-4 text-neutral-600" />
                        )}
                    </button>
                </div>
            </div>
        </header>
    )
}