// The registration URL carries the build version. Including it in the cache
// name makes every static build independently updatable without touching
// unrelated caches that happen to belong to the same origin.
const requestedVersion = new URL(self.location.href).searchParams.get('v') || 'development'
const CACHE_VERSION = requestedVersion.replace(/[^a-zA-Z0-9._-]/g, '-')
const SCOPE_URL = new URL(self.registration.scope)
const scopeKey = SCOPE_URL.pathname.replace(/[^a-zA-Z0-9]+/g, '_') || 'root'
const CACHE_PREFIX = `openquiz-${scopeKey}-`
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`
const OFFLINE_URL = SCOPE_URL.toString()

// These are the static routes and public data shipped with the export. Other
// generated JavaScript, CSS, and image assets are added as the shell loads.
const PRECACHE_PATHS = [
  '',
  '404.html',
  'manifest.webmanifest',
  'auth/',
  'community/',
  'library/',
  'match/',
  'profile/',
  'quiz/share/',
  'quiz-detail/',
  'quizzes/',
  'session/drill/',
  'session/exam/',
  'session/learn/',
  'session/mistakes/',
  'session/test/',
  'session/write/',
  'sat/1.json',
  'sat/2.json',
  'sat/archaic.json',
  'sat/logo.png',
  'sat/quiz-sets.json',
  'securityplus/final.json',
  'securityplus/secplus-crypto.json',
  'securityplus/secplus-fundamentals.json',
  'securityplus/secplus-infra.json',
  'securityplus/secplus-physical.json',
  'securityplus/secplus-threats.json',
  'securityplus/test1.json',
  'securityplus/test2.json',
  'securityplus/test3.json',
  'netplus/netplus-final.json',
  'netplus/netplus-fundamentals.json',
  'netplus/netplus-implementation.json',
  'netplus/netplus-operations.json',
  'netplus/netplus-security.json',
  'netplus/netplus-test1.json',
  'netplus/netplus-test2.json',
  'netplus/netplus-test3.json',
  'netplus/netplus-troubleshooting.json',
]

const PRECACHE_URLS = PRECACHE_PATHS.map((path) => new URL(path, SCOPE_URL).toString())

function isInScope(url) {
  return url.origin === SCOPE_URL.origin && url.href.startsWith(SCOPE_URL.href)
}

function isSensitivePath(url) {
  return /(?:^|\/)(?:api|oauth|callback)(?:\/|$)/i.test(url.pathname)
}

function canCacheResponse(response) {
  if (!response || !response.ok) return false
  if (response.type && response.type !== 'basic' && response.type !== 'default') return false

  const cacheControl = response.headers && response.headers.get('cache-control')
  return !cacheControl || !/\b(?:no-store|private)\b/i.test(cacheControl)
}

function isImmutableAsset(url) {
  return (
    url.pathname.includes('/_next/static/') ||
    /(?:^|[-_.])[a-f0-9]{8,}\.(?:css|gif|ico|jpe?g|js|png|svg|webp|woff2?|ttf)$/i.test(url.pathname)
  )
}

async function cacheResponse(cache, request, response) {
  if (canCacheResponse(response)) {
    try {
      await cache.put(request, response.clone())
    } catch {
      // A cache quota or storage error must not turn a successful request
      // into an offline response.
    }
  }
  return response
}

async function networkFirst(request, cache, isNavigation = false) {
  try {
    return await cacheResponse(cache, request, await fetch(request))
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached

    if (isNavigation) {
      const offline = await cache.match(OFFLINE_URL)
      if (offline) return offline

      return new Response('OpenQuiz is unavailable offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    return new Response('', { status: 504, statusText: 'Offline' })
  }
}

async function cacheFirst(request, cache) {
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    return await cacheResponse(cache, request, await fetch(request))
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' })
  }
}

const precacheVisited = new Set()

async function precacheUrl(cache, url) {
  try {
    if (precacheVisited.has(url)) return
    precacheVisited.add(url)

    const response = await fetch(url)
    if (!canCacheResponse(response)) return

    const copy = response.clone()
    await cache.put(url, copy)

    const contentType = response.headers && response.headers.get('content-type')
    if (!contentType || !/text\/html/i.test(contentType)) return

    // Static export HTML contains the complete initial shell references. Add
    // those generated chunks and styles during install so a first offline
    // visit can boot without relying on a prior online navigation.
    const html = await response.text()
    const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    await Promise.all(
      references.map((match) => {
        const asset = new URL(match[1], url)
        if (!isInScope(asset) || isSensitivePath(asset)) return undefined
        return precacheUrl(cache, asset.toString())
      })
    )
  } catch {
    // A route or one of its shell assets may be unavailable during a deploy;
    // keep installing so the worker can still cache successful fetches later.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(PRECACHE_URLS.map((url) => precacheUrl(cache, url)))
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith(CACHE_PREFIX) || key === 'openquiz-v1') && key !== CACHE_NAME
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (!isInScope(url) || isSensitivePath(url)) return

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      if (request.mode === 'navigate' || request.destination === 'document') {
        return networkFirst(request, cache, true)
      }

      if (isImmutableAsset(url)) return cacheFirst(request, cache)
      return networkFirst(request, cache)
    })
  )
})
