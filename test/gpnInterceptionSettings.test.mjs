import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { interceptionSettingsWrite } from '../src/api/gpnInterceptionSettings.ts'

test('interception settings writes omit the read-only HTTP/3 snapshot field', () => {
  const body = interceptionSettingsWrite({
    revision: 'revision-1',
    enabled: true,
    http2: true,
    http3: true,
  })

  assert.deepEqual(body, {
    revision: 'revision-1',
    enabled: true,
    http2: true,
  })
  assert.equal('http3' in body, false)
})

test('interception settings render HTTP/3 as fixed policy, not a control', () => {
  const source = readFileSync(
    new URL('../src/components/settings/gpn/GpnInterceptionSettings.vue', import.meta.url),
    'utf8',
  )
  const row = source.match(
    /<SettingItem :setting-key="k\.gpnHttp3">(?<content>[\s\S]*?)<\/SettingItem>/,
  )

  assert.ok(row?.groups?.content, 'the fixed HTTP/3 policy row is missing')
  assert.match(row.groups.content, /data-testid="gpn-http3-boundary"/)
  assert.match(row.groups.content, /\$t\('gpnHttp3Unavailable'\)/)
  assert.match(row.groups.content, /\$t\('gpnHttp3Blocked'\)/)
  assert.doesNotMatch(row.groups.content, /<input|<select|@change|v-model|:checked/)
})

test('interception snapshot exposes the fixed protocol boundary and narrow egress groups', () => {
  const api = readFileSync(new URL('../src/api/gpn.ts', import.meta.url), 'utf8')
  const extensions = readFileSync(
    new URL('../src/views/GpnExtensionsPage.vue', import.meta.url),
    'utf8',
  )

  assert.match(api, /http3:\s*false/)
  assert.match(api, /available_egress_groups:\s*string\[\]/)
  assert.match(extensions, /v-for="group in data\.available_egress_groups"/)
  assert.doesNotMatch(extensions, /import\s*\{[^}]*proxyGroupList[^}]*\}/s)
})
