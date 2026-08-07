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
    /reviewing \|\| busy \|\| sourceBusy \|\| catalogInstallState\(entry\) === 'current'/u,
  )
  assert.match(source, /\$t\('fivegpnUpToDate'\)/u)
  assert.match(source, /\$t\('fivegpnUpdateAvailable'\)/u)

  const confirm = source.match(/const confirmReview = async[\s\S]*?\n\}\n\nonMounted/u)?.[0]
  assert.ok(confirm, 'the reviewed confirmation handler is missing')
  assert.match(confirm, /importContent\.value = ''\s+await refreshCatalog\(\)\s+\}/u)
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

test('installed extensions can update only through a reviewed marketplace entry', () => {
  const page = readFileSync(
    new URL('../src/views/FiveGPNExtensionsPage.vue', import.meta.url),
    'utf8',
  )
  const api = readFileSync(new URL('../src/api/fivegpn.ts', import.meta.url), 'utf8')
  const assembly = readFileSync(
    new URL('../src/assembly/fivegpn/interception.ts', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(page, /fivegpnCheckUpdate|checkUpdate|updateTarget|applyReviewedUpdate/u)
  assert.match(page, /fivegpnMarketplaceUpdateOnly/u)
  assert.match(page, /catalogTarget/u)
  assert.match(page, /applyCatalogUpdate/u)

  const confirm = page.match(/const confirmReview = async[\s\S]*?\n\}\n\nonMounted/u)?.[0]
  assert.ok(confirm, 'the reviewed confirmation handler is missing')
  assert.doesNotMatch(confirm, /reviewed\.installed|applyReviewedUpdate/u)
  assert.match(confirm, /fromCatalog[\s\S]*applyCatalogUpdate/u)

  assert.doesNotMatch(
    api,
    /checkExtensionUpdateAPI|applyExtensionUpdateAPI|extensions\/\$\{[^}]+\}\/update/u,
  )
  assert.doesNotMatch(assembly, /checkExtensionUpdate|applyReviewedUpdate|applyExtensionUpdateAPI/u)
  assert.match(api, /applyCatalogUpdateAPI/u)
  assert.match(assembly, /applyCatalogUpdate/u)
})
