import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { twMerge } from '../lib/cn.ts'

const SRC = fileURLToPath(new URL('..', import.meta.url))
const THEME = readFileSync(new URL('./theme.css', import.meta.url), 'utf8')
const SOURCE_EXTENSIONS = new Set(['.css', '.js', '.jsx', '.ts', '.tsx', '.vue'])

const sourceFiles = (root) => {
  const files = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path)
  }
  return files
}

const occurrences = (pattern) => {
  const failures = []
  for (const path of sourceFiles(SRC)) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(pattern)) {
      failures.push(`${relative(SRC, path)}: ${match[0]}`)
    }
  }
  return failures
}

test('theme owns the named type, radius, control, and tint scales', () => {
  const typeSteps = ['caption', 'label', 'body-sm', 'body', 'title-sm', 'title', 'display']
  const radiusSteps = ['xs', 'sm', 'md', 'lg', 'xl']
  const controlSteps = ['xs', 'sm', 'md', 'lg', 'xl']

  for (const step of typeSteps) assert.match(THEME, new RegExp(`--text-${step}:`))
  for (const step of radiusSteps) assert.match(THEME, new RegExp(`--radius-${step}:`))
  for (const step of controlSteps) {
    assert.match(THEME, new RegExp(`--spacing-control-${step}:`))
  }
  assert.match(THEME, /--text-caption:\s*0\.6875rem;/u)
  assert.match(THEME, /--color-tint-soft:/u)
  assert.match(THEME, /--color-tint-strong:/u)
})

test('source does not bypass the named scale with arbitrary literals', () => {
  const violations = [
    ...occurrences(/\btext-\[(?:\d+(?:\.\d+)?)(?:px|rem)\]/gu),
    ...occurrences(/\brounded-\[(?:\d+(?:\.\d+)?)(?:px|rem)\]/gu),
    ...occurrences(/\bfontSize:\s*(?:[0-9]|10),/gu),
  ]

  for (const path of sourceFiles(SRC)) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(
      /(?:^|\s)-?(?:p|m|gap)(?:[trblxy])?-\[(\d+(?:\.\d+)?)(px|rem)\]/gu,
    )) {
      const pixels = Number(match[1]) * (match[2] === 'rem' ? 16 : 1)
      if (pixels % 4 !== 0) violations.push(`${relative(SRC, path)}: ${match[0].trim()}`)
    }
  }

  assert.deepEqual(violations, [])
})

test('design-system controls use named heights and mobile-first stepping', () => {
  const violations = []
  for (const path of sourceFiles(join(SRC, 'components'))) {
    const normalized = relative(SRC, path).replaceAll('\\', '/')
    const source = readFileSync(path, 'utf8')
    if (normalized.startsWith('components/ds/')) {
      for (const match of source.matchAll(
        /\b(?:h-(?:8|9|10|11|12)\b|h-\[(?:32|36|40|44|48)px\])/gu,
      )) {
        violations.push(`${normalized}: ${match[0]}`)
      }
    }
    for (const match of source.matchAll(/\bsm:h-control-(?:xs|sm|md|lg|xl)\b/gu)) {
      violations.push(`${normalized}: ${match[0]}`)
    }
  }
  assert.deepEqual(violations, [])
})

test('tailwind merging recognizes named tokens without stripping colour', () => {
  assert.equal(twMerge('text-xs text-caption'), 'text-caption')
  assert.deepEqual(new Set(twMerge('text-error text-caption').split(' ')), new Set(['text-error', 'text-caption']))

  const directImports = occurrences(/from ['"]tailwind-merge['"]/gu).filter(
    (entry) => !entry.startsWith('lib\\cn.ts:') && !entry.startsWith('lib/cn.ts:'),
  )
  assert.deepEqual(directImports, [])
})

test('sidebar active state has no geometry measurement or sliding indicator', () => {
  const sidebar = readFileSync(new URL('../components/sidebar/SideBar.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(sidebar, /getBoundingClientRect|ResizeObserver|tab-indicator/u)
  assert.match(sidebar, /aria-current/u)
})
