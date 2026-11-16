/* Ƀucks service worker — installable PWA shell */
const CACHE = 'bu-shell-v1'
const PRECACHE = [
  '/',
  '/app',
  '/login',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-icon.png',
  '/favicon.ico',
  '/favicon-32.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

function isApiRequest(url) {
  return url.pathname.startsWith('/api/')
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon') ||
    url.pathname.startsWith('/apple-icon') ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/i.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isApiRequest(url)) return

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone())
            return response
          })
          .catch(() => cached)
        return cached || network
      }),
    )
    return
  }

  // App shell / navigation: network first, cache fallback
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          if (cached) return cached
          const app = await caches.match('/app')
          if (app) return app
          const home = await caches.match('/')
          if (home) return home
          return new Response('Ƀucks is offline. Reconnect to continue.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        }),
    )
  }
})
