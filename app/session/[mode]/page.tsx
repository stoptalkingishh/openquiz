import { Suspense } from 'react'
import SessionModePage from './SessionModePage'

export function generateStaticParams() {
    return [
        { mode: 'learn' },
        { mode: 'drill' },
        { mode: 'exam' },
        { mode: 'mistakes' },
    ]
}

export default function SessionPage() {
    return (
        <Suspense fallback={null}>
            <SessionModePage />
        </Suspense>
    )
}