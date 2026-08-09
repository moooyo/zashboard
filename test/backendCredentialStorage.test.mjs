import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  BACKEND_LIST_STORAGE_KEY,
  BACKEND_SESSION_SECRETS_KEY,
  dehydrateBackendState,
  hydrateBackendState,
} from '../src/helper/backendCredentialStorage.ts'

const backend = (overrides = {}) => ({
  host: 'console.example.test',
  label: 'gateway',
  password: 'controller-secret',
  port: '443',
  protocol: 'https',
  secondaryPath: '',
  type: 'clash',
  uuid: 'gateway-1',
  ...overrides,
})

test('controller secret is session-only by default and survives a same-tab reload', () => {
  const dehydrated = dehydrateBackendState([backend()])

  assert.equal(BACKEND_LIST_STORAGE_KEY, 'setup/api-list')
  assert.equal(BACKEND_SESSION_SECRETS_KEY, 'setup/session-secrets')
  assert.equal(Object.hasOwn(dehydrated.stored[0], 'password'), false)
  assert.deepEqual(dehydrated.sessionSecrets, { 'gateway-1': 'controller-secret' })

  const hydrated = hydrateBackendState(dehydrated.stored, dehydrated.sessionSecrets)
  assert.equal(hydrated[0].password, 'controller-secret')
  assert.equal(hydrated[0].rememberSecret, false)
})

test('explicit remember stores the same controller secret locally', () => {
  const dehydrated = dehydrateBackendState([backend({ rememberSecret: true })])

  assert.equal(dehydrated.stored[0].password, 'controller-secret')
  assert.equal(dehydrated.stored[0].rememberSecret, true)
  assert.deepEqual(dehydrated.sessionSecrets, { 'gateway-1': 'controller-secret' })

  const currentTab = hydrateBackendState(dehydrated.stored, {
    'gateway-1': 'newer-session-secret',
  })
  assert.equal(currentTab[0].password, 'newer-session-secret')
})

test('legacy local secrets are moved into the current session without data loss', () => {
  const legacy = backend()
  const hydrated = hydrateBackendState([legacy], {})
  assert.equal(hydrated[0].password, 'controller-secret')
  assert.equal(hydrated[0].rememberSecret, false)

  const rewritten = dehydrateBackendState(hydrated)
  assert.equal(Object.hasOwn(rewritten.stored[0], 'password'), false)
  assert.equal(rewritten.sessionSecrets['gateway-1'], 'controller-secret')
})

test('setup and edit surfaces make persistent storage an explicit choice', () => {
  const setupStore = readFileSync(new URL('../src/store/setup.ts', import.meta.url), 'utf8')
  const setupPage = readFileSync(new URL('../src/views/SetupPage.vue', import.meta.url), 'utf8')
  const editDialog = readFileSync(
    new URL('../src/components/settings/backend/EditBackendModal.vue', import.meta.url),
    'utf8',
  )

  assert.match(setupStore, /sessionStorage/u)
  assert.doesNotMatch(setupStore, /useStorage<Backend\[\]>\(['"]setup\/api-list/u)
  assert.match(setupPage, /rememberControllerSecret/u)
  assert.match(setupPage, /rememberSecret:\s*false/u)
  assert.match(setupPage, /Object\.assign\(form, backend, \{ rememberSecret: false \}\)/u)
  assert.match(editDialog, /rememberControllerSecret/u)
})
