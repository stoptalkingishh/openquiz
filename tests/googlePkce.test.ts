import { describe, expect, it, vi, afterEach, beforeAll } from 'vitest'
import {
    base64UrlEncode, callbackUrlFor, decodeIdTokenPayload, exchangeCodeForTokens,
    generateCodeChallenge, generateCodeVerifier, generateState, readAuthResult, refreshWithRefreshToken, TokenError
} from '../app/lib/googlePkce'

// Node's webcrypto backs globalThis.crypto in recent runtimes; make sure the
// module sees it, since PKCE cannot fall back to a weak randomness source.
beforeAll(async () => {
    if (!globalThis.crypto?.subtle) {
        const { webcrypto } = await import('node:crypto')
        // @ts-expect-error test shim
        globalThis.crypto = webcrypto
    }
})

// The suite runs in the default node environment, so there is no `window`.
// Only the browser-storage helpers need one, and they are stubbed below.
function stubSessionStorage(): Map<string, string> {
    const store = new Map<string, string>()
    const shim = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
        clear: () => store.clear(),
        // Indexed rather than spread: the project target is below ES2015.
        key: (i: number) => { const keys = Array.from(store.keys()); return keys[i] ?? null },
        get length() { return store.size },
    }
    // @ts-expect-error test shim
    globalThis.window = { sessionStorage: shim, localStorage: shim }
    return store
}

describe('PKCE code verifier', () => {
    it('produces an RFC 7636 compliant verifier', () => {
        const verifier = generateCodeVerifier()
        // 43-128 characters from the unreserved set.
        expect(verifier.length).toBeGreaterThanOrEqual(43)
        expect(verifier.length).toBeLessThanOrEqual(128)
        expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
    })

    it('does not repeat itself', () => {
        const seen = new Set(Array.from({ length: 25 }, () => generateCodeVerifier()))
        expect(seen.size).toBe(25)
    })

    it('generates distinct state values', () => {
        expect(generateState()).not.toBe(generateState())
    })
})

describe('PKCE code challenge', () => {
    it('is BASE64URL(SHA256(verifier)) with no padding', async () => {
        // Known vector from RFC 7636 appendix B.
        const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
        const challenge = await generateCodeChallenge(verifier)
        expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
        expect(challenge).not.toContain('=')
        expect(challenge).not.toContain('+')
        expect(challenge).not.toContain('/')
    })

    it('is deterministic for the same verifier', async () => {
        const v = generateCodeVerifier()
        expect(await generateCodeChallenge(v)).toBe(await generateCodeChallenge(v))
    })
})

describe('base64UrlEncode', () => {
    it('strips padding and uses the URL-safe alphabet', () => {
        // 0xFB 0xFF encodes to "+/8=" in standard base64.
        expect(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xff]))).toBe('-___')
    })

    it('encodes an empty input', () => {
        expect(base64UrlEncode(new Uint8Array([]))).toBe('')
    })
})

describe('id_token decoding', () => {
    it('reads the payload', () => {
        const payload = btoa(JSON.stringify({ sub: '123', email: 'a@b.c', name: 'A' }))
        expect(decodeIdTokenPayload(`h.${payload}.s`)).toMatchObject({ sub: '123', email: 'a@b.c' })
    })

    it('handles base64url padding differences', () => {
        const raw = JSON.stringify({ sub: 'x' })
        const payload = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        expect(decodeIdTokenPayload(`h.${payload}.s`)).toMatchObject({ sub: 'x' })
    })

    it('returns null for malformed input rather than throwing', () => {
        expect(decodeIdTokenPayload('nonsense')).toBeNull()
        expect(decodeIdTokenPayload('a.!!!.c')).toBeNull()
        expect(decodeIdTokenPayload('')).toBeNull()
    })
})

describe('callback URL resolution', () => {
    // Regression: the app is served under a base path and can be on a nested
    // route, but Google compares redirect URIs exactly. Resolving against the
    // current directory produced /openquiz/auth/oauth-callback.html, which is
    // not registered, and the token exchange failed with a 400.
    const O = 'https://stoptalkingishh.github.io'

    it('uses the base path, independent of the current route', () => {
        expect(callbackUrlFor(O, '/openquiz')).toBe(`${O}/openquiz/oauth-callback.html`)
    })

    it('does not double a trailing slash on the base path', () => {
        expect(callbackUrlFor(O, '/openquiz/')).toBe(`${O}/openquiz/oauth-callback.html`)
    })

    it('works with no base path for local development', () => {
        expect(callbackUrlFor('http://localhost:3000', '')).toBe('http://localhost:3000/oauth-callback.html')
    })

    it('never produces a double slash or an empty path segment', () => {
        for (const base of ['', '/', '/openquiz', '/openquiz/']) {
            const url = callbackUrlFor(O, base)
            expect(url).not.toContain('//o')
            expect(url).not.toMatch(/[^:]\/\/oauth/)
            expect(url).toBe(new URL(url).toString())
        }
    })
})

describe('auth result hand-off', () => {
    // The callback page bounces back to the app root with the result in the URL,
    // so these params are the hand-off between the two.
    it('reads a returned code and state', () => {
        const r = readAuthResult('?oq_code=abc123&oq_state=xyz')
        expect(r).toEqual({ code: 'abc123', state: 'xyz', error: undefined })
    })

    it('reads a returned error', () => {
        const r = readAuthResult('?oq_error=access_denied')
        expect(r).toEqual({ code: undefined, state: undefined, error: 'access_denied' })
    })

    it('returns null when there is nothing to complete', () => {
        expect(readAuthResult('')).toBeNull()
        expect(readAuthResult('?other=1')).toBeNull()
    })

    it('does not treat an unrelated code param as a result', () => {
        // A share link may legitimately carry ?code= for other purposes.
        expect(readAuthResult('?code=abc&state=def')).toBeNull()
    })
})

describe('TokenError', () => {
    afterEach(() => { vi.restoreAllMocks() })

    it('carries status and code so callers can distinguish invalid_grant', () => {
        const err = new TokenError('bad', 400, 'invalid_grant')
        expect(err).toBeInstanceOf(Error)
        expect(err.status).toBe(400)
        expect(err.code).toBe('invalid_grant')
    })
})
describe('token exchange sends the client secret', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

    const okTokens = () => new Response(JSON.stringify({
        access_token: 'at', refresh_token: 'rt', expires_in: 3600, id_token: 'h.e30.s'
    }), { status: 200 })

    it('includes client_secret in the authorization_code exchange', async () => {
        const fetchMock = vi.fn(async () => okTokens())
        vi.stubGlobal('fetch', fetchMock)

        await exchangeCodeForTokens({ clientId: 'cid', clientSecret: 'SECRET', code: 'c', verifier: 'v', redirectUri: 'https://x/cb' })

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe('https://oauth2.googleapis.com/token')
        const body = String(init.body)
        expect(body).toContain('client_secret=SECRET')
        expect(body).toContain('client_id=cid')
        expect(body).toContain('code_verifier=v')
        expect(body).toContain('grant_type=authorization_code')
    })

    it('includes client_secret in the refresh_token grant', async () => {
        const fetchMock = vi.fn(async () => okTokens())
        vi.stubGlobal('fetch', fetchMock)

        await refreshWithRefreshToken({ clientId: 'cid', clientSecret: 'SECRET', refreshToken: 'rt' })

        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        const body = String(init.body)
        expect(body).toContain('client_secret=SECRET')
        expect(body).toContain('refresh_token=rt')
        expect(body).toContain('grant_type=refresh_token')
    })

    it('surfaces Google error detail on failure', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: 'invalid_request', error_description: 'client_secret is missing.'
        }), { status: 400 })))

        await expect(
            exchangeCodeForTokens({ clientId: 'cid', clientSecret: '', code: 'c', verifier: 'v', redirectUri: 'https://x/cb' })
        ).rejects.toThrow(/client_secret is missing/)
    })
})
