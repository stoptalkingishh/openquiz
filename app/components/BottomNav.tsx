'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Library, BookOpen, User, Globe } from 'lucide-react'

const TABS = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/library', label: 'Library', icon: BookOpen },
    { href: '/quizzes', label: 'Quizzes', icon: Library },
    { href: '/community', label: 'Community', icon: Globe },
    { href: '/profile', label: 'Profile', icon: User },
]

export default function BottomNav() {
    const pathname = usePathname()
    const isExact = (path: string) => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`))

    return (
        <nav
            aria-label="Primary"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md px-2 pb-safe"
        >
            <div className="rounded-2xl bg-white/90 dark:bg-surface-dark/90 backdrop-blur-xl border border-neutral-200/80 dark:border-neutral-700/80 shadow-lg shadow-black/10 dark:shadow-black/40 flex items-center justify-around py-1.5">
                {TABS.map(tab => {
                    const active = isExact(tab.href)
                    const Icon = tab.icon
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            aria-current={active ? 'page' : undefined}
                            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors ${active
                                    ? 'text-primary dark:text-primary-light bg-primary/10'
                                    : 'text-neutral-500 dark:text-neutral-400 hover:text-primary dark:hover:text-primary-light'
                                }`}
                        >
                            <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
                            <span className={`text-[10px] font-bold uppercase tracking-wide ${active ? 'text-primary dark:text-primary-light' : ''}`}>
                                {tab.label}
                            </span>
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}