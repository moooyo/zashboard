import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const router = readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8')
const requirements = readFileSync(new URL('../src/router/requirements.ts', import.meta.url), 'utf8')

test('plugin management surfaces have distinct top-level routes', () => {
  for (const path of ['extensions', 'extensions/hosts', 'marketplace', 'plugin-logs']) {
    assert.match(router, new RegExp(`path: ['"]${path.replace('/', '\\/')}['"]`, 'u'))
  }
  assert.doesNotMatch(router, /path:\s*['"]5gpn-extensions['"]/u)
})

test('every plugin route shares the interception capability gate', () => {
  for (const route of [
    'fivegpnExtensions',
    'fivegpnExtensionHosts',
    'fivegpnMarketplace',
    'fivegpnPluginLogs',
  ]) {
    assert.match(
      requirements,
      new RegExp(`ROUTE_NAME\\.${route}\\]: \\{ feature: ['"]5gpn-interception['"] \\}`, 'u'),
    )
  }
  assert.match(router, /routeRequirementSatisfied\(to\.meta\)/u)
})
