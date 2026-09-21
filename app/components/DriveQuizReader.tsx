'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { driveQuizFileUrl, pickSharedDriveQuiz, readSharedDriveQuiz, validateDriveReference } from '../lib/drive'
import { parseSharedQuiz, SharedQuiz } from '../lib/share'
import { linkDriveQuiz } from '../lib/db'
import { useQuizStore } from '../lib/quizStore'

export default function DriveQuizReader({ fileId, resourceKey = '' }: { fileId?: string; resourceKey?: string }) {
    const { user, signInWithGoogle } = useAuth()
    const router = useRouter()
    const { setSelectedQuizPath } = useQuizStore()
    const [selected, setSelected] = useState({ id: fileId || '', resourceKey })
    const [quiz, setQuiz] = useState<SharedQuiz | null>(null)
    const [modified, setModified] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const generation = useRef(0)
    const realUser = user && user.id !== 'guest'
    const load = useCallback(async (id: string, key?: string) => {
        const request = ++generation.current
        setBusy(true); setError(''); setQuiz(null)
        try {
            const loaded = await readSharedDriveQuiz(id, key)
            const parsed = parseSharedQuiz(loaded.content)
            if (request !== generation.current) return
            setQuiz(parsed); setModified(loaded.file.modifiedTime || '')
        } catch (err) { if (request === generation.current) setError(err instanceof Error ? err.message : 'Could not open Drive quiz.') }
        finally { if (request === generation.current) setBusy(false) }
    }, [])
    useEffect(() => {
        setQuiz(null); setError(''); setBusy(false)
        if (realUser && selected.id) void load(selected.id, selected.resourceKey)
        return () => { generation.current += 1 }
    }, [user?.id, realUser, selected, load])
    const choose = async () => {
        setError(''); setBusy(true)
        try {
            const result = await pickSharedDriveQuiz(fileId)
            if (result) setSelected({ id: result.id, resourceKey: result.resourceKey || resourceKey })
        } catch (err) { setError(err instanceof Error ? err.message : 'Could not open Google Picker. Ask the sender for a JSON file as a fallback.') }
        finally { setBusy(false) }
    }
    const signIn = async () => {
        setBusy(true); setError('')
        try { await signInWithGoogle() }
        catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed.') }
        finally { setBusy(false) }
    }
    const start = async () => {
        if (!user || !quiz) return
        setBusy(true); setError('')
        try {
            const linked = await linkDriveQuiz(user.id, selected.id, selected.resourceKey)
            setSelectedQuizPath(`/custom-quiz/${linked.id}`)
            router.push('/session/learn')
        } catch (err) { setQuiz(null); setError(err instanceof Error ? err.message : 'Could not link this quiz.') }
        finally { setBusy(false) }
    }
    let driveUrl = ''
    try { if (selected.id) { validateDriveReference(selected.id, selected.resourceKey); driveUrl = driveQuizFileUrl(selected.id, selected.resourceKey) } } catch { /* Shown by load; never make an unvalidated external URL. */ }
    return <main className="min-h-screen p-6 pb-24"><div className="max-w-2xl mx-auto card space-y-4">
        <h1 className="text-2xl font-bold">Quiz shared through Google Drive</h1>
        <p>Google controls access. Sign in with the account the owner shared with. If requested, choose the file in Google Picker to let OpenQuiz read that specific file.</p>
        {!realUser ? <button disabled={busy} onClick={signIn} className="btn-primary">Sign in with Google</button> : <div className="flex flex-wrap gap-3">
            <button disabled={busy} onClick={choose} className="btn-outline">Choose shared file in Google Picker</button>
            {selected.id && <button disabled={busy} onClick={() => load(selected.id, selected.resourceKey)} className="btn-outline">Reload latest version</button>}
        </div>}
        {driveUrl && <a className="text-primary underline block" href={driveUrl} target="_blank" rel="noopener noreferrer">Open in Google Drive / request access</a>}
        {busy && <p role="status">Working…</p>}
        {error && <p role="alert" className="text-error">{error}</p>}
        {quiz && <section className="space-y-3">
            <h2 className="text-xl font-bold">{quiz.name}</h2><p>{quiz.description}</p>
            <p>{quiz.questions.length || quiz.words.length} items{modified ? ` · Updated ${new Date(modified).toLocaleString()}` : ''}</p>
            <button className="btn-primary" disabled={busy} onClick={start}>Add linked quiz & start learning</button>
            <p className="text-sm">This saves a bookmark in My Custom Quizzes. Each opening checks Drive access and loads the latest published questions. Only the owner edits the publication; your study progress stays private.</p>
        </section>}
        <p className="text-sm">A Google account and an internet connection are required here, including for Anyone with the link files. If Picker is unavailable, ask for an OpenQuiz JSON export and open it below as an independent copy.</p>
        <button className="btn-outline" onClick={() => router.push('/quiz/share/')}>Open a JSON export instead</button>
        <button className="btn-outline ml-2" onClick={() => router.push('/quizzes')}>Back to quizzes</button>
    </div></main>
}
