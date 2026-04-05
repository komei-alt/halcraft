// ============================================
// HalCraft — Service Worker（プッシュ通知用）
// ============================================
/* global clients */

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'ハルクラ', body: event.data.text() }
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/favicon.png',
    tag: payload.tag || 'halcraft-notification',
    data: { url: payload.url || '/' },
    vibrate: [200, 100, 200],
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'ハルクラ', options),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 既に開いているタブがあれば、そこにフォーカス
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // なければ新しいウィンドウを開く
      return clients.openWindow(url)
    }),
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  // サブスクリプションが変更された場合、再登録を試みる
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options).then((subscription) => {
      const serverUrl = self.location.origin.includes('localhost')
        ? 'http://localhost:4001'
        : 'https://halcraft-ws.rosch.jp'

      return fetch(`${serverUrl}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
    }),
  )
})
