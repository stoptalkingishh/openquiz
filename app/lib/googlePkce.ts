/**
 * OAuth 2.0 Authorization Code flow with PKCE, for a browser-only app.
 *
 * The previous flow used the GIS `initTokenClient`, which is the *implicit*
 * flow: it returns a short-lived access token (about an hour) and **no refresh
 * token**. Renewing it then depended on Google's browser session cookie still
 * being alive, so Drive sync quietly stopped working after roughly an hour and
 * stayed stopped until a reload. From the user's side that looks like being
 * signed out, even though the stored profile is untouched.
 *
 * With the code flow and `access_type=offline`, Google returns a refresh token
 * that can mint new access tokens without any user interaction. That decouples
 * persistence from Google's session lifetime.
 *
 * There is no server here, so this is a public client: no client secret, PKCE
 * provides the protection a secret otherwise would.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

export interface TokenResponse {
    access_token: string
    /** Absent when refreshing - Google only issues a refresh token on first grant. */
    refresh_token?: string
    expires_in: number
    id_token?: string
    scope?: string
    token_type?: string
}

export interface PkceOptions {
    clientId: string
    scope: string
    redirectUri: string
    /** Force the consent screen so a refresh token is issued. */
    promptConsent?: boolean
}

/** Storage for the in-flight PKCE verifier/state, keyed so parallel tabs do not clash. */
const VERIFIER_PREFIX = 'oquiz:pkce_verifier:'
const STATE_PREFIX = 'oquiz:pkce_state:'

function randomUrlSafe(bytes: number): string {
    const buf = new Uint8Array(bytes)
    crypto.getRandomValues(buf)
    return base64UrlEncode(buf)
}

export function base64UrlEncode(bytes: Uint8Array): string {
    // Indexed loop rather than `for..of`: the project's TS target is below
    // ES2015, so iterating a typed array directly is a compile error.
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function requireCrypto(): void {
    if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.getRandomValues) {
        throw new Error('This browser does not support the crypto features required for sign-in.')
    }
}

/**
 * RFC 7636 verifier: 43-128 characters from the unreserved set.
 * 32 random bytes base64url-encode to 43 characters, which is the minimum.
 */
export function generateCodeVerifier(): string {
    requireCrypto()
    return randomUrlSafe(32)
}

/** S256 challenge: BASE64URL(SHA256(ASCII(verifier))). */
export async function generateCodeChallenge(verifier: string): Promise<string> {
    requireCrypto()
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    return base64UrlEncode(new Uint8Array(digest))
}

export function generateState(): string {
    requireCrypto()
    return randomUrlSafe(16)
}

/**
 * Absolute URL of the static callback page.
 *
 * Google compares redirect URIs exactly, so this has to resolve to the app
 * root on every route. Deriving it from `location.pathname` is wrong: the app
 * is served under a base path and can be on a nested route, so `/openquiz/auth/`
 * would yield `/openquiz/auth/oauth-callback.html`, which is not registered and
 * makes the token exchange fail with a 400. The base path is known exactly, so
 * use it rather than inferring it.
 */
export function callbackUrlFor(origin: string, basePath: string): string {
    const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
    return `${origin}${base}/oauth-callback.html`
}

/** Query params the callback page hands back to the app. */
export const OAUTH_RESULT_PARAMS = { code: 'oq_code', state: 'oq_state', error: 'oq_error' } as const

/**
 * Read an in-flight authorization result that the callback page bounced back
 * into the app URL. Returns null when there is nothing to complete.
 */
export function readAuthResult(search: string): { code?: string; state?: string; error?: string } | null {
    const params = new URLSearchParams(search)
    const code = params.get(OAUTH_RESULT_PARAMS.code) || undefined
    const state = params.get(OAUTH_RESULT_PARAMS.state) || undefined
    const error = params.get(OAUTH_RESULT_PARAMS.error) || undefined
    return code || state || error ? { code, state, error } : null
}

export function storageKey(prefix: string, state: string): string {
    return prefix + state
}

export interface PkcePending {
    verifier: string
    state: string
}

export async function beginPkce(options: PkceOptions): Promise<{ url: string; pending: PkcePending }> {
    const verifier = generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    const state = generateState()

    // sessionStorage so a reload mid-flow does not leave a stale verifier that
    // a later flow could pick up.
    try {
        window.sessionStorage.setItem(storageKey(VERIFIER_PREFIX, state), verifier)
        window.sessionStorage.setItem(storageKey(STATE_PREFIX, state), state)
    } catch {
        throw new Error('Could not start sign-in: browser storage is unavailable.')
    }

    const url = new URL(AUTH_ENDPOINT)
    url.searchParams.set('client_id', options.clientId)
    url.searchParams.set('redirect_uri', options.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', options.scope)
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('state', state)
    url.searchParams.set('access_type', 'offline')
    // `include_granted_scopes` avoids re-prompting for scopes already granted.
    url.searchParams.set('include_granted_scopes', 'true')
    url.searchParams.set('prompt', options.promptConsent ? 'consent' : '')
    return { url: url.toString(), pending: { verifier, state } }
}

/**
 * Consume the stored verifier for a returned state, and delete it.
 * Returns null if the state is unknown, which is how a mismatched or forged
 * callback is rejected.
 */
export function consumePkceVerifier(state: string): string | null {
    try {
        const key = storageKey(VERIFIER_PREFIX, state)
        const verifier = window.sessionStorage.getItem(key)
        window.sessionStorage.removeItem(key)
        window.sessionStorage.removeItem(storageKey(STATE_PREFIX, state))
        return verifier
    } catch {
        return null
    }
}

export function isKnownState(state: string): boolean {
    try {
        return window.sessionStorage.getItem(storageKey(STATE_PREFIX, state)) === state
    } catch {
        return false
    }
}

async function postTokenRequest(body: URLSearchParams): Promise<TokenResponse> {
    const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    })
    if (!res.ok) {
        let detail = ''
        try {
            const json = await res.json()
            if (typeof json?.error_description === 'string') detail = json.error_description
            else if (typeof json?.error === 'string') detail = json.error
        } catch {
            /* status is enough */
        }
        // invalid_grant is the normal signal that a refresh token was revoked or
        // expired. Callers treat it as "re-authenticate", not as a transient error.
        throw new TokenError(detail || `token request failed (${res.status})`, res.status, jsonError(body))
    }
    return (await res.json()) as TokenResponse
}

function jsonError(body: URLSearchParams): string | null {
    return body.get('grant_type') === 'refresh_token' ? 'invalid_grant' : null
}

export class TokenError extends Error {
    constructor(message: string, readonly status: number, readonly code: string | null) {
        super(message)
        this.name = 'TokenError'
    }
}

/**
 * Google's token endpoint rejects a code exchange that lacks `client_secret`,
 * even when PKCE is present. This is a documented Google-specific limitation
 * rather than an RFC 7636 violation: unlike Auth0/Okta, Google has no
 * "public client" mode for web apps that lets you omit the secret.
 *
 * The secret therefore ships in the client bundle. For this app that is
 * acceptable: it is a static site with no backend, PKCE still prevents code
 * interception, and the redirect URI is pinned, so the secret does not grant
 * anything PKCE has not already protected. It must not be treated as proof
 * that a request came from OpenQuiz. See docs/google-sign-in.md.
 */
export async function exchangeCodeForTokens(options: {
    clientId: string
    clientSecret: string
    code: string
    verifier: string
    redirectUri: string
}): Promise<TokenResponse> {
    const body = new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        code: options.code,
        code_verifier: options.verifier,
        grant_type: 'authorization_code',
        redirect_uri: options.redirectUri,
    })
    const tokens = await postTokenRequest(body)
    // Without this, the first consent of a brand-new account returns no refresh
    // token and the user is silently back to hourly re-auth.
    if (!tokens.refresh_token) {
        throw new Error('Google did not return a refresh token. Revoke the app access and sign in again.')
    }
    return tokens
}

export async function refreshWithRefreshToken(options: {
    clientId: string
    clientSecret: string
    refreshToken: string
}): Promise<TokenResponse> {
    const body = new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        refresh_token: options.refreshToken,
        grant_type: 'refresh_token',
    })
    return postTokenRequest(body)
}

/** Decode the `id_token` payload without verifying it. Safe here: the token
 *  arrives directly from Google's token endpoint over TLS, and it is used only
 *  for display (name/email), never for authorization decisions. */
export function decodeIdTokenPayload(idToken: string): Record<string, unknown> | null {
    try {
        const [, payload] = idToken.split('.')
        if (!payload) return null
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        const parsed = JSON.parse(json)
        return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : null
    } catch {
        return null
    }
}