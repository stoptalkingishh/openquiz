import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

type Deferred<T> = {
    promise: Promise<T>
    resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
}

function storageMock() {
    const values = new Map<string, string>()
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) },
        clear: () => values.clear()
    }
}

function installGoogleMocks(filesList: (args: any) => Promise<any>, request: (args: any) => Promise<any> = async () => ({ body: '{}' })) {
    const localStorage = storageMock()
    const gapi = {
        load: (_name: string, options: any) => queueMicrotask(options.callback),
        client: {
            init: async () => undefined,
            setToken: vi.fn(),
            drive: {
                files: {
                    list: filesList,
                    create: vi.fn(async () => ({ result: { id: 'created-file' } }))
                }
            },
            request
        }
    }
    const google = {
        accounts: {
            oauth2: {
                initTokenClient: (options: any) => ({
                    requestAccessToken: () => queueMicrotask(() => options.callback({
                        access_token: 'access-token',
                        expires_in: 3600
                    }))
                })
            }
        }
    }
    const document = {
        querySelector: () => null,
        createElement: () => {
            const script: any = {}
            return script
        },
        head: {
            appendChild: (script: any) => queueMicrotask(() => script.onload?.())
        }
    }
    Object.assign(globalThis, { window: { gapi, google, localStorage }, document })
    return { gapi, google, localStorage }
}

async function loadDrive() {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-client')
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_API_KEY', 'test-key')
    return import('../app/lib/drive')
}

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})

describe('Drive storage failure semantics', () => {
    it('does not create a file when the folder/file lookup fails', async () => {
        const create = vi.fn(async () => ({ result: { id: 'should-not-exist' } }))
        const { gapi } = installGoogleMocks(
            async () => Promise.reject({ status: 503 }),
        )
        gapi.client.drive.files.create = create
        const drive = await loadDrive()
        drive.rememberDriveUser({ id: 'user-a', email: 'a@example.com', name: 'A', picture: '', created_at: '' })

        await expect(drive.writeDriveFile('progress.json', { score: 1 })).resolves.toBe(false)
        expect(create).not.toHaveBeenCalled()
    })

    it('throws on a failed read instead of treating the file as missing', async () => {
        installGoogleMocks(async () => Promise.reject({ status: 503 }))
        const drive = await loadDrive()
        drive.rememberDriveUser({ id: 'user-a', email: 'a@example.com', name: 'A', picture: '', created_at: '' })

        await expect(drive.readDriveFile('progress.json')).rejects.toThrow()
    })

    it('returns false when an existing file PATCH fails', async () => {
        const request = vi.fn(async (args: any) => {
            if (args.method === 'PATCH') return Promise.reject({ status: 500 })
            return { body: '{}' }
        })
        installGoogleMocks(async (args: any) => {
            if (args.q.includes('mimeType')) return { result: { files: [{ id: 'folder-id' }] } }
            return { result: { files: [{ id: 'file-id' }] } }
        }, request)
        const drive = await loadDrive()
        drive.rememberDriveUser({ id: 'user-a', email: 'a@example.com', name: 'A', picture: '', created_at: '' })

        await expect(drive.writeDriveFile('progress.json', { score: 1 })).resolves.toBe(false)
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'PATCH' }))
    })

    it('drops a queued write when sign-out changes the auth generation', async () => {
        const folderLookup = deferred<any>()
        let listStarted!: () => void
        const started = new Promise<void>(resolve => { listStarted = resolve })
        const create = vi.fn(async () => ({ result: { id: 'should-not-exist' } }))
        const { gapi } = installGoogleMocks(async () => {
            listStarted()
            return folderLookup.promise
        })
        gapi.client.drive.files.create = create
        const drive = await loadDrive()
        drive.rememberDriveUser({ id: 'user-a', email: 'a@example.com', name: 'A', picture: '', created_at: '' })

        const write = drive.writeDriveFile('progress.json', { score: 1 })
        await started
        await drive.signOutFromDrive()
        folderLookup.resolve({ result: { files: [] } })

        await expect(write).resolves.toBe(false)
        expect(create).not.toHaveBeenCalled()
    })
})
