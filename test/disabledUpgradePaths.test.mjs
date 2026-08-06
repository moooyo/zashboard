import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = (path) => readFileSync(`${root}/${path}`, 'utf8')

test('5gpn exposes no core or dashboard self-upgrade path', () => {
  const files = [
    'src/api/clash.ts',
    'src/assembly/version.ts',
    'src/components/settings/backend/BackendSettings.vue',
    'src/components/settings/general/GeneralSettings.vue',
    'src/components/settings/general/ZashboardSettings.vue',
    'src/config/settingsItems.ts',
    'src/store/settings.ts',
    'src/views/HomePage.vue',
  ]
  const shippedSources = files.map(source).join('\n')

  assert.doesNotMatch(shippedSources, /["'`]\/upgrade(?:\/ui|\?|["'`])/u)
  assert.doesNotMatch(
    shippedSources,
    /upgradeUIAPI|upgradeCoreAPI|checkUIUpdate|autoUpgradeDashboard|autoUpgradeCore|checkUpgradeCore/u,
  )
  assert.doesNotMatch(
    shippedSources,
    /api\.github\.com\/repos\/(?:Zephyruso\/zashboard|MetaCubeX\/mihomo)\/releases/u,
  )
  assert.equal(existsSync(`${root}/src/components/settings/backend/UpgradeCoreModal.vue`), false)
})

test('safe runtime maintenance actions remain available', () => {
  const api = source('src/api/clash.ts')
  const backend = source('src/components/settings/backend/BackendSettings.vue')

  assert.match(api, /axios\.post\('\/restart'\)/u)
  assert.match(api, /axios\.put\('\/configs\?reload=true'/u)
  assert.match(api, /axios\.post\('\/configs\/geo'\)/u)
  for (const symbol of [
    'handlerClickRestartCore',
    'handlerClickReloadConfigs',
    'showUpdateConfigModal',
    'handlerClickUpdateGeo',
  ]) {
    assert.match(backend, new RegExp(symbol, 'u'))
  }
  for (const [label, action] of [
    ['restartCore', 'handlerClickRestartCore'],
    ['reloadConfigs', 'handlerClickReloadConfigs'],
    ['updateConfigs', 'showUpdateConfigModal = true'],
    ['updateGeoDatabase', 'handlerClickUpdateGeo'],
  ]) {
    const labelIndex = backend.indexOf(`$t('${label}')`)
    const actionIndex = backend.indexOf(action, labelIndex)
    assert.ok(labelIndex >= 0, `${label} is not rendered`)
    assert.ok(
      actionIndex > labelIndex && actionIndex - labelIndex < 500,
      `${label} has no UI action`,
    )
  }
})

test('upgrade suppression is a product boundary, not a backend flag', () => {
  const handoff = source('src/helper/setupHandoff.ts')
  const backendType = source('src/types/index.d.ts')
  const editor = source('src/components/settings/backend/EditBackendModal.vue')

  for (const text of [handoff, backendType, editor]) {
    assert.doesNotMatch(text, /disableUpgradeCore/u)
  }
})
