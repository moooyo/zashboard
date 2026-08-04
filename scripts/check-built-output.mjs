#!/usr/bin/env node
// Properties of the built output, checked after vite has produced it.
//
// vite-plugin-pwa's default injectRegister writes a registerSW.js that calls
// navigator.serviceWorker.register() with no catch. On a gateway running
// CERT_MODE=debug that call ALWAYS fails -- a browser lets an operator click
// through a self-signed certificate to view the panel, but will not register a
// service worker behind one -- so every page load ended with an uncaught
// SecurityError and a stack trace in the console. Noise that guaranteed is not
// harmless: it is what the next real error gets scrolled past.
//
// Checked against dist rather than against vite.config.ts, because the property
// that matters is what ships. A future upgrade that changes the plugin's
// defaults would pass a config check and fail this one.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
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
if (/registerSW\.js/.test(html) || existsSync(join(DIST, 'registerSW.js'))) {
  failures.push(
    'the plugin is injecting registerSW.js again; its register() has no catch and the ' +
      'failure is unhandleable from application code (set injectRegister: false)',
  )
}

const bundles = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'))
let registrations = 0
let handled = 0
for (const file of bundles) {
  const code = readFileSync(join(DIST, 'assets', file), 'utf8')
  for (const m of code.matchAll(/serviceWorker\.register\([^)]*\)/g)) {
    registrations++
    // A handled registration is followed by .catch or .then with two arguments;
    // the shipped form is .catch, so require that rather than guess.
    if (code.slice(m.index, m.index + m[0].length + 8).includes('.catch')) handled++
  }
}
if (registrations === 0) {
  failures.push('nothing registers a service worker; offline caching is gone entirely')
} else if (handled < registrations) {
  failures.push(
    `${registrations - handled} of ${registrations} serviceWorker.register() call(s) ship without ` +
      'a catch; an untrusted certificate would surface as an uncaught SecurityError',
  )
}

if (failures.length) {
  console.error('built output:')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`ok: the shipped service-worker registration handles its own failure`)
