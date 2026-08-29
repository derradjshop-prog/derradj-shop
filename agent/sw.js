/*
  Derradj Agent dashboard service worker.

  Scope is intentionally /agent/ only — this does NOT cache anything and
  has no fetch handler, so it never affects offline behavior or serves
  stale data. Its only job is to show local notifications on behalf of
  the dashboard page (postMessage -> showNotification), because Android
  Chrome requires a service-worker-issued notification for it to appear
  in the system tray/lock screen while the PWA is backgrounded.

  This is NOT server-side push: notifications only fire while this
  worker is alive, which in practice means while the dashboard PWA is
  open or was recently open (Android keeps a SW alive briefly after the
  page closes, not indefinitely). There is no push server, no VAPID, and
  no way to wake the app when it has been fully terminated by the OS.
*/

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
  try {
    const data = event.data;
    if (!data || data.type !== 'NOTIFY') return;

    const title = data.title || 'Derradj Agent';
    const options = {
      body: data.body || '',
      icon: data.icon || '/agent/icons/icon-192.png',
      badge: data.badge || '/agent/icons/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/agent/dashboard.html' },
      vibrate: [200, 100, 200],
      requireInteraction: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    // Never let a malformed message crash the worker.
    console.warn('sw NOTIFY handling failed:', err);
  }
});

self.addEventListener('notificationclick', event => {
  try {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/agent/dashboard.html';

    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        for (const client of clientList) {
          try {
            if (client.url.includes('/agent/') && 'focus' in client) {
              return client.focus();
            }
          } catch (err) { /* ignore this client, try the next */ }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
    );
  } catch (err) {
    console.warn('sw notificationclick handling failed:', err);
  }
});
