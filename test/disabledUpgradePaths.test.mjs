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
    'src/components/settings/backend/BackendManager.vue',
    'src/components/settings/backend/BackendSettings.vue',
    'src/components/settings/backend/BackendSwitch.vue',
    'src/components/settings/general/GeneralSettings.vue',
    'src/components/settings/general/ZashboardSettings.vue',
    'src/composables/backendActions.ts',
    'src/config/settingsItems.ts',
    'src/store/settings.ts',
    'src/views/HomePage.vue',
  ]
  const shippedSources = files.map(source).join('\n')

  assert.doesNotMatch(shippedSources, /["'`]\/upgrade(?:\/ui|\?|["'`])/u)
  assert.doesNotMatch(
    shippedSources,
    /upgradeUIAPI|upgradeCoreAPI|checkUIUpdate|autoUpgradeDashboard|autoUpgradeCore|checkUpgradeCore|isCoreUpdateAvailable/u,
  )
  assert.doesNotMatch(
    shippedSources,
    /api\.github\.com\/repos\/(?:Zephyruso\/zashboard|MetaCubeX\/mihomo)\/releases/u,
  )
  assert.equal(existsSync(`${root}/src/components/settings/backend/UpgradeCoreModal.vue`), false)
})

test('safe runtime maintenance actions remain available', () => {
  const api = source('src/api/clash.ts')
  const actions = source('src/composables/backendActions.ts')
  const backend = source('src/components/settings/backend/BackendSettings.vue')

  assert.match(api, /axios\.post\('\/restart'\)/u)
  assert.match(api, /axios\.put\('\/configs\?reload=true'/u)
  assert.match(api, /axios\.post\('\/configs\/geo'\)/u)

  // 维护动作已收敛成 composables/backendActions 里的一张表:每个动作在表里必须
  // 既有 i18n 标签,也有紧随其后的 run —— 只留标签而没有处理器等于按钮点了没反应。
  for (const label of [
    'restartCore',
    'reloadConfigs',
    'updateConfigs',
    'updateGeoDatabase',
    'flushDNSCache',
    'flushFakeIP',
  ]) {
    const labelIndex = actions.indexOf(`label: '${label}'`)
    assert.ok(labelIndex >= 0, `${label} is not in the backend action table`)
    const runIndex = actions.indexOf('run: ', labelIndex)
    assert.ok(
      runIndex > labelIndex && runIndex - labelIndex < 500,
      `${label} has no action handler`,
    )
  }

  // 表建好了但没有入口渲染它,等于动作也不可达。
  assert.match(backend, /v-for="action in backendActions"/u)
  assert.match(backend, /@click="action\.run\(\)"/u)
})

test('upgrade suppression is a product boundary, not a backend flag', () => {
  const handoff = source('src/helper/setupHandoff.ts')
  const backendType = source('src/types/index.d.ts')
  const form = source('src/components/settings/backend/BackendForm.vue')
  const manager = source('src/components/settings/backend/BackendManager.vue')

  for (const text of [handoff, backendType, form, manager]) {
    assert.doesNotMatch(text, /disableUpgradeCore/u)
  }
})

test('no locale carries self-upgrade vocabulary', () => {
  // 文案是自升级入口最容易悄悄溜回来的一条路:组件删干净了,但上游合并把
  // i18n 键带了回来,下一次谁加个按钮就直接有现成翻译,边界就这么没了。
  // 反过来说,键不在,任何复活的入口都会渲染出原始 key —— 一眼可见。
  const removed = [
    'upgradeDashboard',
    'upgradeCore',
    'upgradeCoreConfirm',
    'upgradeToRelease',
    'upgradeToAlpha',
    'checkCoreUpgrade',
    'autoUpgradeDashboard',
    'autoUpgradeCore',
    'upgradeSuccess',
    'settingsSectionCoreUpdates',
  ]

  for (const locale of ['en', 'ru', 'zh', 'zh-tw']) {
    const text = source(`src/i18n/${locale}.ts`)
    for (const key of removed) {
      assert.doesNotMatch(text, new RegExp(`^ {2}${key}:`, 'mu'), `${locale}.ts still defines ${key}`)
    }
  }
})
