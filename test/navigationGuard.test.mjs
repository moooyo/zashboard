import assert from 'node:assert/strict'
import test from 'node:test'

import { managementRouteDecision } from '../src/helper/navigationGuard.ts'

const decide = (overrides = {}) =>
  managementRouteDecision({
    hasBackend: true,
    isSetup: false,
    requirementSatisfied: true,
    setupRoute: 'setup',
    fallbackRoute: 'proxies',
    ...overrides,
  })

test('a direct management route without a backend is replaced by setup', () => {
  assert.deepEqual(decide({ hasBackend: false }), { name: 'setup' })
})

test('a direct route without its capability is replaced before confirmation', () => {
  assert.deepEqual(decide({ requirementSatisfied: false }), { name: 'proxies' })
})

test('an allowed direct route explicitly continues', () => {
  assert.equal(decide(), true)
})
