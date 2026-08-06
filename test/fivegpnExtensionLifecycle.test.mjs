import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  findFlatLocationSettings,
  invalidFlatLocationKeys,
  readFlatLocationValue,
  writeFlatLocationValue,
} from '../src/helper/fivegpnExtensionSettings.ts'

const setting = (key, type, required = true) => ({ key, type, required })

test('mixed text and number coordinates round-trip without losing zero', () => {
  const settings = [
    setting('longitude', 'text'),
    setting('latitude', 'number'),
    setting('accuracy', 'text'),
  ]
  const group = findFlatLocationSettings(settings)
  assert.ok(group)

  assert.deepEqual(readFlatLocationValue(group, { longitude: '0', latitude: 0, accuracy: '25' }), {
    longitude: 0,
    latitude: 0,
    accuracy: 25,
  })
  assert.deepEqual(
    writeFlatLocationValue(group, {}, { longitude: 0, latitude: -0.5, accuracy: 30 }),
    { longitude: '0', latitude: -0.5, accuracy: '30' },
  )
  assert.deepEqual(
    [
      ...invalidFlatLocationKeys(group, { longitude: 'not-a-number', latitude: 0, accuracy: '0' }),
    ].sort(),
    ['accuracy', 'longitude'],
  )
})

test('flat coordinates support an omitted accuracy field with a local default', () => {
  const group = findFlatLocationSettings([
    setting('Longitude', 'number'),
    setting('Latitude', 'text'),
  ])
  assert.ok(group)
  assert.deepEqual(readFlatLocationValue(group, { Longitude: 12, Latitude: '34' }), {
    longitude: 12,
    latitude: 34,
    accuracy: 25,
  })
  assert.deepEqual(
    writeFlatLocationValue(group, { keep: true }, { longitude: 0, latitude: 0, accuracy: 50 }),
    { keep: true, Longitude: 0, Latitude: '0' },
  )
})

test('interception v2 exposes transactional settings and desired-versus-ready state', () => {
  const api = readFileSync(new URL('../src/api/fivegpn.ts', import.meta.url), 'utf8')
  const assembly = readFileSync(
    new URL('../src/assembly/fivegpn/interception.ts', import.meta.url),
    'utf8',
  )
  const capabilities = readFileSync(
    new URL('../src/assembly/fivegpn/capabilities.ts', import.meta.url),
    'utf8',
  )
  const page = readFileSync(
    new URL('../src/views/FiveGPNExtensionsPage.vue', import.meta.url),
    'utf8',
  )
  const editor = readFileSync(
    new URL('../src/components/fivegpn/FiveGPNExtensionSettingsEditor.vue', import.meta.url),
    'utf8',
  )

  assert.match(api, /runtime:\s*FiveGPNModuleRuntime/)
  assert.match(api, /setting_count:\s*number/)
  assert.match(api, /extensions\/\$\{encodeURIComponent\(id\)\}\/settings`/)
  assert.doesNotMatch(api, /settings\/\$\{encodeURIComponent\(key\)\}/)
  assert.match(assembly, /controller\?\.abort\(\)[\s\S]*const gen = \+\+generation/)
  assert.match(assembly, /expectedRevision && expectedRevision !== interceptionRevision\.value/)
  assert.match(assembly, /Math\.min\(lifecycleDelay \* 2, 5000\)/)
  const pendingProjection = assembly.match(
    /const certificatePending = \(\) =>(?<body>[\s\S]*?)const scheduleLifecyclePoll/,
  )
  assert.match(pendingProjection?.groups?.body ?? '', /certificate_pending/)
  assert.match(pendingProjection?.groups?.body ?? '', /certificate\.status === 'pending'/)
  assert.doesNotMatch(pendingProjection?.groups?.body ?? '', /armed/)
  assert.match(assembly, /catalogRevision\.value = res\.data\.revision/)
  assert.match(page, /setCatalogSources\(sources, baselineRevision\)/)
  assert.match(capabilities, /'5gpn-interception': 2/)
  assert.match(page, /@change="requestToggle\(module, \$event\)"/)
  assert.match(page, /fivegpnNetworkGrantWarning/)
  assert.match(page, /fivegpnUpdateAndKeepEnabled/)
  assert.match(page, /candidateConflict/)
  assert.match(page, /authorizationRevision/)
  assert.match(page, /editingRevision/)
  assert.match(page, /candidateRevision/)
  assert.match(editor, /conflictMessage/)
  assert.match(editor, /location\.accuracy\.type === 'text' \? '25' : 25/)
})
