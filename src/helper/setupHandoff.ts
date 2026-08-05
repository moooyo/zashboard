import type { Backend } from '@/types'

export type SetupBackend = Omit<Backend, 'uuid'>

type LocationLike = Pick<
  Location,
  'hash' | 'hostname' | 'pathname' | 'port' | 'protocol' | 'search'
>

type HistoryLike = {
  readonly state: unknown
  replaceState(data: unknown, unused: string, url?: string | URL | null): void
}

type SetupHandoffAbsent = {
  kind: 'absent'
}

type SetupHandoffInvalid = {
  kind: 'invalid'
}

type SetupHandoffReady = {
  backend: SetupBackend
  kind: 'ready'
}

export type SetupHandoff = SetupHandoffAbsent | SetupHandoffInvalid | SetupHandoffReady

const HANDOFF_PATHNAME = '/ui/'
const HANDOFF_ROUTE = '/setup'
const MAX_HANDOFF_SECRET_BYTES = 4096
const HANDOFF_KEYS = [
  'type',
  'hostname',
  'port',
  'https',
  'secret',
  'label',
  'disableUpgradeCore',
  'disableTunMode',
] as const
const HANDOFF_KEY_SET = new Set<string>(HANDOFF_KEYS)

const splitHash = (hash: string) => {
  const value = hash.startsWith('#') ? hash.slice(1) : hash
  const queryIndex = value.indexOf('?')

  if (queryIndex === -1) {
    return { path: value, query: null }
  }

  return {
    path: value.slice(0, queryIndex),
    query: value.slice(queryIndex + 1),
  }
}

const containsHandoffKey = (params: URLSearchParams) => HANDOFF_KEYS.some((key) => params.has(key))

const stripHandoffKeys = (rawSearch: string) => {
  const params = new URLSearchParams(rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch)

  for (const key of HANDOFF_KEYS) {
    params.delete(key)
  }

  const value = params.toString()
  return value ? `?${value}` : ''
}

const routeStringContainsHandoffKey = (value: unknown) => {
  if (typeof value !== 'string' || !value) return false

  try {
    const url = new URL(value, 'https://history.invalid/')
    const fragment = splitHash(url.hash)
    return (
      containsHandoffKey(url.searchParams) ||
      containsHandoffKey(new URLSearchParams(fragment.query ?? ''))
    )
  } catch {
    return false
  }
}

const historyStateContainsHandoffKey = (state: unknown) => {
  if (!state || typeof state !== 'object') return false
  const routerState = state as Record<string, unknown>
  return ['back', 'current', 'forward'].some((key) =>
    routeStringContainsHandoffKey(routerState[key]),
  )
}

const locationContainsHandoffKey = (location: LocationLike) => {
  const fragment = splitHash(location.hash)
  return (
    containsHandoffKey(new URLSearchParams(location.search)) ||
    containsHandoffKey(new URLSearchParams(fragment.query ?? ''))
  )
}

const hasExactlyOne = (params: URLSearchParams, key: string) => params.getAll(key).length === 1

const isBooleanFlag = (params: URLSearchParams, key: string) => {
  const values = params.getAll(key)
  return values.length === 0 || (values.length === 1 && (values[0] === '0' || values[0] === '1'))
}

const effectivePort = (protocol: string, port: string) => {
  if (port) return port
  if (protocol === 'https:') return '443'
  if (protocol === 'http:') return '80'
  return ''
}

const parseBackend = (params: URLSearchParams, location: LocationLike): SetupBackend | null => {
  if ([...params.keys()].some((key) => !HANDOFF_KEY_SET.has(key))) {
    return null
  }

  for (const key of ['type', 'hostname', 'port', 'https', 'secret']) {
    if (!hasExactlyOne(params, key)) return null
  }

  if (!isBooleanFlag(params, 'disableUpgradeCore')) return null
  if (!isBooleanFlag(params, 'disableTunMode')) return null
  if (params.getAll('label').length > 1) return null
  if (params.get('type') !== 'clash' || params.get('https') !== '1') return null

  const host = params.get('hostname') ?? ''
  const portText = params.get('port') ?? ''
  const password = params.get('secret') ?? ''
  const label = params.get('label') ?? ''

  if (
    !host ||
    host !== host.trim() ||
    host.length > 253 ||
    /[\s/?#@\\]/u.test(host) ||
    !/^\d{1,5}$/u.test(portText) ||
    password.length === 0 ||
    new TextEncoder().encode(password).length > MAX_HANDOFF_SECRET_BYTES ||
    label.length > 128
  ) {
    return null
  }

  const port = Number(portText)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return null

  try {
    const target = new URL(`https://${host}:${port}`)
    const servingPort = effectivePort(location.protocol, location.port)
    const targetPort = effectivePort(target.protocol, target.port)

    if (
      location.protocol !== 'https:' ||
      target.protocol !== location.protocol ||
      target.hostname.toLowerCase() !== location.hostname.toLowerCase() ||
      targetPort !== servingPort
    ) {
      return null
    }
  } catch {
    return null
  }

  return {
    type: 'clash',
    protocol: 'https',
    host: location.hostname,
    port: effectivePort(location.protocol, location.port),
    secondaryPath: '',
    password,
    authMode: 'secret',
    label,
    disableUpgradeCore: params.get('disableUpgradeCore') === '1',
    disableTunMode: params.get('disableTunMode') === '1',
  }
}

/**
 * Consumes only the hash-router setup handoff. Credential-shaped parameters in
 * the outer query or on another route are removed but never interpreted.
 */
export const consumeSetupHandoff = (
  location: LocationLike = window.location,
  history: HistoryLike = window.history,
): SetupHandoff => {
  const fragment = splitHash(location.hash)
  const fragmentParams = new URLSearchParams(fragment.query ?? '')
  const urlContainsHandoffKey = locationContainsHandoffKey(location)
  const isSetupAttempt =
    location.pathname === HANDOFF_PATHNAME &&
    fragment.path === HANDOFF_ROUTE &&
    fragment.query !== null &&
    containsHandoffKey(fragmentParams)

  const scrubbedSearch = stripHandoffKeys(location.search)
  let scrubbedHash = location.hash

  if (fragment.query !== null && containsHandoffKey(fragmentParams)) {
    if (fragment.path === HANDOFF_ROUTE) {
      scrubbedHash = `#${HANDOFF_ROUTE}`
    } else {
      const remainingQuery = stripHandoffKeys(fragment.query)
      scrubbedHash = `#${fragment.path}${remainingQuery}`
    }
  }

  if (urlContainsHandoffKey || historyStateContainsHandoffKey(history.state)) {
    // Never preserve a vue-router state whose current/back/forward fields may
    // still contain the credential-bearing URL from an earlier application run.
    try {
      history.replaceState(null, '', `${location.pathname}${scrubbedSearch}${scrubbedHash}`)
    } catch (error) {
      throw new Error('Unable to scrub the setup handoff before router initialization', {
        cause: error,
      })
    }

    if (locationContainsHandoffKey(location) || historyStateContainsHandoffKey(history.state)) {
      throw new Error('Unable to scrub the setup handoff before router initialization')
    }
  }

  if (!isSetupAttempt) return { kind: 'absent' }

  const backend = parseBackend(fragmentParams, location)
  return backend ? { backend, kind: 'ready' } : { kind: 'invalid' }
}

export const createSetupHandoffSlot = () => {
  let initialized = false
  let pending: SetupHandoff = { kind: 'absent' }
  const subscribers = new Set<() => void>()

  const capture = (location: LocationLike, history: HistoryLike) => {
    const handoff = consumeSetupHandoff(location, history)
    if (handoff.kind === 'absent') return handoff.kind

    pending = handoff
    for (const subscriber of subscribers) subscriber()
    return handoff.kind
  }

  return {
    initialize(location: LocationLike = window.location, history: HistoryLike = window.history) {
      if (initialized) return pending.kind

      initialized = true
      return capture(location, history)
    },
    capture(location: LocationLike = window.location, history: HistoryLike = window.history) {
      if (!initialized) initialized = true
      return capture(location, history)
    },
    subscribe(subscriber: () => void) {
      subscribers.add(subscriber)
      return () => subscribers.delete(subscriber)
    },
    take() {
      const handoff = pending
      pending = { kind: 'absent' }
      return handoff
    },
  }
}

const setupHandoffSlot = createSetupHandoffSlot()

export const initializeSetupHandoff = setupHandoffSlot.initialize
export const captureSetupHandoff = setupHandoffSlot.capture
export const subscribeSetupHandoff = setupHandoffSlot.subscribe
export const takeSetupHandoff = setupHandoffSlot.take

type NavigationEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>

export const installSetupHandoffCapture = (eventTarget: NavigationEventTarget = window) => {
  const browserLocation = window.location
  const browserHistory = window.history
  const originalReplaceState = browserHistory.replaceState.bind(browserHistory)
  const trustedHistory: HistoryLike = {
    get state() {
      return browserHistory.state
    },
    replaceState(data, unused, url) {
      originalReplaceState(data, unused, url)
    },
  }

  initializeSetupHandoff(browserLocation, trustedHistory)
  const captureCurrentLocation = (event: Event) => {
    try {
      captureSetupHandoff(browserLocation, trustedHistory)
    } catch (error) {
      event.stopImmediatePropagation()
      throw error
    }
  }

  eventTarget.addEventListener('popstate', captureCurrentLocation)
  eventTarget.addEventListener('hashchange', captureCurrentLocation)

  return () => {
    eventTarget.removeEventListener('popstate', captureCurrentLocation)
    eventTarget.removeEventListener('hashchange', captureCurrentLocation)
  }
}

type SetupHandoffActions = {
  navigate(): Promise<void> | void
  persist(backend: SetupBackend): void
  prepare?(backend: SetupBackend): void
  probe(backend: SetupBackend): Promise<boolean>
}

type SetupHandoffCompletion = { kind: 'connected' } | { error?: unknown; kind: 'failed' }

/**
 * Starts the one-time handoff synchronously. URL scrubbing is complete before
 * this function invokes prepare or starts the asynchronous controller probe.
 */
export const startSetupHandoff = (handoff: SetupHandoff, actions: SetupHandoffActions) => {
  if (handoff.kind !== 'ready') return handoff

  actions.prepare?.(handoff.backend)

  const completion: Promise<SetupHandoffCompletion> = (async () => {
    try {
      if (!(await actions.probe(handoff.backend))) return { kind: 'failed' }

      actions.persist(handoff.backend)
      await actions.navigate()
      return { kind: 'connected' }
    } catch (error) {
      return { error, kind: 'failed' }
    }
  })()

  return { ...handoff, completion }
}

const normalizedBackendIdentity = (backend: SetupBackend) => [
  backend.type,
  backend.protocol.toLowerCase(),
  backend.host.toLowerCase(),
  String(Number(backend.port)),
  backend.secondaryPath || '',
  backend.password,
  backend.authMode ?? 'secret',
  backend.label || '',
  Boolean(backend.disableUpgradeCore),
  Boolean(backend.disableTunMode),
]

export const backendConfigurationsEqual = (left: SetupBackend, right: SetupBackend) => {
  const leftIdentity = normalizedBackendIdentity(left)
  const rightIdentity = normalizedBackendIdentity(right)
  return leftIdentity.every((value, index) => value === rightIdentity[index])
}

export const getServedOriginDefaults = (location: LocationLike = window.location) => {
  const { hostname, port, protocol } = location

  if ((protocol !== 'http:' && protocol !== 'https:') || !hostname) return null

  return {
    protocol: protocol.slice(0, -1),
    host: hostname,
    port: port || (protocol === 'https:' ? '443' : '80'),
  }
}
