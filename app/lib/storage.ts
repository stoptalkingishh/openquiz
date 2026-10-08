import { getDriveUser } from './drive'

/** The account id used while nobody is signed in. */
export const GUEST_ACCOUNT_ID = 'guest'

export function currentAccountId(): string {
    return getDriveUser()?.id || GUEST_ACCOUNT_ID
}

export function assertAccount(owner: string) {
    if (currentAccountId() !== owner) throw new Error('Account changed. Please retry in the current account.')
}

export function accountKey(key: string, owner = currentAccountId()) {
    return `${key}:account:${encodeURIComponent(owner)}`
}

// ---------------------------------------------------------------------------
// One-time guest -> account migration bookkeeping
// ---------------------------------------------------------------------------

const GUEST_MIGRATED_KEY = 'oquiz:guest_migrated'
const GUEST_MIGRATION_DISMISSED_KEY = 'oquiz:guest_migration_dismissed'

const GUEST_DATA_KEYS = [
    'oquiz:custom_quizzes',
    'oquiz:folders',
    'oquiz:progress',
    'oquiz:daily_stats',
    'oquiz:quiz_stats'
]

function readMarker(key: string, owner: string): boolean {
    if (typeof window === 'undefined') return false
    try { return window.localStorage.getItem(accountKey(key, owner)) !== null } catch { return false }
}

function writeMarker(key: string, owner: string) {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(accountKey(key, owner), new Date().toISOString()) } catch { /* ignore */ }
}

/** True when the guest bucket holds anything worth offering to move. */
export function guestDataPresent(): boolean {
    if (typeof window === 'undefined') return false
    for (const key of GUEST_DATA_KEYS) {
        let raw: string | null = null
        try { raw = window.localStorage.getItem(accountKey(key, GUEST_ACCOUNT_ID)) } catch { continue }
        if (!raw) continue
        try {
            const value = JSON.parse(raw)
            if (value && typeof value === 'object' && Object.keys(value).length) return true
        } catch { return true }
    }
    return false
}

export function guestMigrationCompleted(owner = currentAccountId()): boolean {
    return readMarker(GUEST_MIGRATED_KEY, owner)
}

export function markGuestMigrationCompleted(owner = currentAccountId()) {
    writeMarker(GUEST_MIGRATED_KEY, owner)
}

export function dismissGuestMigration(owner = currentAccountId()) {
    writeMarker(GUEST_MIGRATION_DISMISSED_KEY, owner)
}

/**
 * Whether a signed-in account should be offered the one-time guest migration.
 * Guest sessions never migrate, and neither a completed nor a dismissed offer
 * comes back for the same account.
 */
export function pendingGuestMigration(): boolean {
    const owner = currentAccountId()
    if (owner === GUEST_ACCOUNT_ID) return false
    if (guestMigrationCompleted(owner)) return false
    if (readMarker(GUEST_MIGRATION_DISMISSED_KEY, owner)) return false
    return guestDataPresent()
}

const messages = new Map<string, string>()
export function getSyncMessage() { return messages.get(currentAccountId()) || '' }

export function setSyncMessage(message: string, owner = currentAccountId()) {
    if (typeof window === 'undefined' || currentAccountId() !== owner) return
    messages.set(owner, message)
    window.dispatchEvent(new CustomEvent('openquiz:sync-status', { detail: message }))
}

export function readAccountData<T>(key: string, fallback: T, owner = currentAccountId()): T {
    if (typeof window === 'undefined') return fallback
    try {
        const value = window.localStorage.getItem(accountKey(key, owner))
        if (value !== null) return JSON.parse(value) as T
        const legacyText = window.localStorage.getItem(key)
        if (!legacyText) return fallback
        const legacy = JSON.parse(legacyText)
        // Only recover records with provable ownership. Unowned old history
        // remains untouched under its original key, never uploaded to a new user.
        if (key === 'oquiz:custom_quizzes' || key === 'oquiz:folders') {
            return (Array.isArray(legacy) ? legacy.filter(v => v?.user_id === owner) : fallback) as T
        }
        if (key === 'oquiz:daily_stats') {
            return Object.fromEntries(Object.entries(legacy).filter(([, v]: [string, any]) => v?.user_id === owner)) as T
        }
        if (key === 'oquiz:progress' && legacy?.[owner] && !legacy[owner].word) {
            return { [owner]: legacy[owner] } as T
        }
        return fallback
    } catch {
        return fallback
    }
}

export function writeAccountData(key: string, value: unknown, owner = currentAccountId()) {
    if (typeof window === 'undefined') throw new Error('Browser storage is unavailable.')
    assertAccount(owner)
    try {
        window.localStorage.setItem(accountKey(key, owner), JSON.stringify(value))
    } catch {
        const message = 'Could not save in this browser. Free storage space or export your draft and retry.'
        setSyncMessage(message, owner)
        throw new Error(message)
    }
}
