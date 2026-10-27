// Hossidev Water Monitor - Official Web Push Service Worker
const CACHE_NAME = 'hossidev-scada-v2.6';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[ServiceWorker] Cache addAll aviso:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Bypass API calls from static cache
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const indexCached = (await caches.match('/index.html')) || (await caches.match('/'));
          if (indexCached) return indexCached;
        }
        return new Response('Offline - Conteúdo indisponível', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      })
  );
});

// Push Event: Receives and shows rich low water level notification
self.addEventListener('push', (event) => {
  let data = {
    title: 'ALERTA — Nível baixo de água',
    body: 'Verifique o nível dos reservatórios.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'hossidev-alert',
    data: {
      alertId: '',
      tankId: '1',
      url: '/modo-exibicao?tanque=1',
    },
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const title = data.title || 'ALERTA — Nível baixo de água';
  const options = {
    body: data.body,
    icon: data.icon || '/icon.svg',
    badge: data.badge || '/icon.svg',
    vibrate: [300, 150, 300, 150, 450],
    tag: data.tag || `hossidev-alert-${data.data?.tankId || '1'}`,
    renotify: true,
    requireInteraction: true,
    data: {
      alertId: data.data?.alertId || '',
      tankId: data.data?.tankId || '1',
      url: data.data?.url || `/modo-exibicao?tanque=${data.data?.tankId || '1'}`,
    },
    actions: [
      { action: 'open_tank', title: 'Ver Tanque', icon: '/icon.svg' },
      { action: 'close', title: 'Fechar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click: Focuses open window or opens new tab navigates to tank
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const notificationData = event.notification.data || {};
  const tankId = notificationData.tankId || '1';
  const targetUrl = notificationData.url || `/modo-exibicao?tanque=${tankId}`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK_NAVIGATE',
            tankId,
            alertId: notificationData.alertId,
            url: targetUrl,
          });
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
