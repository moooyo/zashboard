import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  hasVisibleMapIntersection,
  locationSearchQueryTooLong,
  tileBatchHasFailure,
} from '../src/helper/fivegpnLocation.ts'

const api = readFileSync(new URL('../src/api/fivegpn.ts', import.meta.url), 'utf8')
const editor = readFileSync(
  new URL('../src/components/fivegpn/FiveGPNLocationEditor.vue', import.meta.url),
  'utf8',
)
const packageJSON = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const leafletLicense = readFileSync(
  new URL('../public/third-party/leaflet-LICENSE.txt', import.meta.url),
  'utf8',
)
const reviewMock = readFileSync(
  new URL('../scripts/mock-review-server.mjs', import.meta.url),
  'utf8',
)
const template = editor.match(/<template>(?<body>[\s\S]*?)<\/template>/u)?.groups?.body ?? ''

test('location search uses the authenticated POST endpoint and keeps the query out of the URL', () => {
  assert.match(
    api,
    /axios\.post<FiveGPNLocationSearchResponse>\('\/5gpn\/interception\/location\/search', body,/u,
  )
  assert.match(api, /body: \{ query: string; language: string \}/u)
  assert.doesNotMatch(api, /axios\.get[^\n]*\/5gpn\/interception\/location\/search/u)
  assert.match(editor, /\{ query, language: String\(locale\.value\) \}/u)
})

test('location editor loads one local Leaflet runtime and only the OSM Standard tile layer', () => {
  assert.equal(packageJSON.dependencies.leaflet, '1.9.4')
  assert.match(editor, /import\('leaflet\/dist\/leaflet\.css'\)/u)
  assert.match(editor, /import\('leaflet'\)/u)
  assert.match(editor, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/u)
  assert.match(editor, /minZoom: 2/u)
  assert.match(editor, /maxZoom: 19/u)
  assert.match(editor, /OpenStreetMap<\/a> contributors/u)
  assert.match(editor, /scrollWheelZoom: false/u)
  assert.match(editor, /worldCopyJump: true/u)
  assert.match(editor, /const wrapped = point\.wrap\(\)/u)
  assert.doesNotMatch(editor, /noWrap: true/u)
  assert.match(editor, /keepBuffer: 0/u)
  assert.match(editor, /nextLayer\.on\('tileload'/u)
  assert.match(editor, /tileBatchHasFailure\(failedTiles\)/u)
  assert.match(editor, /const TILE_LOAD_TIMEOUT = 15000/u)
  assert.match(
    editor,
    /window\.setTimeout\([\s\S]*?mapError\.value = 'tiles'[\s\S]*?TILE_LOAD_TIMEOUT/u,
  )
  assert.match(
    editor,
    /else if \(loadedTiles > 0 && mapError\.value !== 'tiles'\)[\s\S]*?mapError\.value = ''/u,
  )
  assert.match(editor, /const retryMap[\s\S]*?mapError\.value = ''/u)
  assert.match(editor, /accuracyCircle\.getBounds\(\)[\s\S]*?maxZoom: 17/u)
  assert.match(editor, /recenter && markerWasCreated[\s\S]*?fitCoordinatePrecision\(\)/u)
  assert.match(editor, /new IntersectionObserver/u)
  assert.doesNotMatch(editor, /onMounted\(\(\) => void initializeMap\(\)\)/u)
  assert.match(editor, /keyboard: false/u)
  assert.match(editor, /zoomControl\?\.remove\(\)/u)
  assert.doesNotMatch(editor, /Natural Earth|tileLayer\.wms|L\.geoJSON/u)
  assert.match(leafletLicense, /Copyright \(c\) 2010-2023, Volodymyr Agafonkin/u)
  assert.match(leafletLicense, /THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS/u)
})

test('location editor has no legacy silhouette and searches only on Search or Enter', () => {
  assert.match(template, /role="search"/u)
  assert.match(template, /@keydown\.enter="submitSearchFromKeyboard"/u)
  assert.match(template, /type="button"[\s\S]*?@click="searchLocations"/u)
  assert.equal(editor.match(/searchInterceptionLocationAPI\(/gu)?.length, 1)
  assert.match(editor, /if \(event\.isComposing\) return/u)
  assert.match(editor, /locationSearchQueryTooLong\(query\)/u)
  assert.match(editor, /if \(status === 429\)[\s\S]*?searchError\.value = 'rate-limit'/u)
  assert.match(editor, /searchController\.abort\(\)[\s\S]*?searchSubmitted\.value = false/u)
  assert.match(editor, /\(\) => props\.disabled,[\s\S]*?syncCoordinateLayers\(false\)/u)
  assert.match(
    editor,
    /if \(!canPlotCoordinates\.value\)[\s\S]*?removeCoordinateLayers\(\)[\s\S]*?setMapInteractivity\(\)/u,
  )
  assert.doesNotMatch(
    editor,
    /watch\(searchQuery|@input="searchLocations"|@change="searchLocations"/u,
  )
  assert.doesNotMatch(template, /<svg|viewBox="0 0 720 360"|preserveAspectRatio/u)
  assert.doesNotMatch(editor, /coordinate-map|aspect-ratio:\s*2\s*\/\s*1/u)
  assert.match(template, /class="location-map relative z-0 h-72 w-full md:h-80"/u)
})

test('the interactive review mock negotiates interception v5 and serves location search', () => {
  assert.match(reviewMock, /'5gpn-interception': \{ version: 5, owner: 'mihomo' \}/u)
  assert.match(
    reviewMock,
    /request\.method === 'POST'[\s\S]*?\/5gpn\/interception\/location\/search/u,
  )
})

test('location map admission and failure decisions are bounded and executable', () => {
  assert.equal(locationSearchQueryTooLong('中'.repeat(85)), false)
  assert.equal(locationSearchQueryTooLong('中'.repeat(86)), true)
  assert.equal(hasVisibleMapIntersection([{ isIntersecting: false }]), false)
  assert.equal(
    hasVisibleMapIntersection([{ isIntersecting: false }, { isIntersecting: true }]),
    true,
  )
  assert.equal(tileBatchHasFailure(0), false)
  assert.equal(tileBatchHasFailure(1), true)
})
