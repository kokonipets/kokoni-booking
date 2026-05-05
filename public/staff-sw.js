// Kokoni Pet Grooming Salon — Staff Service Worker
// Handles Web Push notifications for groomers

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// ── Push received ──────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = { title: 'Kokoni Pet Grooming Salon', body: 'You have a new notification', badgeCount: 1, data: {} }

  if (event.data) {
    try { payload = { ...payload, ...JSON.parse(event.data.text()) } } catch {}
  }

  const notify = self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'kokoni-staff',
    renotify: true,
    vibrate: [200, 100, 200],
    data: payload.data ?? {},
  })

  // Update the home screen app badge (iOS 16.4+ PWA / Android Chrome)
  const badge = 'setAppBadge' in self.navigator
    ? self.navigator.setAppBadge(payload.badgeCount ?? 1).catch(() => {})
    : Promise.resolve()

  event.waitUntil(Promise.all([notify, badge]))
})

// ── Notification tapped ────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if already open
      for (const client of clients) {
        if (client.url.includes('/groomer/dashboard') && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow('/groomer/dashboard')
    })
  )
})
