import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Share a Quiz | OpenQuiz',
  description: 'Study, practice and share quizzes on OpenQuiz — free pre-made sets, flashcards, simulations and match games.',
  openGraph: {
    title: 'Shared Quiz | OpenQuiz',
    description: 'Someone shared a quiz with you on OpenQuiz. Learn · Master.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Shared Quiz | OpenQuiz',
    description: 'Someone shared a quiz with you on OpenQuiz. Learn · Master.',
  },
}

export default function QuizShareLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}