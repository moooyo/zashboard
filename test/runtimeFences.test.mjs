import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const dns = readFileSync(new URL('../src/assembly/fivegpn/dns.ts', import.meta.url), 'utf8')
const accumulator = readFileSync(
  new URL('../src/assembly/logs/accumulator.ts', import.meta.url),
  'utf8',
)
const logs = readFileSync(new URL('../src/assembly/logs/index.ts', import.meta.url), 'utf8')
const bot = readFileSync(new URL('../src/assembly/fivegpn/bot.ts', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/views/SettingsPage.vue', import.meta.url), 'utf8')

test('DNS writes fence reads from before and during the transaction', () => {
  const write = dns.match(/write: async \(revision, value\) => \{[\s\S]*?\n\s+\},\n\s+\}\)/u)?.[0]
  assert.ok(write, 'DNS write callback is missing')
  const put = write.indexOf('putDnsAPI')
  assert.ok(write.indexOf('cancelDnsRead()') >= 0 && write.indexOf('cancelDnsRead()') < put)
  assert.ok(write.indexOf('cancelDnsRead()', put) > put)
})

test('DNS resolve diagnostics use a cancellable session fence', () => {
  const explain = dns.match(/export const explain = async[\s\S]*?\n\}/u)?.[0]
  assert.ok(explain, 'DNS explain action is missing')
  assert.match(explain, /resolveTestAPI\(name, requestController\.signal\)/u)
  assert.match(explain, /if \(stale\(\)\) return/u)
  assert.match(dns, /explainController\?\.abort\(\)/u)
})

test('pausing ordinary logs flushes and cancels a pending trailing publication', () => {
  assert.match(accumulator, /pause: \(\) => \{[\s\S]*flush\.flush\(\)[\s\S]*flush\.cancel\(\)/u)
  assert.match(logs, /if \(paused\) pauseAccumulator\?\.\(\)/u)
})

test('bot writes fence reads and Settings computed state performs no network side effect', () => {
  const start = bot.indexOf('export const saveBot = async')
  const end = bot.indexOf('\nexport const stopBot', start)
  assert.ok(start >= 0 && end > start, 'bot save action is missing')
  const save = bot.slice(start, end)
  const put = save.indexOf('putBotAPI')
  assert.ok(save.indexOf('cancelBotRead()') >= 0 && save.indexOf('cancelBotRead()') < put)
  assert.ok(save.indexOf('cancelBotRead()', put) > put)
  assert.doesNotMatch(settings, /refreshBot|refreshInterception/u)
})
