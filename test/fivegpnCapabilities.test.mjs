import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  classifyCapabilityFailure,
  classifyCapabilityPayload,
  SUPPORTED_CONTROLLER_API,
} from '../src/helper/fivegpnCapabilities.ts'

const capabilityAssembly = readFileSync(
  new URL('../src/assembly/fivegpn/capabilities.ts', import.meta.url),
  'utf8',
)

test('capability failures retry only transient statuses', () => {
  assert.equal(classifyCapabilityFailure(0), 'temporary')
  assert.equal(classifyCapabilityFailure(408), 'temporary')
  assert.equal(classifyCapabilityFailure(429), 'temporary')
  assert.equal(classifyCapabilityFailure(503), 'temporary')
  assert.equal(classifyCapabilityFailure(404), 'unsupported')
  assert.equal(classifyCapabilityFailure(401), 'authentication')
  assert.equal(classifyCapabilityFailure(400), 'contract')
  assert.equal(classifyCapabilityFailure(403), 'contract')
  assert.equal(classifyCapabilityFailure(422), 'contract')
})

test('capability payload accepts only the exact controller API', () => {
  assert.equal(
    classifyCapabilityPayload({ controllerApi: SUPPORTED_CONTROLLER_API, features: {} }).status,
    'compatible',
  )
  assert.equal(
    classifyCapabilityPayload({ controllerApi: '2', features: {} }).status,
    'incompatible',
  )
  assert.equal(classifyCapabilityPayload({ controllerApi: 1, features: {} }).status, 'malformed')
})

test('capability payload validates feature descriptors before gating routes', () => {
  const valid = classifyCapabilityPayload({
    controllerApi: '1',
    features: { '5gpn-interception': { version: 8, owner: 'mihomo' } },
  })
  assert.equal(valid.status, 'compatible')

  assert.equal(
    classifyCapabilityPayload({
      controllerApi: '1',
      features: { '5gpn-interception': { version: '8' } },
    }).status,
    'malformed',
  )
})

test('DNS configuration renders only for the installation-owned gateway schema', () => {
  assert.match(capabilityAssembly, /'5gpn-dns': 2/u)
  assert.doesNotMatch(capabilityAssembly, /'5gpn-dns': 1/u)
})
