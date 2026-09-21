'use client'

import { FormEvent, useState } from 'react'
import { Send } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { buildQuizPublicationRequestUrl } from '../lib/githubFeedback'
import { CustomQuiz } from '../lib/satTypes'

export default function QuizPublicationRequest({ quiz }: { quiz: CustomQuiz }) {
    const { user } = useAuth()
    const [email, setEmail] = useState('')
    const [shareUrl, setShareUrl] = useState('')
    const [attribution, setAttribution] = useState('')
    const [rightsConfirmed, setRightsConfirmed] = useState(false)

    const isOwner = Boolean(user && user.id !== 'guest' && quiz.user_id === user.id)
    if (quiz.drive_source || !isOwner) return null

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!rightsConfirmed) return
        window.open(buildQuizPublicationRequestUrl({
            quizName: quiz.name,
            contactEmail: email.trim(),
            shareUrl: shareUrl.trim(),
            sourceAttribution: attribution.trim()
        }), '_blank', 'noopener,noreferrer')
    }

    return <section className="rounded-xl border border-primary/40 p-4 mb-4 space-y-3">
        <h3 className="font-bold">Submit for catalog review</h3>
        <p className="text-sm">Keep using the share link above for learners. This separate request lets OpenQuiz review the quiz for the free public catalog at our own pace; submitting it does not publish it automatically.</p>
        <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm font-semibold">Contact email <span aria-hidden="true">*</span>
                <input className="input-field mt-1" type="email" value={email} onChange={event => setEmail(event.target.value)} required autoComplete="email" placeholder="you@example.com" />
            </label>
            <p className="-mt-2 text-xs text-warning">This email is added to a public GitHub Issue. Use an address you are comfortable making public.</p>
            <label className="block text-sm font-semibold">Public quiz link <span aria-hidden="true">*</span>
                <input className="input-field mt-1" type="url" value={shareUrl} onChange={event => setShareUrl(event.target.value)} required placeholder="Paste a Drive or OpenQuiz share link" />
            </label>
            <label className="block text-sm font-semibold">Source, license, or attribution <span aria-hidden="true">*</span>
                <textarea className="input-field mt-1 min-h-20" value={attribution} onChange={event => setAttribution(event.target.value)} required placeholder="For example: original work, CC BY source with link, or permission details" />
            </label>
            <label className="flex items-start gap-2 text-sm">
                <input className="mt-1" type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} required />
                <span>I created this quiz or have permission to submit all of its content for free public use.</span>
            </label>
            <button type="submit" className="btn-outline w-full flex items-center justify-center gap-2" disabled={!rightsConfirmed}>
                <Send className="w-4 h-4" /> Request catalog review on GitHub
            </button>
        </form>
        <p className="text-xs text-neutral-500">GitHub opens a prefilled review request. Maintainers may ask questions in the Issue, then add approved work through a tracked content pull request.</p>
    </section>
}
