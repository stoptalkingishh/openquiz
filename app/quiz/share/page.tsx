import { Suspense } from 'react'
import QuizShareClient from './QuizShareClient'

export default function QuizSharePage() {
    return (
        <Suspense fallback={null}>
            <QuizShareClient />
        </Suspense>
    )
}