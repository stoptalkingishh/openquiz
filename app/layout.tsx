import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ServiceWorker from './components/ServiceWorker'
import SyncNotice from './components/SyncNotice'
import { assetPath } from './lib/paths'

export const metadata: Metadata = {
  title: 'OpenQuiz - Learn | Master',
  description: 'Make and master quizzes with free pre-made sets, flashcards, simulations and match games.',
  manifest: assetPath('/manifest.webmanifest'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <SyncNotice />
            {children}
          </AuthProvider>
        </ThemeProvider>
        <ServiceWorker />
      </body>
    </html>
  )
}
