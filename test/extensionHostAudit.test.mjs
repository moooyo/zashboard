import assert from 'node:assert/strict'
import test from 'node:test'

import { capturePatternMatches, extensionEgressWinner } from '../src/helper/extensionHostAudit.ts'

const module = (id, enabled, hosts, egress) => ({
  id,
  enabled,
  capture_hosts: hosts,
  egress_group: egress,
})

test('capture wildcard matches subdomains but not its apex', () => {
  assert.equal(capturePatternMatches('*.example.com', 'api.example.com'), true)
  assert.equal(capturePatternMatches('*.example.com', 'example.com'), false)
})

test('egress winner follows enabled extension execution order', () => {
  const modules = [
    module('later', true, ['api.example.com'], 'Group B'),
    module('first', true, ['*.example.com'], 'Group A'),
    module('disabled', false, ['api.example.com'], 'DIRECT'),
  ]
  const winner = extensionEgressWinner(modules, ['disabled', 'first', 'later'], 'api.example.com')
  assert.equal(winner.id, 'first')
  assert.equal(winner.egress_group, 'Group A')
})
