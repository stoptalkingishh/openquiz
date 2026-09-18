'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface ThemeContextType {
    darkMode: boolean
    toggleDarkMode: () => void
}

const ThemeContext = createContext<ThemeContextType>({
    darkMode: false,
    toggleDarkMode: () => { },
})

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [darkMode, setDarkMode] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        // Check localStorage and system preference
        let stored: string | null = null
        try {
            stored = localStorage.getItem('darkMode')
        } catch {
            stored = null
        }
        if (stored !== null) {
            setDarkMode(stored === 'true')
        } else {
            setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
        }
    }, [])

    useEffect(() => {
        if (!mounted) return

        if (darkMode) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
        try {
            localStorage.setItem('darkMode', String(darkMode))
        } catch {
            // theme persistence is best-effort
        }
    }, [darkMode, mounted])

    const toggleDarkMode = () => setDarkMode(!darkMode)

    // Prevent flash of unstyled content
    if (!mounted) {
        return <div style={{ visibility: 'hidden' }}>{children}</div>
    }

    return (
        <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    return useContext(ThemeContext)
}
