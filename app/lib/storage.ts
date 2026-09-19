import { getDriveUser } from './drive'

export function currentAccountId(): string {
    return getDriveUser()?.id || 'guest'
}

export function assertAccount(owner: string) {
    if (currentAccountId() !== owner) throw new Error('Account changed. Please retry in the current account.')
}

export function accountKey(key: string, owner = currentAccountId()) {
    return `${key}:account:${encodeURIComponent(owner)}`
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
