import { Suspense } from 'react'
import QuizDetailClient from './QuizDetailClient'

export default function QuizDetailPage() {
    return (
        <Suspense fallback={null}>
            <QuizDetailClient />
        </Suspense>
    )
}