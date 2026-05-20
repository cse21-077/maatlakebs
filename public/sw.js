const CACHE_NAME = 'maatla-kebs-v2';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/app.css',
  '/icon-192.png',
  '/icon-512.png',
  '/MK Logo.png'
];

// Install: cache app shell, but don't fail if some assets are missing
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Precache partially failed:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: check if request is a navigation (HTML page)
function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

// Helper: check if request is a static asset we want to cache
function isStaticAsset(request) {
  const dest = request.destination;
  const url = new URL(request.url);
  return dest === 'script' ||
         dest === 'style' ||
         dest === 'image' ||
         dest === 'font' ||
         url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 1. Navigation requests (HTML) → Network First
  // This ensures users always get the latest index.html after a deploy
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              '<h1 style="color:#fff;background:#0d0f14;text-align:center;padding:40px;">Offline. Please check your connection and try again.</h1>',
              { headers: { 'Content-Type': 'text/html' } }
            );
          });
        })
    );
    return;
  }

  // 2. Static assets (JS, CSS, images) → Cache First, then network
  if (isStaticAsset(request)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Refresh cache in background (stale-while-revalidate)
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            }
          }).catch(() => {});
          return cached;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. Everything else (API calls, external resources) → Network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Handle skip-waiting messages from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Push Notifications ──────────────────────────────────────────────────────
// Handle push events from server (VAPID subscriptions)
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received:', event);
  
  let data = { 
    title: 'Maatla Kebs', 
    body: 'You have a new message', 
    url: '/',
    badge: '/icon-192.png',
    icon: '/icon-192.png'
  };
  
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
      console.log('[SW] Parsed push data:', data);
    }
  } catch (err) {
    if (event.data) {
      data.body = event.data.text();
      console.log('[SW] Text push data:', data.body);
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'maatla-kebs-notification',
    requireInteraction: true,
    data: { url: data.url || '/', timestamp: Date.now() },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => console.log('[SW] Notification shown'))
      .catch(err => console.error('[SW] Failed to show notification:', err))
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked, action:', event.action);
  event.notification.close();
  
  if (event.action === 'close') return;
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            console.log('[SW] Focusing existing client');
            return client.focus();
          }
        }
        // Open new window if not already open
        console.log('[SW] Opening new window');
        return clients.openWindow(url);
      })
  );
});

// Handle notification dismissal
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed');
});
