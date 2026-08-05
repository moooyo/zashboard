#!/usr/bin/env node
// Every i18n key referenced with a literal must exist.
//
// A missing key does not throw. vue-i18n falls back to compiling the key itself
// as a message, so the UI silently renders "fivegpnDnsPolicy" where a label should
// be -- and on a page you cannot open in CI, nobody sees it. That is the same
// shape as the three faults this console shipped in one day: valid code, clean
// build, wrong only in a browser.
//
// Scope is deliberately literal call sites, `t('key')` and `$t('key')`. Keys
// resolved through a map are a real pattern here (TAB_LABEL, FALLBACK_HINT) and
// are not checked: catching them needs to follow the map, and a check that
// guesses is worse than one with a stated boundary.
//
// en is the fallback locale, so a key missing there is missing everywhere.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

const en = (await import(pathToFileURL(join(SRC, 'i18n', 'en.ts')).href)).default
const known = new Set()
const collect = (node, path) => {
  for (const [key, value] of Object.entries(node)) {
    const here = path ? `${path}.${key}` : key
    known.add(here)
    if (value && typeof value === 'object') collect(value, here)
  }
}
collect(en, '')

// t('key') / $t('key') / t("key", …) — the key must be the first argument and a
// plain literal, which is what makes it checkable at all.
const CALL = /\$?\bt\(\s*(['"])([A-Za-z][\w.]*)\1/g

const failures = []
let checked = 0
for (const file of walk(SRC).filter((f) => /\.(ts|vue)$/.test(f))) {
  if (file.includes(join('src', 'i18n'))) continue
  const body = readFileSync(file, 'utf8')
  for (const m of body.matchAll(CALL)) {
    const key = m[2]
    checked++
    if (!known.has(key)) {
      const line = body.slice(0, m.index).split('\n').length
      failures.push(`${relative(ROOT, file)}:${line}: ${key}`)
    }
  }
}

if (failures.length) {
  console.error('i18n keys referenced but not defined in en:')
  for (const f of [...new Set(failures)]) console.error(`  ${f}`)
  console.error('\nA missing key renders as the key itself. It does not throw, so nothing else notices.')
  process.exit(1)
}
console.log(`ok: ${checked} literal i18n references all resolve`)
