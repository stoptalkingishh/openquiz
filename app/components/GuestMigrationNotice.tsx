'use client'

import { useCallback, useEffect, useState } from 'react'
import { HardDrive } from 'lucide-react'
import { migrateGuestDataToAccount } from '../lib/db'
import { dismissGuestMigration, pendingGuestMigration } from '../lib/storage'

/**
 * One-time offer to move this browser's guest data into the signed-in account.
 *
 * Deliberately explicit: nothing is migrated on sign-in, so a user who signed
 * in on a shared machine is never surprised by a silent merge. Dismissing is
 * remembered per account so the banner does not come back on every reload.
 */
export default function GuestMigrationNotice() {
    const [visible, setVisible] = useState(false)
    const [busy, setBusy] = useState(false)
    const [done, setDone] = useState(false)

    const refresh = useCallback(() => setVisible(pendingGuestMigration()), [])

    useEffect(() => {
        refresh()
        window.addEventListener('openquiz:sync-status', refresh)
        return () => window.removeEventListener('openquiz:sync-status', refresh)
    }, [refresh])

    if (!visible) return null

    return (
        <div
            role="status"
            className="sticky top-0 z-50 bg-blue-100 text-blue-950 px-4 py-3 text-sm flex flex-wrap items-center gap-3"
        >
            <HardDrive className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-48">
                {done
                    ? 'Your guest quizzes and progress are now in your Google Drive account.'
                    : 'This browser has study data from before you signed in. Move it into your Google account?'}
            </span>
            {!done && (
                <>
                    <button
                        disabled={busy}
                        className="underline font-bold disabled:opacity-60"
                        onClick={async () => {
                            setBusy(true)
                            try {
                                // A failed migration leaves the guest copy and the
                                // pending offer untouched, so this can simply be retried.
                                if (await migrateGuestDataToAccount()) setDone(true)
                            } finally {
                                setBusy(false)
                                refresh()
                            }
                        }}
                    >
                        {busy ? 'Moving…' : 'Move my data'}
                    </button>
                    <button
                        disabled={busy}
                        className="underline disabled:opacity-60"
                        onClick={() => {
                            dismissGuestMigration()
                            refresh()
                        }}
                    >
                        Not now
                    </button>
                </>
            )}
        </div>
    )
}