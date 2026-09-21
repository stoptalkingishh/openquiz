'use client'

import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { DriveQuizFile, driveQuizFileUrl, publishDriveQuiz } from '../lib/drive'
import { buildShareFile } from '../lib/share'
import { BASE_PATH } from '../lib/paths'
import { CustomQuiz } from '../lib/satTypes'

export function driveQuizLink(file: DriveQuizFile) {
    const params = new URLSearchParams({ drive: file.id })
    if (file.resourceKey) params.set('key', file.resourceKey)
    return `${window.location.origin}${BASE_PATH}/quiz/share/?${params}`
}

export default function DriveQuizShare({ quiz }: { quiz: CustomQuiz }) {
    const { user } = useAuth()
    const [file, setFile] = useState<DriveQuizFile | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const publish = async () => {
        setBusy(true); setError(''); setFile(null)
        try { setFile(await publishDriveQuiz(quiz.id, quiz.name, buildShareFile(quiz))) }
        catch (err) { setError(err instanceof Error ? err.message : 'Could not update Drive. Try again.') }
        finally { setBusy(false) }
    }
    if (quiz.drive_source) return <div className="text-sm mb-4">
        <p>This quiz stays linked to its owner’s Drive file. Opening it checks access and loads the latest published version.</p>
        <a href={driveQuizFileUrl(quiz.drive_source.file_id, quiz.drive_source.resource_key)} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open original in Google Drive</a>
    </div>
    return <section className="rounded-xl border border-primary/40 p-4 mb-4 space-y-3">
        <h3 className="font-bold">Share through Google Drive</h3>
        <p className="text-sm">Create or update a separate quiz file. Choose who can view it using Google Drive’s Share button, then send the OpenQuiz link below. Your other quizzes, progress, and AI notes stay private.</p>
        <button className="btn-primary" disabled={busy || !user || user.id === 'guest' || quiz.user_id !== user.id} onClick={publish}>{busy ? 'Updating Drive…' : 'Create / update shared version'}</button>
        {(!user || user.id === 'guest') && <p className="text-sm">Sign in with Google to use Drive sharing. Snapshot and file sharing remain available below.</p>}
        {error && <p role="alert" className="text-error text-sm">{error}</p>}
        {file && <div className="space-y-3 text-sm">
            <p>Shared version updated. Existing Drive access rules are unchanged. New files start restricted.</p>
            <a href={driveQuizFileUrl(file.id, file.resourceKey)} target="_blank" rel="noopener noreferrer" className="btn-outline inline-block">Open Drive → Share / manage access</a>
            <label className="block font-semibold">OpenQuiz link<input className="input-field mt-1" readOnly value={driveQuizLink(file)} onFocus={e => e.target.select()} /></label>
            <p>Use Viewer access for learners. Open the Drive Share dialog to add people or choose Anyone with the link. After changing link access, update here again to refresh the link if needed. Future updates keep the same file and OpenQuiz link.</p>
        </div>}
        <p className="text-xs text-neutral-500">After editing a quiz, use this button again to publish its latest content. Learners’ linked quizzes refresh when opened; an active session keeps its current questions. Removing access prevents future loads, but cannot retract copies already downloaded. Deleting a local quiz does not delete its Drive publication.</p>
    </section>
}
