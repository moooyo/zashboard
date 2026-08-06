import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { catalogInstallState } from '../src/assembly/fivegpn/catalog.ts'

const entry = (overrides = {}) => ({
  id: 'example.extension',
  manifest: { url: 'https://example.invalid/extension.yaml', sha256: 'a'.repeat(64) },
  capabilities: {},
  ...overrides,
})

test('marketplace renders current entries as a disabled up-to-date action', () => {
  const source = readFileSync(
    new URL('../src/views/FiveGPNExtensionsPage.vue', import.meta.url),
    'utf8',
  )

  assert.match(source, /catalogInstallState\(entry\) === 'current'/u)
  assert.match(
    source,
    /:disabled="reviewing \|\| busy \|\| catalogInstallState\(entry\) === 'current'"/u,
  )
  assert.match(source, /\$t\('fivegpnUpToDate'\)/u)
  assert.match(source, /\$t\('fivegpnUpdateAvailable'\)/u)

  const install = source.match(/const install = async[\s\S]*?\n\}\n\nonMounted/u)?.[0]
  assert.ok(install, 'the reviewed install handler is missing')
  assert.match(install, /importContent\.value = ''\s+await refreshCatalog\(\)\s+\}/u)
})

test('catalog entries distinguish install, current, and update states', () => {
  assert.equal(catalogInstallState(entry()), 'not-installed')
  assert.equal(
    catalogInstallState(entry({ installed_version: '1.0.0', installed_current: true })),
    'current',
  )
  assert.equal(
    catalogInstallState(entry({ installed_version: '1.0.0', installed_current: false })),
    'update-available',
  )
})
