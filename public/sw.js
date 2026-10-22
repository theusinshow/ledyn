// Service worker de desenvolvimento (substituído no build de produção com o manifesto completo de precache)
const CACHE_NAME = 'ledyn-pwa-dev-v1';

self.addEventListener('install', () => {
  if (!self.registration.active) {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
