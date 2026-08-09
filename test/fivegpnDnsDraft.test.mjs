import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  cloneWholeDocument,
  wholeDocumentChanged,
} from '../src/helper/wholeDocumentDraft.ts'

test('a multi-field DNS edit remains one isolated draft until explicitly discarded or saved', () => {
  const base = {
    gateway: '192.0.2.1',
    upstreams: { china: ['https://china.example/dns-query'], trust: ['tls://1.1.1.1'] },
    policy: { fallback: 'auto', rules: [] },
  }
  const draft = cloneWholeDocument(base)

  draft.gateway = '192.0.2.2'
  draft.upstreams.trust.push('https://trust.example/dns-query')
  draft.policy.fallback = 'gateway'

  assert.equal(wholeDocumentChanged(base, draft), true)
  assert.equal(base.gateway, '192.0.2.1')
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
})
