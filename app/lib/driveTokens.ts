/**
 * Persistence for the long-lived Google refresh token.
 *
 * Kept separate from `drive.ts` so it is trivially testable and so the
 * credential's storage location and lifetime are stated in one place.
 *
 * Security note: this is a long-lived credential in `localStorage`, readable by
 * any script that runs on the origin. That is acceptable here because the app is
 * fully static with no server, and because #48 removed the Google Fonts request
 * and made analytics opt-in, so there is very little third-party script surface.
 * It must not be revisited without re-examining that: adding any third-party
 * script re-opens this risk.
 */

const REFRESH_KEY = 'oquiz:drive_refresh_token'
const USER_KEY = 'oquiz:drive_user'

interface RefreshRecord {
    refreshToken: string
    /** Google account this token belongs to, so a different account cannot use it. */
    accountId: string
    savedAt: string
}

function storage(): Storage | null {
    try {
        if (typeof window === 'undefined') return null
        return window.localStorage
    } catch {
        return null
    }
}

export function saveRefreshToken(refreshToken: string, accountId: string): void {
    const store = storage()
    if (!store || !refreshToken || !accountId) return
    try {
        store.setItem(REFRESH_KEY, JSON.stringify({
            refreshToken,
            accountId,
            savedAt: new Date().toISOString()
        } satisfies RefreshRecord))
    } catch {
        /* Storage full or blocked; the user simply re-authenticates next time. */
    }
}

export function readRefreshToken(accountId: string | null | undefined): string | null {
    const store = storage()
    if (!store || !accountId) return null
    try {
        const raw = store.getItem(REFRESH_KEY)
        if (!raw) return null
        const record = JSON.parse(raw) as Partial<RefreshRecord>
        if (typeof record?.refreshToken !== 'string' || !record.refreshToken) return null
        // Only the account that minted the token may use it.
        if (record.accountId !== accountId) return null
        return record.refreshToken
    } catch {
        return null
    }
}

export function clearRefreshToken(): void {
    const store = storage()
    if (!store) return
    try {
        store.removeItem(REFRESH_KEY)
    } catch {
        /* Nothing to do; sign-out still clears the in-memory session. */
    }
}

/** True when a refresh token exists for the currently stored account. */
export function hasRefreshToken(): boolean {
    const store = storage()
    if (!store) return false
    try {
        const raw = store.getItem(REFRESH_KEY)
        const userRaw = store.getItem(USER_KEY)
        if (!raw || !userRaw) return false
        const record = JSON.parse(raw) as Partial<RefreshRecord>
        const user = JSON.parse(userRaw) as { id?: string }
        return !!record?.refreshToken && !!user?.id && record.accountId === user.id
    } catch {
        return false
    }
}