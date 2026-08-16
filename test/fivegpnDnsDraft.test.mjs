import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  cloneWholeDocument,
  wholeDocumentChanged,
} from '../src/helper/wholeDocumentDraft.ts'

test('editable DNS fields remain isolated while installation coordinates round-trip unchanged', () => {
  const base = {
    gateway: '192.0.2.1',
    upstreams: { china: ['https://china.example/dns-query'], trust: ['tls://1.1.1.1'] },
    policy: { fallback: 'auto', rules: [] },
  }
  const draft = cloneWholeDocument(base)

  draft.upstreams.ecs = '112.96.32.0/24'
  draft.upstreams.trust.push('https://trust.example/dns-query')
  draft.policy.fallback = 'gateway'

  assert.equal(wholeDocumentChanged(base, draft), true)
  assert.equal(draft.gateway, base.gateway)
  assert.equal(base.gateway, '192.0.2.1')
  assert.equal(base.upstreams.ecs, undefined)
  assert.deepEqual(base.upstreams.trust, ['tls://1.1.1.1'])

  const discarded = cloneWholeDocument(base)
  assert.equal(wholeDocumentChanged(base, discarded), false)
})

test('DNS settings expose one explicit whole-document save boundary', () => {
  const source = readFileSync(
    new URL('../src/components/settings/fivegpn/FiveGPNDnsSettings.vue', import.meta.url),
    'utf8',
  )

  assert.equal((source.match(/saveDns\(/gu) ?? []).length, 1)
  assert.doesNotMatch(source, /@change="apply"/u)
  assert.doesNotMatch(source, /\bconst apply\b|\bapply\(\)/u)
  assert.match(source, /@click="saveDraft"/u)
  assert.match(source, /@click="discardDraft"/u)
  assert.match(source, /saveDns\(draft\.value, draftRevision\.value\)/u)
  assert.match(source, /<fieldset[\s\S]*?:disabled="saving"/u)
  assert.match(source, /const saveStateTitle = computed/u)
  assert.match(source, /sticky top-2/u)
  assert.match(source, /v-if="dnsWriteConflict"[\s\S]*?discardConflict/u)

  const gatewayRow = source.match(
    /<SettingItem :setting-key="k\.fivegpnDnsGateway">(?<body>[\s\S]*?)<\/SettingItem>/u,
  )?.groups?.body
  assert.ok(gatewayRow, 'gateway settings row is missing')
  assert.match(gatewayRow, /draft\.gateway/u)
  assert.match(gatewayRow, /fivegpnGatewayHint/u)
  assert.doesNotMatch(gatewayRow, /<(?:input|select|textarea)\b|v-model=/u)
})
