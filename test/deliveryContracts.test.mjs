import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { allStylesheets } from './stylesheets.mjs'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('DOMPurify is pinned to the patched direct dependency', () => {
  const packageJSON = JSON.parse(source('package.json'))
  const lock = source('pnpm-lock.yaml')

  assert.equal(packageJSON.dependencies.dompurify, '^3.4.13')
  assert.match(lock, /dompurify@3\.4\.13:/u)
  assert.doesNotMatch(lock, /dompurify@3\.4\.12:/u)
})

test('release delivery has one local MiSans text-font variant', () => {
  const packageJSON = JSON.parse(source('package.json'))
  const loader = source('src/assets/load-fonts.ts')
  const styles = allStylesheets()
  const deploy = source('.github/workflows/deploy.yml')
  const release = source('.github/workflows/5gpn-release.yml')

  assert.equal(packageJSON.dependencies['@fontsource/fira-sans'], undefined)
  assert.equal(packageJSON.dependencies.misans, undefined)
  assert.match(loader, /subsetted-fonts\/MiSans-VF\/MiSans-VF\.css/u)
  assert.doesNotMatch(loader, /unpkg|Fira|PingFang|Sarasa/u)
  assert.doesNotMatch(styles, /Fira|PingFang|Sarasa/u)
  assert.doesNotMatch(deploy, /matrix\.font|cdn-fonts|firasans|pingfang|sarasa|FONT:/iu)
  assert.doesNotMatch(release, /FONT:/u)
  assert.match(deploy, /if:\s*github\.repository == 'Zephyruso\/zashboard'/u)
  assert.doesNotMatch(release, /workflow_dispatch:/u)
  assert.match(release, /refs\/remotes\/origin\/feat\/5gpn-console/u)
  assert.match(release, /tagged_commit.*event_commit/us)
  assert.match(release, /Release existence check returned HTTP/u)
  assert.match(release, /make_latest:\s*false/u)
  assert.match(release, /draft:\s*true/u)
  assert.match(release, /steps\.release_draft\.outputs\.id/u)
  assert.match(release, /gh api --method PATCH[\s\S]*-F draft=false[\s\S]*-f make_latest=false/u)
  assert.match(release, /\.immutable == true/u)
  assert.doesNotMatch(release, /^\s*-?\s*uses:\s*[^\s]+@v\d+/mu)
})

test('build output gate covers initial, lazy, CSS, and font budgets', () => {
  const vite = source('vite.config.ts')
  const checker = source('scripts/check-built-output.mjs')

  assert.match(vite, /manifest:\s*true/u)
  for (const key of [
    'initialJavaScript',
    'largestLazyJavaScript',
    'stylesheets',
    'fonts',
  ]) {
    assert.match(checker, new RegExp(`${key}:`))
  }
  assert.match(checker, /non-MiSans text font/u)
})

test('index is compatible with a self-only script policy', () => {
  const index = source('index.html')
  const bootstrap = source('src/bootstrap.ts')

  assert.doesNotMatch(index, /<script(?![^>]*\bsrc=)[^>]*>/iu)
  assert.match(bootstrap, /favicon-dark\.svg/u)
})
