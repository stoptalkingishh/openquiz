import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SAT Vocabulary Quiz | Share',
  description: 'Practice SAT vocabulary words with spaced repetition. Master words, ace the test.',
  openGraph: {
    title: 'SAT Vocabulary Quiz',
    description: 'Practice SAT vocabulary words with spaced repetition.',
    images: ['/sat/logo.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'SAT Vocabulary Quiz',
    description: 'Practice SAT vocabulary words with spaced repetition.',
    images: ['/sat/logo.png'],
  },
}

export default function QuizShareLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}


