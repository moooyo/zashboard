import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const cardState = readFileSync(new URL('../src/components/ds/CardState.vue', import.meta.url), 'utf8')

test('5gpn settings cards share explicit loading, absent, error, and ready state', () => {
  assert.match(cardState, /status === 'absent'/u)
  assert.match(cardState, /status === 'error'/u)
  assert.match(cardState, /v-else-if="ready"/u)
  assert.match(cardState, /class="settings-grid"/u)
  assert.match(cardState, /\$emit\('retry'\)/u)

  for (const page of [
    'FiveGPNDnsSettings.vue',
    'FiveGPNInterceptionSettings.vue',
    'FiveGPNBotSettings.vue',
  ]) {
    const source = readFileSync(
      new URL(`../src/components/settings/fivegpn/${page}`, import.meta.url),
      'utf8',
    )
    assert.match(source, /<CardState/u)
    assert.match(source, /:ready=/u)
    assert.match(source, /fivegpnLoadingState/u)
    assert.match(source, /@retry=/u)
  }
})
