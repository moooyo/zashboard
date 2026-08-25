import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { projectMarketplace } from '../src/helper/marketplaceView.ts'

const pageSource = readFileSync(
  new URL('../src/views/FiveGPNMarketplacePage.vue', import.meta.url),
  'utf8',
)

const entry = (id, overrides = {}) => ({
  id,
  name: id,
  version: '1.0.0',
  description: '',
  tags: [],
  manifest: { url: `https://example.com/${id}.yaml`, sha256: 'a'.repeat(64) },
  capabilities: {},
  ...overrides,
})
const catalog = {
  url: 'https://moooyo.github.io/5gpn-extensions/marketplace/v2/index.json',
  fetched_at: '2026-01-01T00:00:00Z',
  metadata: { name: 'Official extensions' },
  entries: [
    entry('zulu'),
    entry('alpha', { tags: ['weather'] }),
    entry('beta', { description: 'Maps helper', version: '2.0.0' }),
  ],
}

test('marketplace search covers truthful entry fields', () => {
  assert.deepEqual(
    projectMarketplace(catalog, { query: 'weather', sort: 'catalog' }).map((item) => item.id),
    ['alpha'],
  )
  assert.deepEqual(
    projectMarketplace(catalog, { query: 'maps', sort: 'catalog' }).map((item) => item.id),
    ['beta'],
  )
  assert.deepEqual(
    projectMarketplace(catalog, { query: '', sort: 'catalog' }).map((item) => item.id),
    ['zulu', 'alpha', 'beta'],
  )
})

test('marketplace sort uses only catalog fields', () => {
  assert.deepEqual(
    projectMarketplace(catalog, { query: '', sort: 'name' }).map((item) => item.id),
    ['alpha', 'beta', 'zulu'],
  )
  assert.deepEqual(
    projectMarketplace(catalog, { query: '', sort: 'id' }).map((item) => item.id),
    ['alpha', 'beta', 'zulu'],
  )

  const byVersion = projectMarketplace(catalog, { query: '', sort: 'version' })
  assert.equal(byVersion.at(-1).version, '2.0.0')
  assert.equal('popularity' in byVersion[0], false)
})

// One index means one unguarded dereference is enough to blank the page with no
// error to explain it. A response without entries must project to nothing.
test('an index that reports no entries projects empty instead of throwing', () => {
  assert.deepEqual(projectMarketplace(null, { query: '', sort: 'catalog' }), [])
  assert.deepEqual(
    projectMarketplace({ ...catalog, entries: undefined }, { query: 'weather', sort: 'name' }),
    [],
  )
})

test('marketplace input debounces into a local effective query and cancels on unmount', () => {
  assert.match(pageSource, /const marketplaceSearchInput = ref\(''\)/u)
  assert.match(pageSource, /const marketplaceSearch = ref\(''\)/u)
  assert.match(pageSource, /debounce\(\(value: string\)[\s\S]*?\}, 200\)/u)
  assert.match(pageSource, /commitMarketplaceSearch\.cancel\(\)/u)
  assert.match(pageSource, /v-for="entry in filteredEntries"/u)
  assert.doesNotMatch(pageSource, /popularity|author|download_count/u)
})
