import assert from 'node:assert/strict'
import test from 'node:test'

import { createSocketMessageDispatch } from '../src/helper/socketMessageDispatch.ts'

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

test('closing a delayed socket dispatch prevents stale publication', async () => {
  const values = []
  const dispatch = createSocketMessageDispatch((value) => values.push(value), false, 5)
  dispatch.handler('stale')
  dispatch.cancel()
  await delay(15)
  assert.deepEqual(values, [])
})

test('log socket dispatch remains immediate', () => {
  const values = []
  const dispatch = createSocketMessageDispatch((value) => values.push(value), true, 5)
  dispatch.handler('live')
  assert.deepEqual(values, ['live'])
})
