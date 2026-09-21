import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ServiceWorker from './components/ServiceWorker'
import SyncNotice from './components/SyncNotice'
import { assetPath } from './lib/paths'

const googleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-G0MB0JNRD4'

export const metadata: Metadata = {
  title: 'OpenQuiz - Learn | Master',
  description: 'Make and master quizzes with free pre-made sets, flashcards, simulations and match games.',
  manifest: assetPath('/manifest.webmanifest'),
  icons: {
    icon: assetPath('/favicon.svg'),
  },
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
        <Script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${googleAnalyticsId}');`}
        </Script>
      </body>
    </html>
  )
}
