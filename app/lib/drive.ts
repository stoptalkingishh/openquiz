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

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
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

function initGapi(): Promise<boolean> {
    if (!initialized) {
        initialized = true
        driveReady = (async () => {
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
                initialized = false
                driveReady = null
                console.error('Drive init failed:', err)
                return false
            }
        })()
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

async function fetchProfile(token: string): Promise<DriveUser> {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('Failed to fetch Google profile')
    const info = await res.json()

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
        id: info.sub,
        email: info.email || '',
        name: info.name || info.email?.split('@')[0] || 'User',
        picture: info.picture || '',
        created_at: joined
    }
}

// ---------------------------------------------------------------------------
// Public auth API (used by AuthContext)
// ---------------------------------------------------------------------------

export async function getDriveToken(): Promise<string | null> {
    if (!isDriveConfigured() || typeof window === 'undefined') return null
    if (currentToken) return currentToken

    const ok = await initGapi()
    if (!ok) return null

    try {
        // If the user already has a Google session, grab a token without a popup.
        currentToken = await requestToken('')
        window.gapi.client.setToken({ access_token: currentToken })
        return currentToken
    } catch {
        currentToken = null
        return null
    }
}

export async function signInToDrive(): Promise<DriveUser> {
    if (!isDriveConfigured()) throw new Error('Google sign-in is not configured on this build.')
    if (typeof window === 'undefined') throw new Error('Not in browser')

    const ok = await initGapi()
    if (!ok) throw new Error('Could not initialize Google Drive client')

    const token = await requestToken('consent')
    currentToken = token
    window.gapi.client.setToken({ access_token: token })
    currentUser = await fetchProfile(token)
    return currentUser
}

export async function restoreDriveSession(): Promise<DriveUser | null> {
    if (!isDriveConfigured() || typeof window === 'undefined') return null
    const token = await getDriveToken()
    if (!token) return null
    try {
        currentUser = await fetchProfile(token)
        return currentUser
    } catch {
        return null
    }
}

export async function signOutFromDrive(): Promise<void> {
    if (typeof window === 'undefined') return
    try {
        if (currentToken && window.google?.accounts?.oauth2?.revoke) {
            await new Promise<void>((resolve) => window.google.accounts.oauth2.revoke(currentToken, () => resolve()))
        }
    } catch {
        // token may already be invalid — ignore
    }
    currentToken = null
    currentUser = null
}

export function getDriveUser(): DriveUser | null {
    return currentUser
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
        const found = await window.gapi.client.drive.files.list({
            q: `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1
        })
        const existing = found?.result?.files?.[0]
        if (existing?.id) {
            localSet(folderKey, existing.id)
            return existing.id
        }

        const created = await window.gapi.client.drive.files.create({
            resource: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
            fields: 'id'
        })
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
        const res = await window.gapi.client.drive.files.list({
            q: `'${folderId}' in parents and name = '${name}' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1
        })
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
            const res = await window.gapi.client.request({
                path: `/drive/v3/files/${fileId}`,
                method: 'GET',
                params: { alt: 'media' }
            })
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
                await window.gapi.client.request({
                    path: `/upload/drive/v3/files/${fileId}`,
                    method: 'PATCH',
                    params: { uploadType: 'media' },
                    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                    body: JSON.stringify(data)
                })
            } else {
                const created = await window.gapi.client.drive.files.create({
                    resource: {
                        name: fileName,
                        parents: [folderId],
                        mimeType: 'application/json'
                    },
                    fields: 'id'
                })
                const newFileId = created?.result?.id
                if (!newFileId) return false
                await window.gapi.client.request({
                    path: `/upload/drive/v3/files/${newFileId}`,
                    method: 'PATCH',
                    params: { uploadType: 'media' },
                    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                    body: JSON.stringify(data)
                })
            }
            return true
        } catch (err) {
            console.error('Drive write failed:', err)
            return false
        }
    })
}