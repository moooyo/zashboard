import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../src/assembly/fivegpn/pluginLogs.ts', import.meta.url),
  'utf8',
)

test('plugin log search debounces only the local effective query', () => {
  assert.match(source, /export const pluginLogSearchInput = ref\(''\)/u)
  assert.match(source, /const pluginLogSearch = ref\(''\)/u)
  assert.match(source, /debounce\(\(value: string\)[\s\S]*?\}, 200\)/u)
  assert.match(source, /watch\(pluginLogSearchInput, \(value\) => commitPluginLogSearch\(value\)\)/u)
  assert.match(source, /commitPluginLogSearch\.cancel\(\)/u)
  assert.match(source, /const search = pluginLogSearch\.value/u)
  assert.doesNotMatch(source, /fetchEngineLogsAPI\([\s\S]{0,300}contains:/u)
})
