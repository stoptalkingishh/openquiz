import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const workerSource = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8')
const scope = 'https://example.test/openquiz/'

type WorkerEvent = {
  waitUntil: (promise: Promise<unknown>) => void
  respondWith?: (promise: Promise<Response>) => void
}

function requestKey(request: Request | { url: string } | string) {
  return typeof request === 'string' ? request : request.url
}

function createWorker(options: {
  fetch?: (request: Request | { url: string }) => Promise<Response>
  entries?: Record<string, Response>
  keys?: string[]
} = {}) {
  const listeners = new Map<string, (event: WorkerEvent & { request?: unknown }) => void>()
  const entries = new Map(Object.entries(options.entries || {}))
  const deleted: string[] = []
  const cache = {
    add: vi.fn(async (url: string) => {
      entries.set(url, new Response(`precached:${url}`, { status: 200 }))
    }),
    match: vi.fn(async (request: Request | { url: string } | string) => entries.get(requestKey(request))),
    put: vi.fn(async (request: Request | { url: string }, response: Response) => {
      entries.set(requestKey(request), response)
    }),
  }
  const cachesApi = {
    delete: vi.fn(async (key: string) => {
      deleted.push(key)
      return true
    }),
    keys: vi.fn(async () => options.keys || ['openquiz-_openquiz_-old', 'unrelated-cache']),
    open: vi.fn(async () => cache),
  }
  const fetchMock = options.fetch || vi.fn(async () => new Response('network', { status: 200 }))
  const waits: Promise<unknown>[] = []
  let responsePromise: Promise<Response> | undefined
  const workerSelf = {
    addEventListener: (name: string, listener: (event: WorkerEvent & { request?: unknown }) => void) =>
      listeners.set(name, listener),
    clients: { claim: vi.fn(async () => undefined) },
    location: { href: `${scope}sw.js?v=build-123` },
    registration: { scope },
    skipWaiting: vi.fn(async () => undefined),
  }

  vm.runInNewContext(workerSource, {
    Request,
    Response,
    URL,
    caches: cachesApi,
    console,
    fetch: fetchMock,
    self: workerSelf,
  })

  return {
    cache,
    cachesApi,
    deleted,
    dispatch(name: string, request?: unknown) {
      const event: WorkerEvent & { request?: unknown } = {
        request,
        waitUntil: (promise) => waits.push(promise),
      }
      if (name === 'fetch') {
        event.respondWith = (promise) => {
          responsePromise = promise
        }
      }
      listeners.get(name)?.(event)
      return {
        response: async () => responsePromise,
        settled: async () => Promise.all(waits.splice(0)),
      }
    },
    fetchMock,
  }
}

describe('service worker', () => {
  it('removes only old OpenQuiz caches during activation', async () => {
    const worker = createWorker({
      keys: ['openquiz-_openquiz_-old', 'openquiz-_other_-old', 'openquiz-v1', 'unrelated-cache'],
    })

    const activation = worker.dispatch('activate')
    await activation.settled()

    expect(worker.cachesApi.delete).toHaveBeenCalledWith('openquiz-_openquiz_-old')
    expect(worker.cachesApi.delete).toHaveBeenCalledWith('openquiz-v1')
    expect(worker.cachesApi.delete).not.toHaveBeenCalledWith('openquiz-_other_-old')
    expect(worker.cachesApi.delete).not.toHaveBeenCalledWith('unrelated-cache')
  })

  it('precaches shell assets referenced by exported HTML', async () => {
    const shellAsset = `${scope}_next/static/chunks/app-12345678.js`
    const worker = createWorker({
      fetch: vi.fn(async (request) => {
        const url = typeof request === 'string' ? request : request.url
        if (url === scope) {
          return new Response(`<script src="${shellAsset}"></script>`, {
            headers: { 'Content-Type': 'text/html' },
            status: 200,
          })
        }
        return new Response('asset', { status: 200 })
      }),
    })

    const installation = worker.dispatch('install')
    await installation.settled()

    expect(worker.fetchMock).toHaveBeenCalledWith(shellAsset)
    expect(worker.cache.put).toHaveBeenCalled()
  })

  it('prefers the network for navigation and refreshes its cached response', async () => {
    const networkResponse = new Response('<html>new</html>', { status: 200 })
    const worker = createWorker({ fetch: vi.fn(async () => networkResponse) })
    const navigation = worker.dispatch('fetch', {
      destination: 'document',
      method: 'GET',
      mode: 'navigate',
      url: `${scope}library/`,
    })

    await expect(navigation.response()).resolves.toBe(networkResponse)
    expect(worker.fetchMock).toHaveBeenCalledOnce()
    expect(worker.cache.put).toHaveBeenCalled()
  })

  it('serves the cached shell when navigation is offline', async () => {
    const worker = createWorker({
      entries: { [scope]: new Response('<html>offline shell</html>', { status: 200 }) },
      fetch: vi.fn(async () => Promise.reject(new Error('offline'))),
    })
    const navigation = worker.dispatch('fetch', {
      destination: 'document',
      method: 'GET',
      mode: 'navigate',
      url: `${scope}session/learn/`,
    })

    await expect((await navigation.response())?.text()).resolves.toContain('offline shell')
  })

  it('uses cache first for immutable assets', async () => {
    const assetUrl = `${scope}_next/static/chunks/app.js`
    const worker = createWorker({
      entries: { [assetUrl]: new Response('cached asset', { status: 200 }) },
      fetch: vi.fn(async () => new Response('network asset', { status: 200 })),
    })
    const asset = worker.dispatch('fetch', {
      destination: 'script',
      method: 'GET',
      mode: 'same-origin',
      url: assetUrl,
    })

    await expect((await asset.response())?.text()).resolves.toContain('cached asset')
    expect(worker.fetchMock).not.toHaveBeenCalled()
  })

  it('uses network first for mutable public data', async () => {
    const dataUrl = `${scope}sat/quiz-sets.json`
    const worker = createWorker({
      entries: { [dataUrl]: new Response('{"version":"old"}', { status: 200 }) },
      fetch: vi.fn(async () => new Response('{"version":"new"}', { status: 200 })),
    })
    const data = worker.dispatch('fetch', {
      destination: '',
      method: 'GET',
      mode: 'same-origin',
      url: dataUrl,
    })

    await expect((await data.response())?.text()).resolves.toContain('new')
    expect(worker.fetchMock).toHaveBeenCalledOnce()
  })

  it('returns a successful response when cache storage fails', async () => {
    const worker = createWorker({ fetch: vi.fn(async () => new Response('still online', { status: 200 })) })
    worker.cache.put.mockRejectedValueOnce(new Error('quota exceeded'))
    const navigation = worker.dispatch('fetch', {
      destination: 'document',
      method: 'GET',
      mode: 'navigate',
      url: `${scope}library/`,
    })

    await expect((await navigation.response())?.text()).resolves.toContain('still online')
  })

  it('does not intercept external or sensitive requests', () => {
    const worker = createWorker()

    worker.dispatch('fetch', {
      destination: 'document',
      method: 'GET',
      mode: 'navigate',
      url: 'https://accounts.example.test/oauth/start',
    })
    worker.dispatch('fetch', {
      destination: '',
      method: 'GET',
      mode: 'same-origin',
      url: `${scope}api/session`,
    })

    expect(worker.cachesApi.open).not.toHaveBeenCalled()
  })
})
