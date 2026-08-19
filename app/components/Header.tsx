'use client'

import Image from 'next/image'
import { Zap, Flame, Sun, Moon } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { assetPath } from '../lib/paths'

interface HeaderProps {
    streak?: number
}

export default function Header({ streak = 0 }: HeaderProps) {
    const { darkMode, toggleDarkMode } = useTheme()

    return (
        <header className="flex justify-between items-center py-4 px-6 bg-white dark:bg-surface-dark border-b border-neutral-200 dark:border-neutral-700 sticky top-0 z-40 backdrop-blur-xl bg-opacity-95 dark:bg-opacity-95">
            <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 flex-shrink-0 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 p-1.5 shadow-sm border border-primary/20 dark:border-primary/30">
                    <div className="relative w-full h-full rounded-lg overflow-hidden">
                        <Image
                            src={assetPath('/sat/logo.png')}
                            alt="SAT Vocabulary Logo"
                            fill
                            className="object-contain drop-shadow-sm"
                            priority
                            sizes="48px"
                        />
                    </div>
                </div>
                <div>
                    <h1 className="text-xl font-extrabold bg-gradient-to-r from-primary to-primary-dark bg-clip-text text-transparent tracking-tight">
                        SAT Vocabulary
                    </h1>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Master words. Ace the test.</p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {/* Streak */}
                <div className="flex items-center gap-1 bg-orange-100 dark:bg-orange-900/30 px-3 py-1.5 rounded-xl">
                    <Flame className="w-4 h-4 text-orange-500 fill-orange-500" />
                    <span className="font-bold text-sm text-orange-600 dark:text-orange-400">{streak}</span>
                </div>

                {/* XP */}
                <div className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 px-3 py-1.5 rounded-xl">
                    <Zap className="w-4 h-4 text-blue-500 fill-blue-500" />
                    <span className="font-bold text-sm text-blue-600 dark:text-blue-400">450</span>
                </div>

                {/* Theme toggle */}
                <button
                    onClick={toggleDarkMode}
                    className="p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    aria-label="Toggle theme"
                >
                    {darkMode ? (
                        <Sun className="w-5 h-5 text-amber-500" />
                    ) : (
                        <Moon className="w-5 h-5 text-neutral-600" />
                    )}
                </button>
            </div>
        </header>
    )
}
