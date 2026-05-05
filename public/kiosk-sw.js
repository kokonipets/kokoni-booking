// Kokoni Kiosk Service Worker
// Caches the kiosk shell so it loads instantly even on slow networks

const CACHE = 'kokoni-kiosk-v5'
const SHELL = ['/kiosk', '/logo.png', '/manifest.json']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request)
      return cached || new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
    })
  )
})
