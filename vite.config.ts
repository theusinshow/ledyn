import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function collectDistFiles(dir: string, rootDir: string = dir): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectDistFiles(fullPath, rootDir));
    } else if (entry.isFile() && entry.name !== 'sw.js') {
      const rel = path.relative(rootDir, fullPath).split(path.sep).join('/');
      results.push(`/${rel}`);
    }
  }
  return results.sort();
}

function ledynOfflinePwaPlugin(): Plugin {
  return {
    name: 'ledyn-offline-pwa-sw',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(import.meta.dirname, 'dist');
      if (!fs.existsSync(distDir)) return;

      const files = collectDistFiles(distDir).filter(
        (rel) => rel !== '/index.html',
      );
      const precacheUrls = Array.from(new Set(['/', ...files]));

      const hash = crypto.createHash('sha256');
      for (const relUrl of files) {
        const diskPath = path.join(distDir, relUrl.slice(1));
        if (fs.existsSync(diskPath)) {
          hash.update(relUrl);
          hash.update(fs.readFileSync(diskPath));
        }
      }
      const buildHash = hash.digest('hex').slice(0, 12);
      const cacheName = `ledyn-pwa-v1-${buildHash}`;

      const swSource = `// Gerado automaticamente no build de produção — Leitura Dinâmica Pessoal
const CACHE_NAME = ${JSON.stringify(cacheName)};
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

async function cleanResponse(response) {
  if (!response || !response.redirected) {
    return response;
  }
  const body = await response.blob();
  return new Response(body, {
    status: response.status || 200,
    statusText: response.statusText || 'OK',
    headers: response.headers,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of PRECACHE_URLS) {
        const response = await fetch(url, { cache: 'reload' });
        if (response && response.ok) {
          await cache.put(url, await cleanResponse(response));
        }
      }
      if (!self.registration.active) {
        await self.skipWaiting();
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith('ledyn-pwa-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedIndex =
          (await cache.match('/')) || (await cache.match('/index.html'));
        if (cachedIndex) {
          return cleanResponse(cachedIndex);
        }
        return fetch(request);
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached =
        (await cache.match(url.pathname)) ||
        (await cache.match(request, { ignoreSearch: true }));
      if (cached) {
        return cleanResponse(cached);
      }
      const response = await fetch(request);
      if (response && response.ok) {
        await cache.put(url.pathname, (await cleanResponse(response)).clone());
      }
      return response;
    })
  );
});
`;

      fs.writeFileSync(path.join(distDir, 'sw.js'), swSource, 'utf-8');
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), ledynOfflinePwaPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 4173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
