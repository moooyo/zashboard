import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { execSync } from 'child_process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { version } from './package.json'

const getGitCommitId = (): string => {
  try {
    const commitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim()

    if (commitMessage.includes('chore(main): release')) {
      return ''
    }

    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch (error) {
    console.warn('无法获取git commit ID:', error)
    return ''
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __COMMIT_ID__: JSON.stringify(getGitCommitId()),
  },
  build: {
    manifest: true,
  },
  base: './',
  plugins: [
    vue(),
    vueJsx(),
    VitePWA({
      registerType: 'autoUpdate',
      // The injected registerSW.js calls navigator.serviceWorker.register()
      // with no catch, so any failure lands in the console as an uncaught
      // SecurityError with a stack. That failure is GUARANTEED on a gateway
      // running CERT_MODE=debug: a browser lets an operator click through a
      // self-signed certificate to view the panel, but it will not register a
      // service worker behind one. Registration is done in main.ts instead, so
      // the expected case reads as one line rather than as an error that
      // buries the next real one.
      injectRegister: false,
      includeManifestIcons: false,
      workbox: {
        // 5gpn keeps the installable PWA shell but deliberately has no offline
        // application cache. A stale control plane is more dangerous than an
        // unavailable one, and the gateway API is unusable while offline
        // anyway. The imported activation hook removes caches created by older
        // releases and reloads their controlled windows once.
        globPatterns: [],
        cleanupOutdatedCaches: true,
        importScripts: ['pwa-no-cache.js'],
        navigateFallback: undefined,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/[^/]+\/ui(?:\/|$)/,
            handler: 'NetworkOnly',
            method: 'GET',
            options: {
              fetchOptions: { cache: 'no-store' },
            },
          },
        ],
      },
      // The manifest is a plain public asset so the plugin cannot add it or
      // its icons back to Workbox's precache manifest.
      manifest: false,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // mmdb-lib imports Node's `net`; back it with a tiny browser shim.
      net: fileURLToPath(new URL('./src/helper/netShim.ts', import.meta.url)),
    },
  },
})
