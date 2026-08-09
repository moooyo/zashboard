import assert from 'node:assert/strict'
import test from 'node:test'

import { BackendSessionTracker } from '../src/helper/backendSession.ts'
import { PausedBuffer } from '../src/helper/pausedBuffer.ts'
import { SerialRevisionWriter } from '../src/helper/serialRevisionWriter.ts'

const backend = (overrides = {}) => ({
  uuid: 'backend-1',
  type: 'clash',
  protocol: 'https',
  host: 'console.example.com',
  port: '443',
  secondaryPath: '',
  password: 'first-secret',
  authMode: 'secret',
  ...overrides,
})

test('editing connection fields on the same backend UUID advances and aborts the session', () => {
  const tracker = new BackendSessionTracker()
  const first = tracker.update(backend())
  assert.ok(first)
  assert.equal(first.signal.aborted, false)

  assert.equal(tracker.update(backend()), first, 'an identical configuration keeps its session')

  const second = tracker.update(backend({ password: 'rotated-secret' }))
  assert.ok(second)
  assert.equal(first.signal.aborted, true)
  assert.equal(second.signal.aborted, false)
  assert.equal(second.uuid, first.uuid)
  assert.ok(second.epoch > first.epoch)
  assert.notEqual(second.configHash, first.configHash)

  tracker.update(null)
  assert.equal(second.signal.aborted, true)
})

test('whole-document writes serialize and chain only revisions produced by their own session', async () => {
  const writer = new SerialRevisionWriter()
  const calls = []
  let finishFirst
  const firstReply = new Promise((resolve) => {
    finishFirst = resolve
  })

  const first = writer.enqueue({
    sessionKey: '9',
    baseRevision: 'r1',
    value: { gateway: '192.0.2.1' },
    isCurrent: () => true,
    write: async (revision, value) => {
      calls.push({ revision, value })
      return firstReply
    },
  })
  const second = writer.enqueue({
    sessionKey: '9',
    baseRevision: 'r1',
    value: { gateway: '192.0.2.2' },
    isCurrent: () => true,
    write: async (revision, value) => {
      calls.push({ revision, value })
      return { status: 'saved', revision: 'r3', response: { revision: 'r3' } }
    },
  })

  await Promise.resolve()
  assert.deepEqual(calls, [{ revision: 'r1', value: { gateway: '192.0.2.1' } }])
  finishFirst({ status: 'saved', revision: 'r2', response: { revision: 'r2' } })

  assert.equal((await first).status, 'saved')
  assert.equal((await second).status, 'saved')
  assert.deepEqual(calls, [
    { revision: 'r1', value: { gateway: '192.0.2.1' } },
    { revision: 'r2', value: { gateway: '192.0.2.2' } },
  ])
})

test('a revision conflict fences later writes and returns the newest attempted draft', async () => {
  const writer = new SerialRevisionWriter()
  let calls = 0
  const first = writer.enqueue({
    sessionKey: '11',
    baseRevision: 'r1',
    value: { fallback: 'direct' },
    isCurrent: () => true,
    write: async () => {
      calls += 1
      return { status: 'conflict', serverRevision: 'external-r2' }
    },
  })
  const latestDraft = { fallback: 'gateway' }
  const second = writer.enqueue({
    sessionKey: '11',
    baseRevision: 'r1',
    value: latestDraft,
    isCurrent: () => true,
    write: async () => {
      calls += 1
      return { status: 'saved', revision: 'never', response: {} }
    },
  })

  assert.equal((await first).status, 'conflict')
  const outcome = await second
  assert.equal(outcome.status, 'conflict')
  assert.deepEqual(outcome.attempted, latestDraft)
  assert.equal(calls, 1, 'the fenced queue does not overwrite the external revision')
})

test('paused log buffering reports count and drains newest-first without discarding entries', () => {
  const buffer = new PausedBuffer()
  buffer.push('first')
  buffer.push('second')
  buffer.push('third')
  assert.equal(buffer.count, 3)
  assert.deepEqual(buffer.drain(), ['third', 'second', 'first'])
  assert.equal(buffer.count, 0)
})
