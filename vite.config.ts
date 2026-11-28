import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { BOOT_LOADER_HTML } from './src/lib/fighterLoader';

/** The commit being built: from GitHub Actions, or the local checkout. */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  base: '/',
  // Shown in Settings → About, so you can tell which version a device is running.
  define: { __BUILD__: JSON.stringify({ time: new Date().toISOString(), sha: commit() }) },
  plugins: [
    react(),
    // Start-up loading animation, shown before the app's JavaScript has loaded.
    { name: 'boot-loader', transformIndexHtml: (html: string) => html.replace('<!--boot-loader-->', BOOT_LOADER_HTML) },
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
            // Always ask for the newest clip list (new phrases), falling back to the saved one offline.
            urlPattern: ({ url }) => url.pathname.endsWith('/voice/manifest.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'coach-voice-manifest', networkTimeoutSeconds: 3 },
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
