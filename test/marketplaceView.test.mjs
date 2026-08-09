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
const sources = [
  { id: 'one', name: 'Local one', url: 'https://one.example', enabled: true, metadata: {}, entries: [entry('zulu'), entry('alpha', { tags: ['weather'] })] },
  { id: 'two', name: 'Local two', url: 'https://two.example', enabled: true, metadata: {}, entries: [entry('beta', { description: 'Maps helper', version: '2.0.0' })] },
]

test('marketplace search covers truthful entry fields and source chips', () => {
  const weather = projectMarketplace(sources, { sourceID: '', query: 'weather', sort: 'catalog' })
  assert.deepEqual(weather.flatMap((source) => source.entries.map((item) => item.id)), ['alpha'])

  const source = projectMarketplace(sources, { sourceID: 'two', query: '', sort: 'catalog' })
  assert.deepEqual(source.map((item) => item.id), ['two'])
})

test('marketplace sort uses only catalog fields', () => {
  const byName = projectMarketplace(sources, { sourceID: 'one', query: '', sort: 'name' })
  assert.deepEqual(byName[0].entries.map((item) => item.id), ['alpha', 'zulu'])

  const byVersion = projectMarketplace(sources, { sourceID: '', query: '', sort: 'version' })
  assert.equal(byVersion[1].entries[0].version, '2.0.0')
  assert.equal('popularity' in byVersion[1].entries[0], false)
})

test('marketplace input debounces into a local effective query and cancels on unmount', () => {
  assert.match(pageSource, /const marketplaceSearchInput = ref\(''\)/u)
  assert.match(pageSource, /const marketplaceSearch = ref\(''\)/u)
  assert.match(pageSource, /debounce\(\(value: string\)[\s\S]*?\}, 200\)/u)
  assert.match(pageSource, /commitMarketplaceSearch\.cancel\(\)/u)
  assert.match(pageSource, /v-for="source in filteredSources"/u)
  assert.doesNotMatch(pageSource, /popularity|author|download_count/u)
})
