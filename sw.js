const CACHE_NAME = 'maatla-kebs-v1.0.0';
const RUNTIME_CACHE = 'maatla-kebs-runtime';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/index.tsx',
  '/logo.png',
  '/manifest.json'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests that are not app resources, fonts, or ESM dependencies
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.includes('fonts.googleapis.com') &&
      !event.request.url.includes('esm.sh')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return caches.open(RUNTIME_CACHE).then((cache) => {
        return fetch(event.request).then((response) => {
          // Cache successful responses
          if (response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => {
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      });
    })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-trades') {
    event.waitUntil(syncTrades());
  }
});

async function syncTrades() {
  // Placeholder for syncing trades when back online
  console.log('[SW] Syncing trades...');
}

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
