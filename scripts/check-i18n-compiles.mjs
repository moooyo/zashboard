#!/usr/bin/env node
// Every locale message must compile.
//
// A single message broke an entire page: the upstream help text spelled out
// `serverName@IP is DoT`, and @ is vue-i18n's linked-message syntax. Compiling
// it throws INVALID_LINKED_FORMAT, the throw happens during render, and the DNS
// page came up blank with `SyntaxError: 10` in the console -- a number, because
// the compiler's messages are stripped from production builds.
//
// Nothing caught it. It is valid TypeScript, it lints, it typechecks, it ships,
// and the page that renders it is the only place it fails. The literal escape
// is {'@'}.
//
// This compiles every string in every locale with the same compiler and a
// throwing onError, which is what vue-i18n does at runtime. It is not a lint
// for @ specifically -- it is the actual compiler, so it also catches unbalanced
// braces, bad placeholders, and whatever the next one turns out to be.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// @intlify/message-compiler is vue-i18n's own dependency, not ours, so under
// pnpm's strict layout it is not resolvable from the project root. Resolve it
// through vue-i18n so this uses exactly the compiler the app will use, without
// adding a dependency whose version could drift from it.
const require = createRequire(import.meta.url)
const { baseCompile } = require(
  require.resolve('@intlify/message-compiler', {
    paths: [require.resolve('vue-i18n')],
  }),
)

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const I18N = join(ROOT, 'src', 'i18n')

const locales = readdirSync(I18N).filter((f) => f.endsWith('.ts') && f !== 'index.ts')
const failures = []
let checked = 0

for (const file of locales) {
  const source = readFileSync(join(I18N, file), 'utf8')
  // The locale modules are plain object literals with a default export. Import
  // them rather than parsing: a regex over quoted strings would miss the
  // wrapped ones, which is exactly how the broken message was missed by eye.
  const mod = await import(pathToFileURL(join(I18N, file)).href)
  const messages = mod.default ?? mod
  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key
      if (value && typeof value === 'object') {
        walk(value, here)
        continue
      }
      if (typeof value !== 'string') continue
      checked++
      try {
        baseCompile(value, {
          onError: (e) => {
            throw e
          },
        })
      } catch (e) {
        failures.push(`${file}: ${here}: code ${e.code ?? '?'} — ${JSON.stringify(value.slice(0, 90))}`)
      }
    }
  }
  walk(messages, '')
  void source
}

if (failures.length) {
  console.error('locale messages that vue-i18n cannot compile:')
  for (const f of failures) console.error(`  ${f}`)
  console.error(
    "\nvue-i18n reads @ as a linked message and { } as a placeholder. Escape a literal one as {'@'}.",
  )
  process.exit(1)
}
console.log(`ok: ${checked} messages across ${locales.length} locales compile`)
