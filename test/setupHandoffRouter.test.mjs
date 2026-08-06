import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSetupHandoffSlot,
  installSetupHandoffCapture,
  startSetupHandoff,
  subscribeSetupHandoff,
  takeSetupHandoff,
} from '../src/helper/setupHandoff.ts'

const secret = 'router-state-secret'
const params = new URLSearchParams({
  type: 'clash',
  hostname: 'console.example.com',
  port: '443',
  https: '1',
  secret,
  label: '5gpn',
  disableTunMode: '1',
})

const priorUrl = new URL('https://console.example.com/ui/#/proxies')
const handoffUrl = new URL(`https://console.example.com/ui/#/setup?${params}`)

const listeners = new Map()
const location = {
  assign(url) {
    syncLocation(new URL(String(url), this.href))
  },
  hash: '',
  host: '',
  hostname: '',
  href: '',
  pathname: '',
  port: '',
  protocol: '',
  replace(url) {
    syncLocation(new URL(String(url), this.href))
  },
  search: '',
}

const syncLocation = (url) => {
  Object.assign(location, {
    hash: url.hash,
    host: url.host,
    hostname: url.hostname,
    href: url.href,
    pathname: url.pathname,
    port: url.port,
    protocol: url.protocol,
    search: url.search,
  })
}

const entries = [
  { state: null, url: priorUrl },
  {
    state: {
      back: '/proxies',
      current: `/setup?${params}`,
      forward: null,
      position: 1,
      replaced: false,
      scroll: null,
    },
    url: handoffUrl,
  },
]
let index = 1

const history = {
  get length() {
    return entries.length
  },
  get state() {
    return entries[index].state
  },
  back() {
    this.go(-1)
  },
  go(delta) {
    const next = index + delta
    if (next < 0 || next >= entries.length) return
    index = next
    syncLocation(entries[index].url)
    for (const listener of listeners.get('popstate') ?? []) {
      listener({ state: entries[index].state })
    }
  },
  pushState(state, _unused, url) {
    const resolved = new URL(String(url), location.href)
    entries.splice(index + 1)
    entries.push({ state, url: resolved })
    index = entries.length - 1
    syncLocation(resolved)
  },
  replaceState(state, _unused, url) {
    const resolved = new URL(String(url || location.href), location.href)
    entries[index] = { state, url: resolved }
    syncLocation(resolved)
  },
}

const addListener = (type, listener) => {
  const current = listeners.get(type) ?? new Set()
  current.add(listener)
  listeners.set(type, current)
}

const removeListener = (type, listener) => listeners.get(type)?.delete(listener)

class FakeElement {}

const makeElement = () => ({
  content: {},
  setAttribute() {},
  style: {},
})

syncLocation(handoffUrl)

globalThis.location = location
globalThis.history = history
globalThis.document = {
  addEventListener: addListener,
  createComment: (text) => ({ nodeValue: text }),
  createElement: makeElement,
  createElementNS: makeElement,
  createTextNode: (text) => ({ nodeValue: text }),
  documentElement: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  querySelector: () => null,
  removeEventListener: removeListener,
  visibilityState: 'visible',
}
globalThis.Element = FakeElement
globalThis.SVGElement = FakeElement
globalThis.localStorage = {
  clear() {},
  getItem() {
    return null
  },
  key() {
    return null
  },
  length: 0,
  removeItem() {},
  setItem() {},
}
globalThis.window = {
  addEventListener: addListener,
  document: globalThis.document,
  history,
  localStorage: globalThis.localStorage,
  location,
  pageXOffset: 0,
  pageYOffset: 0,
  removeEventListener: removeListener,
  scrollTo() {},
}

const dispatch = (type, event) => {
  for (const listener of listeners.get(type) ?? []) listener(event)
}

const navigateSameDocument = (url) => {
  const oldURL = location.href
  history.pushState(null, '', url)
  dispatch('popstate', { state: null })
  dispatch('hashchange', { newURL: location.href, oldURL })
}

const flushNavigation = () => new Promise((resolve) => setTimeout(resolve, 0))

test('pre-router bootstrap keeps credentials out of real vue-router state and route snapshots', async () => {
  const uninstallCapture = installSetupHandoffCapture(globalThis.window)

  assert.equal(location.href, 'https://console.example.com/ui/#/setup')
  assert.equal(history.state, null)
  assert.doesNotMatch(entries[index].url.href, new RegExp(secret, 'u'))

  const { createRouter, createWebHashHistory } = await import('vue-router')
  const webHistory = createWebHashHistory('/ui/')
  const router = createRouter({
    history: webHistory,
    routes: [
      { path: '/setup', name: 'setup', component: {} },
      { path: '/proxies', name: 'proxies', component: {} },
    ],
  })

  await router.push(webHistory.location)
  assert.equal(router.currentRoute.value.fullPath, '/setup')
  assert.deepEqual(router.currentRoute.value.query, {})
  assert.equal(history.state.current, '/setup')
  assert.doesNotMatch(JSON.stringify(history.state), /secret/u)
  assert.doesNotMatch(JSON.stringify(router.currentRoute.value), /secret/u)

  let persisted = false
  const started = startSetupHandoff(takeSetupHandoff(), {
    async probe() {
      return false
    },
    persist() {
      persisted = true
    },
    navigate() {},
  })
  assert.equal(started.kind, 'ready')
  assert.deepEqual(await started.completion, { kind: 'failed' })
  assert.equal(persisted, false)

  let sameDocumentNotifications = 0
  let sameDocumentHandoff = null
  const unsubscribe = subscribeSetupHandoff(() => {
    sameDocumentNotifications++
    sameDocumentHandoff = takeSetupHandoff()
  })
  const secondSecret = 'same-document-empty-backend'
  const secondParams = new URLSearchParams(params)
  secondParams.set('secret', secondSecret)
  const unpatchedReplaceState = history.replaceState
  history.replaceState = function (state, unused, url) {
    if (url === undefined) return
    return unpatchedReplaceState.call(this, state, unused, url)
  }
  navigateSameDocument(`https://console.example.com/ui/#/setup?${secondParams}`)
  history.replaceState = unpatchedReplaceState
  await flushNavigation()

  assert.equal(sameDocumentNotifications, 1)
  assert.equal(sameDocumentHandoff.kind, 'ready')
  assert.equal(sameDocumentHandoff.backend.password, secondSecret)
  assert.equal(location.href, 'https://console.example.com/ui/#/setup')
  assert.equal(router.currentRoute.value.fullPath, '/setup')
  assert.deepEqual(router.currentRoute.value.query, {})
  assert.doesNotMatch(JSON.stringify(history.state), /secret/u)
  assert.doesNotMatch(JSON.stringify(router.currentRoute.value), /secret/u)

  let sameDocumentPersistCount = 0
  const sameDocumentStarted = startSetupHandoff(sameDocumentHandoff, {
    async probe() {
      return true
    },
    persist() {
      sameDocumentPersistCount++
    },
    navigate() {},
  })
  assert.equal(sameDocumentStarted.kind, 'ready')
  assert.deepEqual(await sameDocumentStarted.completion, { kind: 'connected' })
  assert.equal(sameDocumentPersistCount, 1)
  dispatch('hashchange', { newURL: location.href, oldURL: location.href })
  assert.equal(sameDocumentNotifications, 1)

  unsubscribe()
  await router.push('/proxies')
  const existingBackendSecret = 'same-document-existing-backend'
  const existingBackendParams = new URLSearchParams(params)
  existingBackendParams.set('secret', existingBackendSecret)
  navigateSameDocument(`https://console.example.com/ui/#/setup?${existingBackendParams}`)
  await flushNavigation()

  assert.equal(router.currentRoute.value.fullPath, '/setup')
  const existingBackendHandoff = takeSetupHandoff()
  assert.equal(existingBackendHandoff.kind, 'ready')
  assert.equal(existingBackendHandoff.backend.password, existingBackendSecret)
  assert.equal(takeSetupHandoff().kind, 'absent')
  assert.equal(
    entries.some((entry) => entry.url.href.includes('secret=')),
    false,
  )
  assert.doesNotMatch(JSON.stringify(history.state), /secret/u)

  const stateBeforeReload = history.state
  const reloadSlot = createSetupHandoffSlot()
  assert.equal(reloadSlot.initialize(location, history), 'absent')
  assert.deepEqual(reloadSlot.take(), { kind: 'absent' })
  assert.equal(history.state, stateBeforeReload)
  assert.doesNotMatch(location.href, /secret/u)

  history.back()
  assert.doesNotMatch(location.href, /secret/u)
  assert.equal(takeSetupHandoff().kind, 'absent')

  routerHistoryDestroy(webHistory)
  uninstallCapture()
})

const routerHistoryDestroy = (routerHistory) => {
  if (typeof routerHistory.destroy === 'function') routerHistory.destroy()
}
