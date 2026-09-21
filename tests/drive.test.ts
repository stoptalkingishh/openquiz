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
    it('uses Google Picker for per-file authorization and rejects an unexpected selection', async () => {
        const { google } = installGoogleMocks(async () => ({ result: { files: [] } }))
        const drive = await loadDrive()
        vi.stubEnv('NEXT_PUBLIC_GOOGLE_APP_ID', '123456')
        Object.assign(window, { location: { origin: 'https://example.com' } })
        drive.rememberDriveUser({ id: 'reader', email: 'reader@example.com', name: 'Reader', picture: '', created_at: '' })
        let callback: (value: any) => void = () => {}
        let pickedId = 'expected'
        const view: any = { setMimeTypes: vi.fn(() => view), setFileIds: vi.fn(() => view) }
        const builder: any = {}
        for (const name of ['setDeveloperKey', 'setAppId', 'setOAuthToken', 'setOrigin', 'addView']) builder[name] = vi.fn(() => builder)
        builder.setCallback = (fn: any) => { callback = fn; return builder }
        builder.build = () => ({ setVisible: (visible: boolean) => { if (visible) queueMicrotask(() => callback({ action: 'picked', docs: [{ id: pickedId, resourceKey: 'resource' }] })) } })
        ;(google as any).picker = {
            DocsView: function () { return view }, PickerBuilder: function () { return builder }, Action: { PICKED: 'picked', CANCEL: 'cancel' }
        }
        expect(await drive.pickSharedDriveQuiz('expected')).toEqual({ id: 'expected', resourceKey: 'resource' })
        expect(view.setFileIds).toHaveBeenCalledWith('expected')
        expect(builder.setAppId).toHaveBeenCalledWith('123456')
        expect(builder.setOAuthToken).toHaveBeenCalledWith('access-token')
        pickedId = 'different'
        await expect(drive.pickSharedDriveQuiz('expected')).rejects.toThrow('Choose the quiz file')
    })

    it('creates a separate restricted publication and updates the same file without modifying permissions', async () => {
        let published = false
        const request = vi.fn(async (args: any) => ({ result: { id: 'publication', name: 'Quiz.openquiz.json' } }))
        const { gapi } = installGoogleMocks(async (args: any) => {
            expect(args.q).toContain("'me' in owners")
            expect(args.q).toContain('openquizPublication')
            return { result: { files: published ? [{ id: 'publication' }] : [] } }
        }, request)
        gapi.client.drive.files.create = vi.fn(async () => { published = true; return { result: { id: 'publication' } } })
        const drive = await loadDrive()
        drive.rememberDriveUser({ id: 'user-a', email: 'a@example.com', name: 'A', picture: '', created_at: '' })
        expect((await drive.publishDriveQuiz('quiz-1', 'Quiz', '{"questions":[]}')).id).toBe('publication')
        expect((await drive.publishDriveQuiz('quiz-1', 'Updated', '{"questions":[1]}')).id).toBe('publication')
        expect(gapi.client.drive.files.create).toHaveBeenCalledTimes(1)
        expect(gapi.client.drive.files.create).toHaveBeenCalledWith(expect.objectContaining({ resource: {
            name: 'Quiz.openquiz.json', mimeType: 'application/json', appProperties: { openquizPublication: 'quiz-1' }
        } }))
        expect(request.mock.calls.some(([arg]) => arg.path.includes('permissions'))).toBe(false)
        expect(request.mock.calls.filter(([arg]) => arg.path.includes('/upload/')).map(([arg]) => arg.body)).toEqual(['{"questions":[]}', '{"questions":[1]}'])
    })

    it('fetches the latest Drive version with resource-key headers and fails after access revocation', async () => {
        let version = 1
        let revoked = false
        const request = vi.fn(async (args: any) => {
            if (revoked) throw { status: 403 }
            return args.params.alt === 'media' ? { body: JSON.stringify({ version }) } : { result: { id: 'shared', mimeType: 'application/json', size: '20' } }
        })
        installGoogleMocks(async () => ({ result: { files: [] } }), request)
        const drive = await loadDrive()
        drive.rememberDriveUser({ id: 'reader', email: 'reader@example.com', name: 'Reader', picture: '', created_at: '' })
        expect((await drive.readSharedDriveQuiz('shared', 'resource-key')).content).toBe('{"version":1}')
        version = 2
        expect((await drive.readSharedDriveQuiz('shared', 'resource-key')).content).toBe('{"version":2}')
        expect(request).toHaveBeenCalledWith(expect.objectContaining({ headers: { 'X-Goog-Drive-Resource-Keys': 'shared/resource-key' } }))
        revoked = true
        await expect(drive.readSharedDriveQuiz('shared')).rejects.toThrow('Drive access is unavailable')
    })

    it('rejects invalid references and oversized files before downloading content', async () => {
        const request = vi.fn(async () => ({ result: { id: 'large', mimeType: 'application/json', size: '5000001' } }))
        installGoogleMocks(async () => ({ result: { files: [] } }), request)
        const drive = await loadDrive()
        drive.rememberDriveUser({ id: 'reader', email: 'reader@example.com', name: 'Reader', picture: '', created_at: '' })
        await expect(drive.readSharedDriveQuiz('../private?alt=media')).rejects.toThrow('Invalid')
        expect(request).not.toHaveBeenCalled()
        await expect(drive.readSharedDriveQuiz('large')).rejects.toThrow('5 MB')
        expect(request).toHaveBeenCalledTimes(1)
    })

    it('rejects shared content arriving after an account change', async () => {
        const media = deferred<any>()
        let mediaStarted!: () => void
        const started = new Promise<void>(resolve => { mediaStarted = resolve })
        installGoogleMocks(async () => ({ result: { files: [] } }), async (args: any) => {
            if (args.params.alt === 'media') { mediaStarted(); return media.promise }
            return { result: { id: 'shared', mimeType: 'application/json', size: '20' } }
        })
        const drive = await loadDrive()
        drive.rememberDriveUser({ id: 'reader', email: 'reader@example.com', name: 'Reader', picture: '', created_at: '' })
        const loading = drive.readSharedDriveQuiz('shared')
        await started
        await drive.signOutFromDrive()
        media.resolve({ body: '{"secret":"reader content"}' })
        await expect(loading).rejects.toThrow('session changed')
    })

    it('requires a signed-in account without silently making restricted files public', async () => {
        const request = vi.fn(async () => ({ body: '{}' }))
        installGoogleMocks(async () => ({ result: { files: [] } }), request)
        const drive = await loadDrive()
        await expect(drive.readSharedDriveQuiz('shared')).rejects.toThrow('Sign in')
        await expect(drive.publishDriveQuiz('quiz', 'Quiz', '{}')).rejects.toThrow('Sign in')
        expect(request).not.toHaveBeenCalled()
    })

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
