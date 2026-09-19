const CACHE_NAME = 'openquiz-v1'

const PRECACHE_URLS = [
  new URL('sat/quiz-sets.json', self.registration.scope).toString(),
  new URL('sat/1.json', self.registration.scope).toString(),
  new URL('sat/2.json', self.registration.scope).toString(),
  new URL('sat/archaic.json', self.registration.scope).toString(),
  new URL('securityplus/test1.json', self.registration.scope).toString(),
  new URL('securityplus/test2.json', self.registration.scope).toString(),
  new URL('securityplus/test3.json', self.registration.scope).toString(),
  new URL('securityplus/final.json', self.registration.scope).toString(),
  new URL('securityplus/secplus-crypto.json', self.registration.scope).toString(),
  new URL('securityplus/secplus-fundamentals.json', self.registration.scope).toString(),
  new URL('securityplus/secplus-infra.json', self.registration.scope).toString(),
  new URL('securityplus/secplus-physical.json', self.registration.scope).toString(),
  new URL('securityplus/secplus-threats.json', self.registration.scope).toString(),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([self.registration.scope, ...PRECACHE_URLS]))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached

      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    })
  )
})
