#!/usr/bin/env node
// Properties of the final static bundle that source-level checks cannot prove.
//
// 5gpn retains Zashboard's installable PWA shape, but the worker is deliberately
// network-only. An offline gateway Console cannot control anything, while a
// cached control plane can expose actions and contracts from an older release.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(ROOT, 'dist')
const failures = []

if (!existsSync(DIST)) {
  console.error('dist/ is missing; run this after vite build')
  process.exit(1)
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const assets = join(DIST, 'assets')
const bundles = readdirSync(assets).filter((file) => file.endsWith('.js'))
const bundleText = bundles.map((file) => readFileSync(join(assets, file), 'utf8')).join('\n')

if (/registerSW\.js/u.test(html) || existsSync(join(DIST, 'registerSW.js'))) {
  failures.push('vite-plugin-pwa injected its unhandled registration helper')
}
if (!bundleText.includes('serviceWorker.register')) {
  failures.push('the shipped application no longer registers its PWA worker')
}
if (!bundleText.includes('The PWA is unavailable:')) {
  failures.push('the shipped worker registration no longer handles registration failure')
}
if (!bundleText.includes('The PWA update check did not complete')) {
  failures.push('the shipped application no longer handles an update-check failure')
}

const workerPath = join(DIST, 'sw.js')
const cleanupPath = join(DIST, 'pwa-no-cache.js')
const manifestPath = join(DIST, 'manifest.webmanifest')
const leafletLicensePath = join(DIST, 'third-party', 'leaflet-LICENSE.txt')
if (!existsSync(workerPath)) {
  failures.push('sw.js is missing; the installable PWA contract was removed')
}
if (!existsSync(manifestPath)) {
  failures.push('manifest.webmanifest is missing; the installable PWA contract was removed')
}
if (!existsSync(cleanupPath)) {
  failures.push('the activation-time cache cleanup hook is missing')
}
if (!existsSync(leafletLicensePath)) {
  failures.push('the shipped Leaflet runtime is missing its BSD-2-Clause license text')
} else {
  const leafletLicense = readFileSync(leafletLicensePath, 'utf8')
  for (const token of [
    'Copyright (c) 2010-2023, Volodymyr Agafonkin',
    'Redistribution and use in source and binary forms',
    'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"',
  ]) {
    if (!leafletLicense.includes(token)) {
      failures.push(`the shipped Leaflet license is missing: ${token}`)
    }
  }
}

if (!/<link[^>]+rel=["']manifest["'][^>]+href=["']\.\/manifest\.webmanifest["']/u.test(html)) {
  failures.push('index.html does not reference the shipped PWA manifest')
}
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (
      manifest.scope !== './' ||
      manifest.start_url !== './' ||
      manifest.display !== 'standalone'
    ) {
      failures.push('the PWA manifest does not retain the relative standalone install contract')
    }
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      failures.push('the PWA manifest has no install icons')
    } else {
      for (const icon of manifest.icons) {
        const relative = typeof icon.src === 'string' ? icon.src.replace(/^\.\//u, '') : ''
        if (!relative || !existsSync(join(DIST, relative))) {
          failures.push(`the PWA manifest references a missing icon: ${icon.src ?? '<missing>'}`)
        }
      }
    }
  } catch (error) {
    failures.push(`manifest.webmanifest is not valid JSON: ${error}`)
  }
}

if (existsSync(workerPath)) {
  const worker = readFileSync(workerPath, 'utf8')
  if (!worker.includes('pwa-no-cache.js')) {
    failures.push('sw.js does not import the activation-time cache cleanup hook')
  }
  if (worker.includes('precacheAndRoute')) {
    failures.push('sw.js still installs a precache route')
  }
  const routes = [...worker.matchAll(/registerRoute\((.{1,500}?),"GET"\)/gu)].map(
    (match) => match[0],
  )
  const uiRoutes = routes.filter((route) => route.includes('\\/ui(?:\\/|$)/'))
  if (
    uiRoutes.length !== 1 ||
    !uiRoutes[0].includes('NetworkOnly') ||
    !uiRoutes[0].includes('fetchOptions:{cache:"no-store"}')
  ) {
    failures.push('sw.js does not bind /ui GET requests to NetworkOnly with cache:no-store')
  }
  if (!worker.includes('skipWaiting') || !worker.includes('clientsClaim')) {
    failures.push('sw.js cannot activate and claim old controlled windows immediately')
  }
}

if (existsSync(cleanupPath)) {
  const cleanup = readFileSync(cleanupPath, 'utf8')
  for (const token of ['caches.keys', 'caches.delete', 'clients.matchAll', 'client.navigate']) {
    if (!cleanup.includes(token)) failures.push(`the PWA cleanup hook is missing ${token}`)
  }
}

if (/["'`]\/upgrade(?:\/ui|\?|["'`])/u.test(bundleText)) {
  failures.push('the final bundle still contains a core or dashboard self-upgrade endpoint')
}
for (const upstream of [
  'api.github.com/repos/Zephyruso/zashboard/releases',
  'api.github.com/repos/MetaCubeX/mihomo/releases',
]) {
  if (bundleText.includes(upstream)) failures.push(`the final bundle still checks ${upstream}`)
}

if (failures.length) {
  console.error('built output:')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log('ok: shipped PWA is network-only and exposes no self-upgrade path')
