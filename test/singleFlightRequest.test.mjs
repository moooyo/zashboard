import assert from 'node:assert/strict'
import test from 'node:test'

import { SingleFlightRequest } from '../src/helper/singleFlightRequest.ts'

test('single-flight request shares one in-flight operation', async () => {
  const gate = new SingleFlightRequest()
  let calls = 0
  let finish
  const values = []
  const request = () => {
    calls += 1
    return new Promise((resolve) => {
      finish = resolve
    })
  }

  const first = gate.run(request, (value) => values.push(value))
  const second = gate.run(request, (value) => values.push(value))
  assert.equal(first, second)
  assert.equal(calls, 1)
  finish('latest')
  await first
  assert.deepEqual(values, ['latest'])
})

test('cancel fences a late response and permits the next request immediately', async () => {
  const gate = new SingleFlightRequest()
  const resolvers = []
  const values = []
  const request = () => new Promise((resolve) => resolvers.push(resolve))

  const stale = gate.run(request, (value) => values.push(value))
  gate.cancel()
  const current = gate.run(request, (value) => values.push(value))
  resolvers[0]('stale')
  resolvers[1]('current')
  await Promise.all([stale, current])
  assert.deepEqual(values, ['current'])
})
