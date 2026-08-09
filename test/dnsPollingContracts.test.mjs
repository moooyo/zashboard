import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/assembly/fivegpn/dns.ts', import.meta.url), 'utf8')

test('one-second DNS sampling uses the lightweight stats endpoint', () => {
  const statsSampler = source.slice(
    source.indexOf('const sampleOnce ='),
    source.indexOf('const sampleSubscriptionsOnce ='),
  )
  assert.match(statsSampler, /fetchDnsStatsAPI\(signal\)/u)
  assert.doesNotMatch(statsSampler, /fetchDnsAPI\(/u)
  assert.match(source, /setInterval\(\(\) => void sampleOnce\(\), 1000\)/u)
})

test('subscription status has an independent low-frequency single-flight sampler', () => {
  assert.match(source, /const SUBSCRIPTION_SAMPLE_INTERVAL = 30000/u)
  assert.match(source, /new SingleFlightRequest<FiveGPNSubscriptionStatus\[\]>/u)
  assert.match(source, /startDnsSubscriptionSampling/u)
  assert.match(source, /stopDnsSubscriptionSampling/u)
})
