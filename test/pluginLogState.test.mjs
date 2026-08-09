import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mergePluginLogPage,
  pluginLogsAfter,
  pluginLogsSince,
  toggleExpandedPluginLog,
  validPluginLogPage,
  validPluginLogCursor,
} from '../src/helper/pluginLogState.ts'

test('only one plugin log row is expanded at a time', () => {
  assert.equal(toggleExpandedPluginLog('', '7'), '7')
  assert.equal(toggleExpandedPluginLog('7', '9'), '9')
  assert.equal(toggleExpandedPluginLog('9', '9'), '')
})

const entry = (seq, message) => ({
  seq,
  time: `2026-08-09T00:00:0${seq}Z`,
  message,
  level: 'info',
  source: 'engine',
})
const page = (overrides = {}) => ({
  logs: [entry('1', 'first')],
  stream_id: 'stream-a',
  oldest_seq: '1',
  latest_seq: '1',
  dropped: '0',
  reset: false,
  ...overrides,
})

test('cursor pages append once and preserve opaque decimal cursors', () => {
  const initial = mergePluginLogPage({ entries: [], streamID: '', page: page(), limit: 1000 })
  const next = mergePluginLogPage({
    entries: initial.entries,
    streamID: initial.streamID,
    page: page({ logs: [entry('2', 'second')], latest_seq: '2' }),
    limit: 1000,
  })
  assert.deepEqual(next.entries.map((item) => item.seq), ['1', '2'])
  assert.equal(next.cursor, '2')
  assert.equal(next.reset, false)
})

test('a full filtered page advances after to its last event without numeric conversion', () => {
  const result = mergePluginLogPage({
    entries: [],
    streamID: 'stream-a',
    page: page({
      logs: [entry('9007199254740992', 'large cursor')],
      oldest_seq: '9007199254740992',
      latest_seq: '9007199254740993',
    }),
    limit: 1,
  })
  assert.equal(result.cursor, '9007199254740992')
  assert.equal(result.hasMore, true)
})

test('stream reset replaces stale entries instead of merging generations', () => {
  const result = mergePluginLogPage({
    entries: [entry('8', 'old process')],
    streamID: 'old-stream',
    page: page({ stream_id: 'new-stream', reset: true }),
    limit: 1000,
  })
  assert.deepEqual(result.entries.map((item) => item.message), ['first'])
  assert.equal(result.reset, true)
})

test('clear watermark and paused count use stream and cursor identity', () => {
  const entries = [entry('2', 'second'), entry('3', 'third')]
  assert.deepEqual(pluginLogsAfter(entries, 'stream-a', { streamID: 'stream-a', seq: '2' }), [
    entries[1],
  ])
  assert.deepEqual(pluginLogsAfter(entries, 'stream-b', { streamID: 'stream-a', seq: '2' }), entries)
  assert.equal(
    pluginLogsSince({
      entries,
      liveStreamID: 'stream-a',
      frozenStreamID: 'stream-a',
      frozenSeq: '2',
    }),
    1,
  )
})

test('cursor envelope accepts canonical decimal strings and rejects numbers', () => {
  assert.equal(validPluginLogCursor('18446744073709551615'), true)
  assert.equal(validPluginLogCursor('18446744073709551616'), false)
  assert.equal(validPluginLogCursor('999999999999999999999'), false)
  assert.equal(validPluginLogPage(page()), true)
  assert.equal(validPluginLogPage(page({ latest_seq: 1 })), false)
  assert.equal(validPluginLogPage(page({ latest_seq: '01' })), false)
  assert.equal(validPluginLogPage(page({ oldest_seq: '0', latest_seq: '1' })), false)
  assert.equal(
    validPluginLogPage(page({ logs: [entry('2', 'second'), entry('1', 'first')], latest_seq: '2' })),
    false,
  )
})
