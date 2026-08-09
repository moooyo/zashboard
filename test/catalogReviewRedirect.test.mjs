import assert from 'node:assert/strict'
import test from 'node:test'

import { catalogUpdateBody } from '../src/helper/catalogReview.ts'

test('catalog apply preserves the opaque reviewed URL after a redirect', () => {
  const candidate = {
    digest: 'sha256:snapshot',
    detail: { source_url: 'https://cdn.example/releases/entry.yaml' },
  }
  const body = catalogUpdateBody(
    'revision-1',
    candidate,
    'https://catalog.example/entry.yaml',
  )
  assert.equal(body.url, 'https://catalog.example/entry.yaml')
  assert.notEqual(body.url, candidate.detail.source_url)
})
