import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    clearRefreshToken, hasRefreshToken, readRefreshToken, saveRefreshToken
} from '../app/lib/driveTokens'

const USER_KEY = 'oquiz:drive_user'

function makeStorage() {
    const store = new Map<string, string>()
    return {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
        clear: () => store.clear(),
        // Indexed rather than spread: the project target is below ES2015.
        key: (i: number) => { const keys = Array.from(store.keys()); return keys[i] ?? null },
        get length() { return store.size },
    }
}

describe('refresh token storage', () => {
    let store: ReturnType<typeof makeStorage>

    beforeEach(() => {
        store = makeStorage()
        // @ts-expect-error test shim
        globalThis.window = { localStorage: store }
    })

    afterEach(() => {
        // @ts-expect-error cleanup
        delete globalThis.window
    })

    it('round-trips a token for the same account', () => {
        saveRefreshToken('refresh-abc', 'account-1')
        expect(readRefreshToken('account-1')).toBe('refresh-abc')
    })

    it('refuses to hand one account another account token', () => {
        // Sign-in as a different account must not be able to reuse the previous
        // account's credential, which would grant access to the wrong Drive.
        saveRefreshToken('refresh-abc', 'account-1')
        expect(readRefreshToken('account-2')).toBeNull()
    })

    it('returns null when no account id is supplied', () => {
        saveRefreshToken('refresh-abc', 'account-1')
        expect(readRefreshToken(null)).toBeNull()
        expect(readRefreshToken(undefined)).toBeNull()
    })

    it('returns null when nothing is stored', () => {
        expect(readRefreshToken('account-1')).toBeNull()
    })

    it('ignores malformed stored records instead of throwing', () => {
        store.setItem('oquiz:drive_refresh_token', 'not-json')
        expect(readRefreshToken('account-1')).toBeNull()
        store.setItem('oquiz:drive_refresh_token', JSON.stringify({ refreshToken: 123 }))
        expect(readRefreshToken('account-1')).toBeNull()
    })

    it('clears the token', () => {
        saveRefreshToken('refresh-abc', 'account-1')
        clearRefreshToken()
        expect(readRefreshToken('account-1')).toBeNull()
    })

    it('ignores an empty token or missing account id on save', () => {
        saveRefreshToken('', 'account-1')
        expect(readRefreshToken('account-1')).toBeNull()
        saveRefreshToken('refresh-abc', '')
        expect(readRefreshToken('')).toBeNull()
    })

    describe('hasRefreshToken', () => {
        it('is false when the stored account does not match the token owner', () => {
            saveRefreshToken('refresh-abc', 'account-1')
            store.setItem(USER_KEY, JSON.stringify({ id: 'account-2' }))
            expect(hasRefreshToken()).toBe(false)
        })

        it('is true when the stored account owns the token', () => {
            saveRefreshToken('refresh-abc', 'account-1')
            store.setItem(USER_KEY, JSON.stringify({ id: 'account-1' }))
            expect(hasRefreshToken()).toBe(true)
        })

        it('is false with no stored user, even if a token exists', () => {
            saveRefreshToken('refresh-abc', 'account-1')
            expect(hasRefreshToken()).toBe(false)
        })
    })
})