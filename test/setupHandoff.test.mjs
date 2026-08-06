import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  backendConfigurationsEqual,
  consumeSetupHandoff,
  createSetupHandoffSlot,
  getServedOriginDefaults,
  startSetupHandoff,
} from '../src/helper/setupHandoff.ts'

const makeBrowser = (url, events = [], initialState = { test: true }) => {
  let current = new URL(url)
  const location = {
    hash: current.hash,
    hostname: current.hostname,
    pathname: current.pathname,
    port: current.port,
    protocol: current.protocol,
    search: current.search,
  }

  const history = {
    state: initialState,
    calls: [],
    replaceState(state, _unused, nextUrl) {
      events.push('scrub')
      this.calls.push({ state, url: String(nextUrl) })
      this.state = state
      current = new URL(String(nextUrl), current)
      Object.assign(location, {
        hash: current.hash,
        hostname: current.hostname,
        pathname: current.pathname,
        port: current.port,
        protocol: current.protocol,
        search: current.search,
      })
    },
  }

  return { history, location }
}

const makeHandoffUrl = (overrides = {}) => {
  const query = new URLSearchParams({
    type: 'clash',
    hostname: 'console.example.com',
    port: '443',
    https: '1',
    secret: 'controller-secret',
    label: '5gpn Console',
    disableTunMode: '1',
    ...overrides,
  })
  return `https://console.example.com/ui/#/setup?${query}`
}

test('fragment handoff scrubs before probing and consumes a special secret only once', async () => {
  const events = []
  const specialSecret = 'p+a&b?c=#d%25 空格/尾部'
  const browser = makeBrowser(makeHandoffUrl({ secret: specialSecret }), events)
  let savedBackend = null
  const slot = createSetupHandoffSlot()
  assert.equal(slot.initialize(browser.location, browser.history), 'ready')

  const started = startSetupHandoff(slot.take(), {
    prepare(backend) {
      events.push('prepare')
      assert.equal(browser.location.hash, '#/setup')
      assert.equal(backend.password, specialSecret)
    },
    async probe(backend) {
      events.push('probe')
      assert.equal(browser.location.hash, '#/setup')
      assert.doesNotMatch(browser.history.calls[0].url, /secret/u)
      assert.equal(backend.protocol, 'https')
      return true
    },
    persist(backend) {
      events.push('persist')
      savedBackend = backend
    },
    navigate() {
      events.push('navigate')
    },
  })

  assert.equal(started.kind, 'ready')
  assert.deepEqual(await started.completion, { kind: 'connected' })
  assert.equal(savedBackend.password, specialSecret)
  assert.equal(savedBackend.disableTunMode, true)
  assert.deepEqual(events, ['scrub', 'prepare', 'probe', 'persist', 'navigate'])
  assert.equal(browser.history.calls[0].url, '/ui/#/setup')
  assert.equal(browser.history.state, null)

  let secondProbe = false
  const second = startSetupHandoff(slot.take(), {
    async probe() {
      secondProbe = true
      return true
    },
    persist() {},
    navigate() {},
  })
  assert.deepEqual(second, { kind: 'absent' })
  assert.equal(secondProbe, false)
})

test('outer-query credentials and non-setup fragments are scrubbed but never consumed', () => {
  const outer = makeBrowser(
    'https://console.example.com/ui/?hostname=attacker.example&secret=leak&theme=dark#/setup',
  )
  assert.deepEqual(consumeSetupHandoff(outer.location, outer.history), { kind: 'absent' })
  assert.equal(outer.location.search, '?theme=dark')
  assert.equal(outer.location.hash, '#/setup')
  assert.doesNotMatch(outer.history.calls[0].url, /attacker|secret|leak/u)

  const otherRoute = makeBrowser(
    'https://console.example.com/ui/#/proxies?hostname=attacker.example&secret=leak&tab=latency',
  )
  assert.deepEqual(consumeSetupHandoff(otherRoute.location, otherRoute.history), {
    kind: 'absent',
  })
  assert.equal(otherRoute.location.hash, '#/proxies?tab=latency')
  assert.doesNotMatch(otherRoute.history.calls[0].url, /attacker|secret|leak/u)

  const wrongPath = makeBrowser(
    'https://console.example.com/not-ui/#/setup?type=clash&hostname=console.example.com&port=443&https=1&secret=leak',
  )
  assert.deepEqual(consumeSetupHandoff(wrongPath.location, wrongPath.history), { kind: 'absent' })
  assert.equal(wrongPath.location.hash, '#/setup')
  assert.doesNotMatch(wrongPath.history.calls[0].url, /secret|leak/u)
})

test('invalid handoffs are scrubbed without probing or persisting', () => {
  const query = new URLSearchParams({
    type: 'clash',
    hostname: 'console.example.com',
    https: '1',
    secret: 'must-not-remain',
  })
  const browser = makeBrowser(`https://console.example.com/ui/#/setup?${query}`)
  let called = false
  const slot = createSetupHandoffSlot()
  assert.equal(slot.initialize(browser.location, browser.history), 'invalid')

  const started = startSetupHandoff(slot.take(), {
    async probe() {
      called = true
      return true
    },
    persist() {
      called = true
    },
    navigate() {
      called = true
    },
  })

  assert.deepEqual(started, { kind: 'invalid' })
  assert.equal(called, false)
  assert.equal(browser.location.hash, '#/setup')
  assert.doesNotMatch(browser.history.calls[0].url, /secret|must-not-remain/u)
})

test('the retired per-backend upgrade flag is rejected and scrubbed', () => {
  const browser = makeBrowser(makeHandoffUrl({ disableUpgradeCore: '1' }))
  const slot = createSetupHandoffSlot()

  assert.equal(slot.initialize(browser.location, browser.history), 'invalid')
  assert.equal(browser.location.hash, '#/setup')
  assert.doesNotMatch(browser.history.calls[0].url, /disableUpgradeCore|secret/u)
})

test('the handoff secret limit is measured in UTF-8 bytes', () => {
  const atLimit = makeBrowser(makeHandoffUrl({ secret: '密'.repeat(1365) + 'x' }))
  const overLimit = makeBrowser(makeHandoffUrl({ secret: '密'.repeat(1366) }))

  assert.equal(createSetupHandoffSlot().initialize(atLimit.location, atLimit.history), 'ready')
  assert.equal(
    createSetupHandoffSlot().initialize(overLimit.location, overLimit.history),
    'invalid',
  )
})

test('a failed probe never persists a backend or navigates', async () => {
  const events = []
  const browser = makeBrowser(makeHandoffUrl(), events)
  const slot = createSetupHandoffSlot()
  assert.equal(slot.initialize(browser.location, browser.history), 'ready')

  const started = startSetupHandoff(slot.take(), {
    async probe() {
      events.push('probe')
      return false
    },
    persist() {
      events.push('persist')
    },
    navigate() {
      events.push('navigate')
    },
  })

  assert.equal(started.kind, 'ready')
  assert.deepEqual(await started.completion, { kind: 'failed' })
  assert.deepEqual(events, ['scrub', 'probe'])
  assert.equal(browser.location.hash, '#/setup')
  assert.equal(browser.history.state, null)
})

test('cross-origin, cross-port, and non-HTTPS handoffs never probe with the bearer secret', () => {
  const cases = [
    makeHandoffUrl({ hostname: 'collector.example' }),
    makeHandoffUrl({ port: '8443' }),
    makeHandoffUrl().replace('https://console.example.com', 'http://console.example.com'),
  ]

  for (const url of cases) {
    const browser = makeBrowser(url)
    const slot = createSetupHandoffSlot()
    let probed = false

    assert.equal(slot.initialize(browser.location, browser.history), 'invalid')
    const started = startSetupHandoff(slot.take(), {
      async probe() {
        probed = true
        return true
      },
      persist() {},
      navigate() {},
    })

    assert.deepEqual(started, { kind: 'invalid' })
    assert.equal(probed, false)
    assert.equal(browser.history.state, null)
    assert.doesNotMatch(browser.history.calls[0].url, /collector|secret/u)
  }
})

test('clean router state is preserved and a no-op scrubber fails closed', () => {
  const cleanState = {
    back: '/overview',
    current: '/proxies',
    forward: '/settings',
    position: 4,
    scroll: { left: 0, top: 120 },
  }
  const clean = makeBrowser('https://console.example.com/ui/#/proxies', [], cleanState)
  assert.deepEqual(consumeSetupHandoff(clean.location, clean.history), { kind: 'absent' })
  assert.equal(clean.history.state, cleanState)
  assert.equal(clean.history.calls.length, 0)

  const unsafe = makeBrowser(makeHandoffUrl())
  const noOpHistory = {
    state: unsafe.history.state,
    replaceState() {},
  }
  const slot = createSetupHandoffSlot()
  assert.throws(
    () => slot.initialize(unsafe.location, noOpHistory),
    /Unable to scrub the setup handoff/u,
  )
  assert.deepEqual(slot.take(), { kind: 'absent' })
})

test('backend identity prevents duplicate defaults and setup defaults use the serving origin', () => {
  const explicit = {
    type: 'clash',
    protocol: 'https',
    host: 'CONSOLE.EXAMPLE.COM',
    port: '0443',
    secondaryPath: '',
    password: 'secret',
    authMode: 'secret',
    label: '',
    disableTunMode: false,
  }
  const implicit = {
    type: 'clash',
    protocol: 'HTTPS',
    host: 'console.example.com',
    port: '443',
    secondaryPath: '',
    password: 'secret',
  }

  assert.equal(backendConfigurationsEqual(explicit, implicit), true)
  assert.deepEqual(
    getServedOriginDefaults({
      hash: '#/setup',
      hostname: 'console.example.com',
      pathname: '/ui/',
      port: '',
      protocol: 'https:',
      search: '',
    }),
    { host: 'console.example.com', port: '443', protocol: 'https' },
  )

  const setupSource = readFileSync(new URL('../src/views/SetupPage.vue', import.meta.url), 'utf8')
  const english = readFileSync(new URL('../src/i18n/en.ts', import.meta.url), 'utf8')
  const bootstrap = readFileSync(new URL('../src/bootstrap.ts', import.meta.url), 'utf8')
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const router = readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8')
  assert.match(setupSource, /\$t\('setupHostScopeHint'\)/u)
  assert.match(english, /127\.0\.0\.1 means the device running this browser/u)
  assert.match(index, /src="\/src\/bootstrap\.ts"/u)
  assert.equal(bootstrap.trimStart().startsWith("import './helper/setupHandoffBootstrap'"), true)
  assert.equal(
    bootstrap.indexOf("import('./main')") > bootstrap.indexOf('setupHandoffBootstrap'),
    true,
  )
  assert.match(router, /import '@\/helper\/setupHandoffBootstrap'/u)
})
