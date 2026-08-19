'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Library, BookOpen, User } from 'lucide-react'

export default function BottomNav() {
    const pathname = usePathname()

    const isActive = (path: string) => pathname === path

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-surface-dark border-t-2 border-gray-200 dark:border-gray-700 pb-safe pt-2 px-6 z-50">
            <div className="flex justify-between items-center max-w-md mx-auto">
                <Link href="/" className={`tab-item ${isActive('/') ? 'active' : ''}`}>
                    <Home className="w-6 h-6 mb-1" />
                    <span className="text-xs font-bold uppercase">Home</span>
                </Link>
                <Link href="/library" className={`tab-item ${isActive('/library') ? 'active' : ''}`}>
                    <BookOpen className="w-6 h-6 mb-1" />
                    <span className="text-xs font-bold uppercase">Library</span>
                </Link>
                <Link href="/quizzes" className={`tab-item ${isActive('/quizzes') ? 'active' : ''}`}>
                    <Library className="w-6 h-6 mb-1" />
                    <span className="text-xs font-bold uppercase">Quizzes</span>
                </Link>
                <Link href="/profile" className={`tab-item ${isActive('/profile') ? 'active' : ''}`}>
                    <User className="w-6 h-6 mb-1" />
                    <span className="text-xs font-bold uppercase">Profile</span>
                </Link>
            </div>
        </div>
    )
}
