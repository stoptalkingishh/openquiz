'use client'

/**
 * Google Drive data + auth layer for the static build.
 *
 * Sign-in uses OAuth 2.0 Authorization Code + PKCE (see `googlePkce.ts`) so the
 * app holds a long-lived refresh token and can mint access tokens without user
 * interaction. The previous GIS token-client (implicit) flow issued only a
 * ~1 hour access token with no refresh token, so Drive sync stopped working once
 * Google's browser session lapsed. The Drive API v3 stores app data as JSON
 * files inside a per-user folder named "OpenQuiz" in the signed-in user's own
 * Google Drive.
 *
 * Scope is limited to drive.file (only files this app creates). When the
 * Google keys are not configured at build time, everything falls back to
 * localStorage in guest mode — data-layer callers don't need to change.
 */

import {
    beginPkce, callbackUrlFor, consumePkceVerifier, exchangeCodeForTokens, isKnownState,
    refreshWithRefreshToken, TokenError, type TokenResponse
} from './googlePkce'
import { clearRefreshToken, readRefreshToken, saveRefreshToken } from './driveTokens'
import { BASE_PATH } from './paths'

declare global {
    interface Window {
        google?: any
        gapi?: any
    }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ''

const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/generative-language.retriever'
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
const FOLDER_NAME = 'OpenQuiz'

export function isDriveConfigured(): boolean {
    return Boolean(CLIENT_ID && API_KEY)
}

export interface DriveUser {
    id: string
    email: string
    name: string
    picture: string
    created_at: string
}

let initialized = false
let currentToken: string | null = null
let tokenExpiresAt = 0
let currentUser: DriveUser | null = null
let driveReady: Promise<boolean> | null = null
let lastIdToken: string | null = null
let authGeneration = 0

interface AuthContext {
    generation: number
    userId: string | null
}

interface TokenGrant {
    accessToken: string
    idToken: string | null
    expiresAt: number
}

export class DriveError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message)
        this.name = 'DriveError'
    }
}

function captureAuthContext(): AuthContext {
    return { generation: authGeneration, userId: currentUser?.id || null }
}

function isAuthContextCurrent(context: AuthContext): boolean {
    if (context.generation !== authGeneration) return false
    if (context.userId && currentUser?.id && context.userId !== currentUser.id) return false
    return true
}

function assertAuthContextCurrent(context: AuthContext): void {
    if (!isAuthContextCurrent(context)) {
        throw new DriveError('Google Drive session changed while the operation was in progress')
    }
}

function invalidateToken() {
    currentToken = null
    tokenExpiresAt = 0
}

function beginAuthTransition() {
    authGeneration += 1
    invalidateToken()
    currentUser = null
    lastIdToken = null
    tokenRequest = null
}

// ---------------------------------------------------------------------------
// Script / client loading
// ---------------------------------------------------------------------------

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (typeof document === 'undefined') {
            reject(new Error('Not in browser'))
            return
        }
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve()
            return
        }
        const s = document.createElement('script')
        s.src = src
        s.async = true
        s.onload = () => resolve()
        s.onerror = () => reject(new Error(`Failed to load ${src}`))
        document.head.appendChild(s)
    })
}

// Resolve to `fallback` if the promise doesn't settle within `ms` so a slow
// or blocked Google API can never leave the UI hanging forever.
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return new Promise<T>((resolve) => {
        const t = setTimeout(() => {
            console.error(`Drive operation timed out after ${ms}ms`)
            resolve(fallback)
        }, ms)
        promise.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(fallback) })
    })
}

function withTimeoutOrThrow<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new DriveError(`${label} timed out after ${ms}ms`)), ms)
        Promise.resolve(promise).then(v => {
            clearTimeout(t)
            resolve(v)
        }, err => {
            clearTimeout(t)
            reject(new DriveError(`${label} failed`, err))
        })
    })
}

function initGapi(): Promise<boolean> {
    if (!initialized) {
        initialized = true
        driveReady = withTimeout((async () => {
            try {
                await loadScript('https://accounts.google.com/gsi/client')
                await loadScript('https://apis.google.com/js/api.js')
                await new Promise<void>((resolve, reject) => {
                    window.gapi.load('client', { callback: () => resolve(), onerror: () => reject(new Error('gapi client failed')) })
                })
                await window.gapi.client.init({
                    apiKey: API_KEY,
                    discoveryDocs: [DISCOVERY_DOC]
                })
                return true
            } catch (err) {
                console.error('Drive init failed:', err)
                return false
            }
        })(), 10000, false)
            .then(ok => {
                if (!ok) {
                    // Allow retry on the next attempt.
                    initialized = false
                    driveReady = null
                }
                return ok
            })
    }
    return driveReady!
}

// ---------------------------------------------------------------------------
// Token + profile
// ---------------------------------------------------------------------------

function requestToken(prompt: 'consent' | ''): Promise<TokenGrant> {
    return new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPE,
            callback: (response: any) => {
                if (response?.access_token) {
                    const expiresIn = Number(response.expires_in)
                    resolve({
                        accessToken: response.access_token,
                        idToken: response.id_token || null,
                        expiresAt: Number.isFinite(expiresIn) && expiresIn > 0
                            ? Date.now() + expiresIn * 1000
                            : Date.now() + 45 * 60 * 1000
                    })
                } else {
                    reject(new Error(response?.error_description || response?.error || 'Google sign-in failed'))
                }
            },
            error_callback: (error: any) => {
                reject(new Error(error?.error_description || error?.error || 'Google sign-in was cancelled'))
            }
        })
        client.requestAccessToken({ prompt })
    })
}

/**
 * Run the Authorization Code + PKCE flow in a popup and resolve with tokens.
 *
 * The popup lands on `public/oauth-callback.html`, which posts the code back to
 * this window. We then exchange it here, where the verifier lives.
 */
function requestTokenViaPkce(promptConsent: boolean): Promise<TokenResponse> {
    return new Promise((resolve, reject) => {
        const redirectUri = callbackUrlFor(window.location.origin, BASE_PATH)

        void beginPkce({ clientId: CLIENT_ID, scope: SCOPE, redirectUri, promptConsent })
            .then(({ url }) => {
                const popup = window.open(url, 'openquiz-oauth', 'width=520,height=680,noopener=no')
                if (!popup) {
                    reject(new Error('The sign-in window was blocked. Allow popups for this site and try again.'))
                    return
                }

                let settled = false
                const finish = (fn: () => void) => {
                    if (settled) return
                    settled = true
                    window.removeEventListener('message', onMessage)
                    window.clearInterval(closePoll)
                    try { popup.close() } catch { /* already closed */ }
                    fn()
                }
                const onMessage = (event: MessageEvent) => {
                    if (event.origin !== window.location.origin) return
                    const data = event.data as { source?: string, code?: string, state?: string, error?: string } | null
                    if (!data || data.source !== 'openquiz-oauth') return
                    if (data.error) { finish(() => reject(new Error(data.error as string))); return }
                    const { code, state } = data
                    if (!code || !state) { finish(() => reject(new Error('Google did not return an authorization code.'))); return }
                    // Reject a callback whose state we did not issue.
                    if (!isKnownState(state)) { finish(() => reject(new Error('Sign-in state did not match. Please try again.'))); return }
                    const verifier = consumePkceVerifier(state)
                    if (!verifier) { finish(() => reject(new Error('Sign-in expired before it completed. Please try again.'))); return }
                    void exchangeCodeForTokens({ clientId: CLIENT_ID, code, verifier, redirectUri })
                        .then(tokens => finish(() => resolve(tokens)))
                        .catch(err => finish(() => reject(err)))
                }
                window.addEventListener('message', onMessage)
                // If the user closes the popup without completing, stop waiting.
                const closePoll = window.setInterval(() => {
                    if (popup.closed) finish(() => reject(new Error('Sign-in was cancelled.')))
                }, 500)
            })
            .catch(reject)
    })
}

function applyTokens(tokens: TokenResponse, idTokenFallback: string | null = null): TokenGrant {
    const expiresIn = Number(tokens.expires_in)
    return {
        accessToken: tokens.access_token,
        idToken: tokens.id_token || idTokenFallback || null,
        expiresAt: Number.isFinite(expiresIn) && expiresIn > 0
            ? Date.now() + expiresIn * 1000
            : Date.now() + 45 * 60 * 1000
    }
}

/**
 * Mint a fresh access token from the stored refresh token, with no user
 * interaction and no dependency on Google's browser session. This is what makes
 * sign-in persist beyond the ~1 hour access-token lifetime.
 */
async function renewFromRefreshToken(accountId: string): Promise<TokenGrant | null> {
    const refreshToken = readRefreshToken(accountId)
    if (!refreshToken) return null
    try {
        const tokens = await refreshWithRefreshToken({ clientId: CLIENT_ID, refreshToken })
        // Google rotates the refresh token on some responses; persist if it does.
        if (tokens.refresh_token) saveRefreshToken(tokens.refresh_token, accountId)
        return applyTokens(tokens, lastIdToken)
    } catch (err) {
        if (err instanceof TokenError && err.status === 400) {
            // invalid_grant: revoked, expired, or the account changed. Drop the
            // credential so the next attempt falls back to interactive sign-in.
            clearRefreshToken()
        }
        return null
    }
}

/**
 * Decode the `id_token` Google returns alongside the access token. It contains
 * sub/email/name/picture, so we never need the (scope-gated) userinfo endpoint.
 */
function profileFromIdToken(idToken: string): DriveUser | null {
    try {
        const [, payload] = idToken.split('.')
        const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
        return toDriveUser(json)
    } catch {
        return null
    }
}

function toDriveUser(info: { sub?: string; email?: string; name?: string; picture?: string }): DriveUser {
    const joinedKey = `oquiz:joined_${info.sub}`
    let joined = ''
    try {
        joined = window.localStorage.getItem(joinedKey) || ''
        if (!joined) {
            joined = new Date().toISOString()
            window.localStorage.setItem(joinedKey, joined)
        }
    } catch {
        joined = new Date().toISOString()
    }

    return {
        id: info.sub || 'google-user',
        email: info.email || '',
        name: info.name || info.email?.split('@')[0] || 'User',
        picture: info.picture || '',
        created_at: joined
    }
}

async function fetchProfile(token: string, idToken = lastIdToken): Promise<DriveUser> {
    if (idToken) {
        const fromIdToken = profileFromIdToken(idToken)
        if (fromIdToken) return fromIdToken
    }

    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('Failed to fetch Google profile')
    const info = await res.json()
    return toDriveUser(info)
}

// ---------------------------------------------------------------------------
// Public auth API (used by AuthContext)
// ---------------------------------------------------------------------------

// Single-flight: every caller shares ONE in-flight (or next) token request.
// Without this, concurrent Drive reads (auth boot + quiz loading + cloud
// sync firing at once) each trigger their own Google OAuth request, which is
// why the app could pop the Google prompt several times on login.
let tokenRequest: Promise<string | null> | null = null

// A silent (prompt:'') restore attempt that returns no token means Google has
// no usable cached consent — retrying it in the same session just fires
// another account-chooser popup. We allow exactly one silent restore per
// (re)load; afterwards getDriveToken() falls back to null so a reload never
// spams the login prompt. signInToDrive() (user-clicked) always resets this.
let silentRestoreAttempts = 0
let lastSilentRestoreAt = 0
const SILENT_RESTORE_MAX_ATTEMPTS = 3
const SILENT_RESTORE_COOLDOWN_MS = 30_000

function tokenMatchesCurrentUser(grant: TokenGrant): boolean {
    if (!currentUser || !grant.idToken) return true
    const profile = profileFromIdToken(grant.idToken)
    return !profile || profile.id === currentUser.id
}

async function requestTokenNow(context: AuthContext): Promise<string | null> {
    if (!isDriveConfigured() || typeof window === 'undefined') return Promise.resolve(null)
    assertAuthContextCurrent(context)
    if (currentToken && tokenExpiresAt > Date.now() + 30_000) return currentToken

    try {
        const ok = await withTimeout(initGapi(), 6000, false)
        if (!ok) throw new DriveError('Could not initialize Google Drive client')
        assertAuthContextCurrent(context)

        // Prefer the stored refresh token: no popup, no account chooser, and
        // independent of whether Google's browser session is still alive.
        const stored = getStoredDriveUser()
        if (stored) {
            const renewed = await renewFromRefreshToken(stored.id)
            assertAuthContextCurrent(context)
            if (renewed) {
                currentToken = renewed.accessToken
                tokenExpiresAt = renewed.expiresAt
                lastIdToken = renewed.idToken
                window.gapi.client.setToken({ access_token: currentToken })
                return currentToken
            }
        }

        // No usable refresh token. Fall back to a silent token request, which
        // can still succeed if Google's session cookie is alive.
        const grant = await withTimeoutOrThrow(requestToken(''), 8000, 'Google token request')
        assertAuthContextCurrent(context)
        if (!tokenMatchesCurrentUser(grant)) {
            throw new DriveError('Google account changed while refreshing the Drive token')
        }
        currentToken = grant.accessToken
        tokenExpiresAt = grant.expiresAt
        lastIdToken = grant.idToken
        window.gapi.client.setToken({ access_token: currentToken })
        return currentToken
    } catch (err) {
        if (isAuthContextCurrent(context)) invalidateToken()
        console.error('Drive token restore failed:', err)
        return null
    }
}

export function getDriveToken(): Promise<string | null> {
    if (!isDriveConfigured() || typeof window === 'undefined') return Promise.resolve(null)
    const context = captureAuthContext()
    if (currentToken && tokenExpiresAt > Date.now() + 30_000) return Promise.resolve(currentToken)
    if (currentToken) invalidateToken()

    // Share an existing restore/refresh before applying the one-restore rule.
    if (tokenRequest) return tokenRequest

    // Bound how often we retry a silent restore, and space the attempts out.
    // The previous permanent latch meant one transient failure (a network blip,
    // a Google hiccup) killed Drive for the rest of the page load, which reads
    // to the user as being signed out. Cooldown + attempt cap keeps the original
    // concern in check - a silent request can surface an account chooser, so it
    // must not be retried in a tight loop - while still recovering from a
    // transient failure without a reload.
    if (silentRestoreAttempts >= SILENT_RESTORE_MAX_ATTEMPTS) return Promise.resolve(null)
    const sinceLast = Date.now() - lastSilentRestoreAt
    if (silentRestoreAttempts > 0 && sinceLast < SILENT_RESTORE_COOLDOWN_MS) return Promise.resolve(null)

    silentRestoreAttempts += 1
    lastSilentRestoreAt = Date.now()

    if (!tokenRequest) {
        const flight = requestTokenNow(context).finally(() => {
            if (tokenRequest === flight) tokenRequest = null
        })
        tokenRequest = flight
    }
    return tokenRequest
}

async function getDriveTokenForContext(context: AuthContext): Promise<string> {
    assertAuthContextCurrent(context)
    if (currentToken && tokenExpiresAt > Date.now() + 30_000) return currentToken
    const token = currentToken ? await refreshDriveToken(context) : await getDriveToken()
    assertAuthContextCurrent(context)
    if (!token) throw new DriveError('No usable Google Drive token')
    return token
}

async function refreshDriveToken(context: AuthContext): Promise<string> {
    assertAuthContextCurrent(context)
    invalidateToken()
    lastSilentRestoreAt = Date.now()
    if (!tokenRequest) {
        const flight = requestTokenNow(context).finally(() => {
            if (tokenRequest === flight) tokenRequest = null
        })
        tokenRequest = flight
    }
    const token = await tokenRequest
    assertAuthContextCurrent(context)
    if (!token) throw new DriveError('Google Drive token refresh failed')
    return token
}

export async function signInToDrive(): Promise<DriveUser> {
    if (!isDriveConfigured()) throw new Error('Google sign-in is not configured on this build.')
    if (typeof window === 'undefined') throw new Error('Not in browser')

    // A user-initiated sign-in starts a new account generation. Any silent
    // restore or queued operation from the prior session becomes stale.
    beginAuthTransition()
    silentRestoreAttempts = 0
    lastSilentRestoreAt = 0

    const context = captureAuthContext()
    const ok = await withTimeout(initGapi(), 10000, false)
    if (!ok) throw new Error('Could not initialize Google Drive client')
    assertAuthContextCurrent(context)

    // Authorization Code + PKCE, with prompt=consent so Google issues a refresh
    // token. Prompting for consent each time is deliberate: without it, a user
    // who has already granted access gets back no refresh token, and persistence
    // silently reverts to the ~1 hour implicit-flow behaviour.
    const tokens = await withTimeoutOrThrow(requestTokenViaPkce(true), 120000, 'Google sign-in')
    assertAuthContextCurrent(context)
    const grant = applyTokens(tokens)
    currentToken = grant.accessToken
    tokenExpiresAt = grant.expiresAt
    lastIdToken = grant.idToken
    window.gapi.client.setToken({ access_token: grant.accessToken })
    currentUser = await fetchProfile(grant.accessToken, grant.idToken)
    assertAuthContextCurrent(context)
    // Persist the long-lived credential so future loads renew silently.
    if (tokens.refresh_token) saveRefreshToken(tokens.refresh_token, currentUser.id)
    rememberDriveUser(currentUser)
    return currentUser
}

export async function restoreDriveSession(): Promise<DriveUser | null> {
    if (!isDriveConfigured() || typeof window === 'undefined') return null
    const context = captureAuthContext()
    const token = await getDriveToken()
    if (!token) return null
    try {
        const profile = await withTimeoutOrThrow(fetchProfile(token), 8000, 'Google profile request')
        assertAuthContextCurrent(context)
        if (context.userId && profile.id !== context.userId) {
            invalidateToken()
            throw new DriveError('Google account changed while restoring the Drive session')
        }
        currentUser = profile
        rememberDriveUser(profile)
        return profile
    } catch {
        return null
    }
}

export async function signOutFromDrive(): Promise<void> {
    if (typeof window === 'undefined') return
    const tokenToRevoke = currentToken
    const refreshToRevoke = readRefreshToken(getStoredDriveUser()?.id)
    beginAuthTransition()
    silentRestoreAttempts = 0
    lastSilentRestoreAt = 0
    // Drop the refresh token first: if the revoke round-trip below hangs or the
    // tab closes, we must not leave a working long-lived credential behind.
    clearRefreshToken()
    try {
        // Revoke the refresh token too, otherwise the grant survives sign-out and
        // stays usable until it expires or is revoked from the Google account.
        if (refreshToRevoke) {
            await Promise.race([
                fetch('https://oauth2.googleapis.com/revoke', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ token: refreshToRevoke }).toString()
                }).catch(() => undefined),
                new Promise<void>(resolve => setTimeout(resolve, 3000))
            ])
        }
        if (tokenToRevoke && window.google?.accounts?.oauth2?.revoke) {
            // The revoke callback only fires after a network round-trip — if
            // we're offline it never resolves and Sign Out would freeze. Bound
            // it with a timeout and continue either way.
            await Promise.race([
                new Promise<void>((resolve) => window.google.accounts.oauth2.revoke(tokenToRevoke, () => resolve())),
                new Promise<void>((resolve) => setTimeout(resolve, 3000))
            ])
        }
    } catch {
        // token may already be invalid — ignore
    }
    clearStoredDriveUser()
}

export function getDriveUser(): DriveUser | null {
    return currentUser
}

/**
 * Whether a usable Google access token is currently held in memory. Used by
 * the data layer to decide if cloud (Drive) reads/writes are actually live —
 * a stored profile alone is not enough if the silent token restore failed.
 */
export function hasLiveToken(): boolean {
    return Boolean(currentToken && tokenExpiresAt > Date.now() + 30_000)
}

// ---------------------------------------------------------------------------
// Session persistence
//
// The access token itself is short-lived, but the fact that a user has signed
// in (their profile) is persisted so a page reload rehydrates the session
// instead of bouncing the user back to the login screen. A newer access token
// is fetched silently on demand by getDriveToken().
// ---------------------------------------------------------------------------

const STORED_USER_KEY = 'oquiz:drive_user'

export function rememberDriveUser(user: DriveUser) {
    if (user && currentUser?.id && currentUser.id !== user.id) {
        authGeneration += 1
        invalidateToken()
        tokenRequest = null
    }
    if (user) currentUser = user
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(STORED_USER_KEY, JSON.stringify(user)) } catch { }
}

export function getStoredDriveUser(): DriveUser | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = window.localStorage.getItem(STORED_USER_KEY)
        if (!raw) return null
        const user = JSON.parse(raw) as DriveUser
        if (user) currentUser = user
        return user
    } catch {
        return null
    }
}

export function clearStoredDriveUser() {
    if (typeof window === 'undefined') return
    try { window.localStorage.removeItem(STORED_USER_KEY) } catch { }
}

// ---------------------------------------------------------------------------
// Drive file storage (used by db.ts)
// ---------------------------------------------------------------------------

function localGet(key: string): string | null {
    if (typeof window === 'undefined') return null
    try { return window.localStorage.getItem(key) } catch { return null }
}

function localSet(key: string, value: string) {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(key, value) } catch { }
}

function errorStatus(err: any): number | undefined {
    const status = err?.status ?? err?.result?.error?.code ?? err?.error?.code
    if (status === undefined && err?.cause) return errorStatus(err.cause)
    return typeof status === 'number' ? status : Number.isFinite(Number(status)) ? Number(status) : undefined
}

function isAuthFailure(err: any): boolean {
    return errorStatus(err) === 401
}

function isNotFound(err: any): boolean {
    return errorStatus(err) === 404
}

function responseStatus(response: any): number | undefined {
    return errorStatus(response)
}

async function driveRequest<T>(context: AuthContext, operation: () => Promise<T>): Promise<T> {
    await getDriveTokenForContext(context)
    try {
        assertAuthContextCurrent(context)
        const response = await withTimeoutOrThrow(operation(), 8000, 'Google Drive request')
        if (responseStatus(response) && responseStatus(response)! >= 400) {
            throw response
        }
        return response
    } catch (err) {
        if (!isAuthFailure(err)) throw err
        assertAuthContextCurrent(context)
        await refreshDriveToken(context)
        assertAuthContextCurrent(context)
        const response = await withTimeoutOrThrow(operation(), 8000, 'Google Drive retry')
        if (responseStatus(response) && responseStatus(response)! >= 400) throw response
        return response
    }
}

async function ensureFolder(context: AuthContext): Promise<string> {
    await getDriveTokenForContext(context)
    assertAuthContextCurrent(context)

    const folderKey = `oquiz:drive_folder_${currentUser?.id || context.userId || ''}`

    const cached = localGet(folderKey)
    if (cached) return cached

    // Find the app folder this app already created (drive.file scope only
    // exposes files the app created), otherwise create it. A failed list is an
    // error: treating it as an empty list would create a second folder.
    const found = await driveRequest(context, () => window.gapi.client.drive.files.list({
        q: `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1
    })) as { result?: { files?: { id?: string }[] } }
    const files = found?.result?.files
    if (!Array.isArray(files)) throw new DriveError('Google Drive folder lookup returned an invalid response')
    const existing = files[0]
    if (existing?.id) {
        assertAuthContextCurrent(context)
        localSet(folderKey, existing.id)
        return existing.id
    }

    const created = await driveRequest(context, () => window.gapi.client.drive.files.create({
            resource: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
            fields: 'id'
        })) as { result?: { id?: string | null } }
    if (!created?.result?.id) throw new DriveError('Google Drive folder creation returned no id')
    assertAuthContextCurrent(context)
    localSet(folderKey, created.result.id)
    return created.result.id
}

async function findFileId(context: AuthContext, folderId: string, name: string): Promise<string | null> {
    const res = await driveRequest(context, () => window.gapi.client.drive.files.list({
            q: `'${folderId}' in parents and name = '${name}' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1
        })) as { result?: { files?: { id?: string }[] } }
    const files = res?.result?.files
    if (!Array.isArray(files)) throw new DriveError('Google Drive file lookup returned an invalid response')
    return files[0]?.id || null
}

// Serialize Drive writes so concurrent saves can't overwrite each other.
const writeQueues = new Map<string, Promise<boolean>>()

function queuedWrite(key: string, fn: () => Promise<boolean>): Promise<boolean> {
    const prev = writeQueues.get(key) || Promise.resolve(true)
    const next = prev.then(fn).catch(() => false)
    writeQueues.set(key, next)
    return next
}

export function readDriveFile<T>(fileName: string): Promise<T | null> {
    if (!isDriveConfigured()) return Promise.reject(new DriveError('Google Drive is not configured'))
    if (typeof window === 'undefined') return Promise.reject(new DriveError('Google Drive is only available in a browser'))
    const context = captureAuthContext()
    return (async () => {
        const folderId = await ensureFolder(context)
        const fileId = await findFileId(context, folderId, fileName)
        if (!fileId) return null

        try {
            const res = await driveRequest(context, () => window.gapi.client.request({
                path: `/drive/v3/files/${fileId}`,
                method: 'GET',
                params: { alt: 'media' }
            })) as any
            const text = typeof res?.body === 'string' ? res.body : JSON.stringify(res?.result ?? res)
            return JSON.parse(text) as T
        } catch (err) {
            if (isNotFound(err)) return null
            throw err
        }
    })()
}

export function writeDriveFile(fileName: string, data: unknown): Promise<boolean> {
    if (!isDriveConfigured() || typeof window === 'undefined') return Promise.resolve(false)
    const context = captureAuthContext()
    const key = `${context.generation}:${context.userId || ''}:${fileName}`

    return queuedWrite(key, async () => {
        if (!isAuthContextCurrent(context)) return false
        const folderId = await ensureFolder(context)

        const fileId = await findFileId(context, folderId, fileName)
        try {
            if (fileId) {
                await driveRequest(context, () => window.gapi.client.request({
                    path: `/upload/drive/v3/files/${fileId}`,
                    method: 'PATCH',
                    params: { uploadType: 'media' },
                    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                    body: JSON.stringify(data)
                }))
            } else {
                const created = await driveRequest(context, () => window.gapi.client.drive.files.create({
                    resource: {
                        name: fileName,
                        parents: [folderId],
                        mimeType: 'application/json'
                    },
                    fields: 'id'
                })) as { result?: { id?: string | null } }
                const newFileId = created?.result?.id
                if (!newFileId) return false
                await driveRequest(context, () => window.gapi.client.request({
                    path: `/upload/drive/v3/files/${newFileId}`,
                    method: 'PATCH',
                    params: { uploadType: 'media' },
                    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                    body: JSON.stringify(data)
                }))
            }
            return true
        } catch (err) {
            console.error('Drive write failed:', err)
            return false
        }
    })
}

// A publication is a separate JSON file, never the private account database.
export interface DriveQuizFile { id: string; name?: string; resourceKey?: string; modifiedTime?: string }
const sharedQuizWrites = new Map<string, Promise<DriveQuizFile>>()
const SHARED_QUIZ_LIMIT = 5_000_000

export function validateDriveReference(fileId: string, resourceKey = '') {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(fileId) || (resourceKey && !/^[a-zA-Z0-9_-]{1,200}$/.test(resourceKey))) {
        throw new DriveError('Invalid Google Drive file link')
    }
}

export function driveQuizFileUrl(fileId: string, resourceKey = ''): string {
    validateDriveReference(fileId, resourceKey)
    return `https://drive.google.com/file/d/${fileId}/view${resourceKey ? `?resourcekey=${resourceKey}` : ''}`
}

export function publishDriveQuiz(quizId: string, name: string, content: string): Promise<DriveQuizFile> {
    validateDriveReference(quizId)
    if (!currentUser || !isDriveConfigured()) return Promise.reject(new DriveError('Sign in with Google to share through Drive.'))
    if (new TextEncoder().encode(content).length > SHARED_QUIZ_LIMIT) return Promise.reject(new DriveError('Quiz exceeds the 5 MB sharing limit.'))
    const context = captureAuthContext()
    const key = `${context.generation}:${context.userId}:${quizId}`
    const task = (sharedQuizWrites.get(key) || Promise.resolve()).catch(() => undefined).then(async () => {
        assertAuthContextCurrent(context)
        const found: any = await driveRequest(context, () => window.gapi.client.drive.files.list({
            q: `'me' in owners and trashed = false and appProperties has { key='openquizPublication' and value='${quizId}' }`,
            fields: 'files(id)', pageSize: 2
        }))
        assertAuthContextCurrent(context)
        if (!Array.isArray(found?.result?.files)) throw new DriveError('Invalid Drive publication lookup')
        if (found.result.files.length > 1) throw new DriveError('Multiple Drive publications found. Remove the duplicate in Drive before updating.')
        let fileId = found.result.files[0]?.id
        if (!fileId) {
            // No parent: do not inherit permissions from the private sync folder.
            const created: any = await driveRequest(context, () => window.gapi.client.drive.files.create({
                resource: { name: `${name}.openquiz.json`, mimeType: 'application/json', appProperties: { openquizPublication: quizId } },
                fields: 'id'
            }))
            assertAuthContextCurrent(context)
            fileId = created?.result?.id
            if (!fileId) throw new DriveError('Drive did not return a publication file ID')
        }
        validateDriveReference(fileId)
        await driveRequest(context, () => window.gapi.client.request({
            path: `/upload/drive/v3/files/${fileId}`, method: 'PATCH', params: { uploadType: 'media' },
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: content
        }))
        assertAuthContextCurrent(context)
        const updated: any = await driveRequest(context, () => window.gapi.client.request({
            path: `/drive/v3/files/${fileId}`, method: 'PATCH',
            params: { fields: 'id,name,resourceKey,modifiedTime' }, body: { name: `${name}.openquiz.json` }
        }))
        assertAuthContextCurrent(context)
        return { ...updated.result, id: fileId } as DriveQuizFile
    })
    sharedQuizWrites.set(key, task)
    void task.finally(() => { if (sharedQuizWrites.get(key) === task) sharedQuizWrites.delete(key) }).catch(() => {})
    return task
}

/** Always recheck Drive access. Do not fall back to a cached copy after revocation. */
export async function readSharedDriveQuiz(fileId: string, resourceKey = ''): Promise<{ content: string; file: DriveQuizFile }> {
    validateDriveReference(fileId, resourceKey)
    if (!currentUser) throw new DriveError('Sign in with Google to open this Drive quiz. You may need access from its owner.')
    const context = captureAuthContext()
    const headers = resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${fileId}/${resourceKey}` } : {}
    try {
        const metadata: any = await driveRequest(context, () => window.gapi.client.request({
            path: `/drive/v3/files/${fileId}`, method: 'GET', headers,
            params: { fields: 'id,name,mimeType,size,trashed,resourceKey,modifiedTime', supportsAllDrives: true }
        }))
        assertAuthContextCurrent(context)
        const file = metadata.result
        if (!file || file.trashed || file.mimeType !== 'application/json') throw new DriveError('This Drive file is not an OpenQuiz JSON publication.')
        if (!Number.isFinite(Number(file.size)) || Number(file.size) > SHARED_QUIZ_LIMIT) throw new DriveError('This Drive quiz exceeds the 5 MB sharing limit.')
        const response: any = await driveRequest(context, () => window.gapi.client.request({
            path: `/drive/v3/files/${fileId}`, method: 'GET', headers,
            params: { alt: 'media', supportsAllDrives: true }
        }))
        assertAuthContextCurrent(context)
        const content = typeof response.body === 'string' ? response.body : JSON.stringify(response.result)
        if (typeof content !== 'string' || new TextEncoder().encode(content).length > SHARED_QUIZ_LIMIT) throw new DriveError('Invalid or oversized Drive quiz.')
        return { content, file }
    } catch (err) {
        if ([403, 404].includes(errorStatus(err) || 0)) throw new DriveError('Drive access is unavailable. Ask the owner for access, then choose this file in Google Picker to allow OpenQuiz to read it.', err)
        throw err
    }
}

/** Picker grants per-file app access while retaining the existing drive.file scope. */
export async function pickSharedDriveQuiz(expectedFileId?: string): Promise<{ id: string; resourceKey?: string } | null> {
    if (expectedFileId) validateDriveReference(expectedFileId)
    if (!currentUser) throw new DriveError('Sign in with Google first.')
    const context = captureAuthContext()
    const token = await getDriveTokenForContext(context)
    const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID || CLIENT_ID.split('-')[0]
    if (!/^\d+$/.test(appId)) throw new DriveError('Google Picker needs the Google Cloud project number (NEXT_PUBLIC_GOOGLE_APP_ID).')
    await withTimeoutOrThrow(new Promise<void>((resolve, reject) => window.gapi.load('picker', {
        callback: resolve, onerror: () => reject(new DriveError('Enable Google Picker API in the Google Cloud project.'))
    })), 8000, 'Google Picker loading')
    assertAuthContextCurrent(context)
    return new Promise((resolve, reject) => {
        const api = window.google.picker
        const view = new api.DocsView().setMimeTypes('application/json')
        if (expectedFileId) view.setFileIds(expectedFileId)
        const picker = new api.PickerBuilder().setDeveloperKey(API_KEY).setAppId(appId)
            .setOAuthToken(token).setOrigin(window.location.origin).addView(view)
            .setCallback((result: any) => {
                if (result.action !== api.Action.PICKED && result.action !== api.Action.CANCEL) return
                picker.setVisible(false)
                try {
                    assertAuthContextCurrent(context)
                    if (result.action === api.Action.CANCEL) { resolve(null); return }
                    const file = result.docs?.[0]
                    validateDriveReference(file?.id || '', file?.resourceKey || '')
                    if (expectedFileId && file.id !== expectedFileId) throw new DriveError('Choose the quiz file linked by its owner.')
                    resolve({ id: file.id, resourceKey: file.resourceKey })
                } catch (err) { reject(err) }
            }).build()
        picker.setVisible(true)
    })
}
