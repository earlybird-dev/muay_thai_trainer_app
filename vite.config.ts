import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // Coach voice clips (~5 MB) are cached as they're first used, so they work offline afterwards
      // without every visitor downloading all of them up front.
      workbox: {
        // Clean URLs: any in-app page loads the app shell offline.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/(voice|music|assets)\//, /\.[a-z0-9]+$/i],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/voice\/[^/]+\.mp3$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'coach-voice', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 400 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/voice/manifest.json'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'coach-voice-manifest' },
          },
        ],
      },
      manifest: {
        name: 'Muay Thai Trainer',
        short_name: 'Nak Muay',
        description: 'Learn Muay Thai basics, build combos and train at home.',
        theme_color: '#141416',
        background_color: '#141416',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        id: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
} as any);
