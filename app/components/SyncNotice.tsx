'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { syncLocalToCloud } from '../lib/db'
import { getSyncMessage, setSyncMessage } from '../lib/storage'

export default function SyncNotice() {
    const { user, signInWithGoogle } = useAuth()
    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        const update = () => setMessage(getSyncMessage())
        update()
        window.addEventListener('openquiz:sync-status', update)
        return () => window.removeEventListener('openquiz:sync-status', update)
    }, [user])
    if (!message) return null
    return <div role="status" className="sticky top-0 z-50 bg-amber-100 text-amber-950 px-4 py-3 text-sm flex flex-wrap items-center gap-3">
        <span>{message}</span>
        {user && user.id !== 'guest' && <button disabled={busy} className="underline font-bold" onClick={async () => {
            setBusy(true)
            try {
                await signInWithGoogle()
                if (await syncLocalToCloud()) setSyncMessage('')
            } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Could not reconnect. Please retry.') }
            finally { setBusy(false) }
        }}>{busy ? 'Syncing…' : 'Reconnect and sync'}</button>}
    </div>
}
