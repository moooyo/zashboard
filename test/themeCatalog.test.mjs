import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { normalizeSavedTheme, THEME_CATALOG } from '../src/helper/themeCatalog.ts'

test('theme catalog is the fixed five-theme product set', () => {
  assert.deepEqual(THEME_CATALOG, ['light', 'dark', 'light-neutral', 'dark-neutral', 'nord'])
})

test('removed saved themes fall back while local custom themes remain valid', () => {
  assert.equal(normalizeSavedTheme('dracula', 'light'), 'light')
  assert.equal(normalizeSavedTheme('dark-monet', 'dark'), 'dark')
  assert.equal(normalizeSavedTheme('nord', 'light'), 'nord')
  assert.equal(normalizeSavedTheme('operator-theme', 'light', ['operator-theme']), 'operator-theme')
})

test('DaisyUI emits only the catalog and preserves default preferences', () => {
  const framework = readFileSync(
    new URL('../src/assets/styles/framework.css', import.meta.url),
    'utf8',
  )
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  const customNames = [...framework.matchAll(/name:\s*'([^']+)'/gu)].map((match) => match[1])

  assert.deepEqual(customNames, ['light', 'dark', 'light-neutral', 'dark-neutral'])
  assert.match(framework, /themes:\s*nord;/u)
  assert.match(framework, /name:\s*'light';[\s\S]*?default:\s*true;/u)
  assert.match(framework, /name:\s*'dark';[\s\S]*?prefersdark:\s*true;/u)
  assert.doesNotMatch(framework, /themes:\s*all|monet|dark-daisyui5/iu)
  assert.doesNotMatch(main, /applyKsuTheme|window\.ksu/u)
})
