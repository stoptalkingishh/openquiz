'use client'

/**
 * Google Drive data + auth layer for the static build.
 *
 * Uses Google Identity Services (OAuth token client) for sign-in and the
 * Drive API v3 to store app data as JSON files inside a per-user folder
 * named "OpenQuiz" in the signed-in user's own Google Drive.
 *
 * Scope is limited to drive.file (only files this app creates). When the
 * Google keys are not configured at build time, everything falls back to
 * localStorage in guest mode — data-layer callers don't need to change.
 */

declare global {
    interface Window {
        google?: any
        gapi?: any
    }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ''

const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.file'
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
let currentUser: DriveUser | null = null
let driveReady: Promise<boolean> | null = null
let lastIdToken: string | null = null

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

function requestToken(prompt: 'consent' | ''): Promise<string> {
    return new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPE,
            callback: (response: any) => {
                if (response?.access_token) {
                    lastIdToken = response.id_token || null
                    resolve(response.access_token)
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

async function fetchProfile(token: string): Promise<DriveUser> {
    if (lastIdToken) {
        const fromIdToken = profileFromIdToken(lastIdToken)
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
let silentRestoreDone = false

function requestTokenNow(): Promise<string | null> {
    if (!isDriveConfigured() || typeof window === 'undefined') return Promise.resolve(null)
    if (currentToken) return Promise.resolve(currentToken)

    return (async () => {
        const ok = await withTimeout(initGapi(), 6000, false)
        if (!ok) return null

        try {
            // If the user already has a Google session, grab a token without a popup.
            const token = await withTimeout(requestToken(''), 8000, null)
            if (!token) return null
            currentToken = token
            window.gapi.client.setToken({ access_token: currentToken })
            return currentToken
        } catch {
            currentToken = null
            return null
        }
    })()
}

export function getDriveToken(): Promise<string | null> {
    if (!isDriveConfigured() || typeof window === 'undefined') return Promise.resolve(null)
    if (currentToken) return Promise.resolve(currentToken)

    // Only one silent restore per page load. If it found nothing, don't keep
    // asking Google for a token — every such call can open an account chooser.
    if (silentRestoreDone) return Promise.resolve(null)

    silentRestoreDone = true

    if (!tokenRequest) {
        tokenRequest = requestTokenNow().finally(() => { tokenRequest = null })
    }
    return tokenRequest
}

export async function signInToDrive(): Promise<DriveUser> {
    if (!isDriveConfigured()) throw new Error('Google sign-in is not configured on this build.')
    if (typeof window === 'undefined') throw new Error('Not in browser')

    // A user-initiated sign-in always re-allows a fresh token, regardless of
    // how many silent restores already ran this session.
    silentRestoreDone = false

    const ok = await withTimeout(initGapi(), 10000, false)
    if (!ok) throw new Error('Could not initialize Google Drive client')

    const token = await withTimeout(requestToken('consent'), 30000, null)
    if (!token) throw new Error('Google sign-in was cancelled or timed out')
    currentToken = token
    window.gapi.client.setToken({ access_token: token })
    currentUser = await fetchProfile(token)
    rememberDriveUser(currentUser)
    return currentUser
}

export async function restoreDriveSession(): Promise<DriveUser | null> {
    if (!isDriveConfigured() || typeof window === 'undefined') return null
    const token = await getDriveToken()
    if (!token) return null
    try {
        currentUser = await withTimeout(fetchProfile(token), 8000, null)
        if (currentUser) rememberDriveUser(currentUser)
        return currentUser
    } catch {
        return null
    }
}

export async function signOutFromDrive(): Promise<void> {
    if (typeof window === 'undefined') return
    try {
        if (currentToken && window.google?.accounts?.oauth2?.revoke) {
            // The revoke callback only fires after a network round-trip — if
            // we're offline it never resolves and Sign Out would freeze. Bound
            // it with a timeout and continue either way.
            await Promise.race([
                new Promise<void>((resolve) => window.google.accounts.oauth2.revoke(currentToken, () => resolve())),
                new Promise<void>((resolve) => setTimeout(resolve, 3000))
            ])
        }
    } catch {
        // token may already be invalid — ignore
    }
    currentToken = null
    currentUser = null
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
    return Boolean(currentToken)
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

async function ensureFolder(): Promise<string | null> {
    const token = await getDriveToken()
    if (!token) return null

    const folderKey = `oquiz:drive_folder_${currentUser?.id || ''}`

    const cached = localGet(folderKey)
    if (cached) return cached

    try {
        // Find the app folder this app already created (drive.file scope only
        // exposes files the app created), otherwise create it.
        const found = await withTimeout<{ result?: { files?: { id?: string }[] } } | null>(window.gapi.client.drive.files.list({
            q: `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1
        }), 8000, null)
        if (!found) return null
        const existing = found?.result?.files?.[0]
        if (existing?.id) {
            localSet(folderKey, existing.id)
            return existing.id
        }

        const created = await withTimeout<{ result?: { id?: string | null } }>(window.gapi.client.drive.files.create({
            resource: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
            fields: 'id'
        }), 8000, { result: { id: null } })
        if (created?.result?.id) {
            localSet(folderKey, created.result.id)
            return created.result.id
        }
    } catch (err) {
        console.error('Drive ensureFolder failed:', err)
    }
    return null
}

async function findFileId(folderId: string, name: string): Promise<string | null> {
    try {
        const res = await withTimeout<{ result?: { files?: { id?: string }[] } }>(window.gapi.client.drive.files.list({
            q: `'${folderId}' in parents and name = '${name}' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1
        }), 8000, { result: { files: [] } })
        return res?.result?.files?.[0]?.id || null
    } catch {
        return null
    }
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
    if (!isDriveConfigured() || typeof window === 'undefined') return Promise.resolve(null)
    return (async () => {
        const token = await getDriveToken()
        if (!token) return null

        const folderId = await ensureFolder()
        if (!folderId) return null

        const fileId = await findFileId(folderId, fileName)
        if (!fileId) return null

        try {
            const res = await withTimeout<any>(window.gapi.client.request({
                path: `/drive/v3/files/${fileId}`,
                method: 'GET',
                params: { alt: 'media' }
            }), 8000, null)
            const text = typeof res?.body === 'string' ? res.body : JSON.stringify(res?.result ?? res)
            return JSON.parse(text) as T
        } catch (err) {
            console.error('Drive read failed:', err)
            return null
        }
    })()
}

export function writeDriveFile(fileName: string, data: unknown): Promise<boolean> {
    if (!isDriveConfigured() || typeof window === 'undefined') return Promise.resolve(false)
    const key = `${currentUser?.id || ''}:${fileName}`

    return queuedWrite(key, async () => {
        const token = await getDriveToken()
        if (!token) return false

        const folderId = await ensureFolder()
        if (!folderId) return false

        const fileId = await findFileId(folderId, fileName)
        try {
            if (fileId) {
                const updated = await withTimeout<any>(window.gapi.client.request({
                    path: `/upload/drive/v3/files/${fileId}`,
                    method: 'PATCH',
                    params: { uploadType: 'media' },
                    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                    body: JSON.stringify(data)
                }), 8000, null)
                if (updated === null) return false
            } else {
                const created = await withTimeout<{ result?: { id?: string | null } }>(window.gapi.client.drive.files.create({
                    resource: {
                        name: fileName,
                        parents: [folderId],
                        mimeType: 'application/json'
                    },
                    fields: 'id'
                }), 8000, { result: { id: null } })
                const newFileId = created?.result?.id
                if (!newFileId) return false
                const uploaded = await withTimeout<any>(window.gapi.client.request({
                    path: `/upload/drive/v3/files/${newFileId}`,
                    method: 'PATCH',
                    params: { uploadType: 'media' },
                    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                    body: JSON.stringify(data)
                }), 8000, null)
                if (uploaded === null) return false
            }
            return true
        } catch (err) {
            console.error('Drive write failed:', err)
            return false
        }
    })
}
