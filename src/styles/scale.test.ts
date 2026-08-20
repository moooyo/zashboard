import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { twMerge } from '../lib/cn.ts'

const SRC = fileURLToPath(new URL('..', import.meta.url))
const SELF = fileURLToPath(import.meta.url)
const THEME = readFileSync(new URL('./theme.css', import.meta.url), 'utf8')
const SOURCE_EXTENSIONS = new Set(['.css', '.js', '.jsx', '.ts', '.tsx', '.vue'])

// 这个文件本身必须排除在扫描之外：它保存着违规样式的正则和下面那张例外清单，
// 逐字写着被禁的字面量。扫描自己只会让守卫抓到自己 —— 边界说明反而成了违规证据。
const sourceFiles = (root) => {
  const files = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    else if (SOURCE_EXTENSIONS.has(extname(entry.name)) && path !== SELF) files.push(path)
  }
  return files
}

const label = (path) => relative(SRC, path).replaceAll('\\', '/')

const occurrences = (pattern) => {
  const failures = []
  for (const path of sourceFiles(SRC)) {
    const source = readFileSync(path, 'utf8')
    for (const match of source.matchAll(pattern)) {
      failures.push(`${label(path)}: ${match[0]}`)
    }
  }
  return failures
}

// 上游自带的字面量。这些文件是上游的功能代码（地球仪、Tailscale 面板、节点预览），
// 我们不拥有它们的视觉细节；为了这几个值去改上游文件，只会白白增加合并冲突面。
//
// 但也不能整体把上游目录排除掉 —— 那样守卫就只剩下自己人互相监督了。所以这里
// 逐条登记：条目是「路径: 字面量」的精确匹配，上游哪天把 10px 改成 9px，就会重新
// 报出来让我们再判断一次。下面还会断言每条例外都仍然真实存在，过期条目同样失败，
// 免得这张清单烂成一张只会放行的白名单。
const KNOWN_UPSTREAM_LITERALS = [
  'components/overview/EarthGlobeCard.vue: text-[10px]',
  'components/overview/earth/cityLabelLayer.ts: text-[10px]',
  'components/tools/TailscalePanel.vue: text-[0.65rem]',
  'components/proxies/ProxyPreview.vue: rounded-[2px]',
]

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
  const found = [
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
      if (pixels % 4 !== 0) found.push(`${label(path)}: ${match[0].trim()}`)
    }
  }

  const known = new Set(KNOWN_UPSTREAM_LITERALS)
  assert.deepEqual(
    found.filter((entry) => !known.has(entry)),
    [],
  )

  // 例外清单不许烂掉：上游把某个字面量改掉或删掉之后，对应条目必须一起消失，
  // 否则这张清单会慢慢变成一张永远只放行、不再复核的白名单。
  assert.deepEqual(
    KNOWN_UPSTREAM_LITERALS.filter((entry) => !found.includes(entry)),
    [],
    'stale entries in KNOWN_UPSTREAM_LITERALS',
  )
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
