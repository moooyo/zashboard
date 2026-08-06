import { fetchCapabilitiesAPI } from '@/api/fivegpn'
import { activeUuid } from '@/store/setup'
import { computed, ref, watch } from 'vue'

/**
 * Capability discovery · one probe, N features.
 *
 * Four states are required instead of a boolean because each condition needs a
 * different UI response. 'unknown' must render nothing because the answer is
 * not known yet; rendering an empty panel would be misleading. 'unsupported'
 * stays hidden permanently, while 'temporarily-unavailable' retains a retry
 * instead of caching a transient outage as unsupported. Merging the latter two
 * would let one 5xx keep the panel hidden after the core recovers.
 */
export type FeatureState = 'unknown' | 'supported' | 'unsupported' | 'temporarily-unavailable'

/**
 * Schema versions understood by this frontend. Newer versions advertised by
 * the core are treated as unsupported because field semantics may have changed;
 * rendering them as before could show the operator incorrect state.
 *
 * This table also acts as the **gating allowlist**. Discovery below iterates only
 * these keys, so a feature advertised by the core but omitted here remains
 * 'unknown', `featureSupported` remains false, and its panel never renders.
 * Every new subsystem must be added here as well; otherwise the backend and
 * acceptance tests can pass while the UI shows nothing. 5gpn-bot was once
 * omitted this way.
 *
 * Conversely, a key listed here but never advertised by the core remains
 * 'unsupported' forever. Such a dead entry describes a nonexistent feature and
 * misleads readers into believing it still exists.
 */
export const UNDERSTOOD_SCHEMA_VERSIONS: Record<string, number> = {
  '5gpn-dns': 1,
  '5gpn-interception': 2,
  '5gpn-bot': 1,
}

const RETRY_DELAY = 15000
const PROBE_TIMEOUT = 5000

const states = ref<Record<string, FeatureState>>({})
const versions = ref<Record<string, number>>({})
const owners = ref<Record<string, string>>({})

export const capabilityError = ref('')

/** Four-state view of a feature. Keys not yet discovered are always 'unknown'. */
export const featureState = (key: string) => computed(() => states.value[key] ?? 'unknown')

/**
 * Derived boolean used only for route and navigation gates.
 *
 * Capabilities are consumed as booleans through `!cap`. Supplying the four-state
 * string directly would make both 'unknown' and 'unsupported' truthy and invert
 * every gate.
 */
export const featureSupported = (key: string) => computed(() => states.value[key] === 'supported')

/** Owner advertised for a feature, or an empty string when unknown. */
export const featureOwner = (key: string) => computed(() => owners.value[key] ?? '')

/** Schema version advertised by the core, or 0 when unknown. */
export const featureVersion = (key: string) => computed(() => versions.value[key] ?? 0)

// Request generation and backend UUID form a double guard. The former rejects
// out-of-order responses from one backend; the latter prevents a late response
// from the previous backend from contaminating the new backend's state.
let generation = 0
let controller: AbortController | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined

const clearRetry = () => {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
}

const reset = () => {
  states.value = {}
  versions.value = {}
  owners.value = {}
  capabilityError.value = ''
}

/** Set every known feature to one state for whole-core unavailable/unsupported conclusions. */
const setAll = (state: FeatureState) => {
  const next: Record<string, FeatureState> = {}
  for (const key of Object.keys(UNDERSTOOD_SCHEMA_VERSIONS)) {
    next[key] = state
  }
  states.value = next
}

const scheduleRetry = () => {
  clearRetry()
  const gen = generation
  const uuid = activeUuid.value
  retryTimer = setTimeout(() => {
    if (gen !== generation || uuid !== activeUuid.value) return
    void initCapabilityDiscovery()
  }, RETRY_DELAY)
}

/**
 * Probe /capabilities once and derive every feature state.
 *
 * Status 0 needs special handling. For paths in ignoreNotificationUrls, the
 * response interceptor in api/http.ts resolves instead of rejecting, so callers
 * receive an AxiosError rather than an AxiosResponse and data is undefined.
 * Always inspect status here before destructuring data.
 */
export const initCapabilityDiscovery = async () => {
  clearRetry()
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal
  const gen = ++generation
  const uuid = activeUuid.value

  reset()
  if (!uuid) return

  const stale = () => gen !== generation || uuid !== activeUuid.value

  let status = 0
  let data: Awaited<ReturnType<typeof fetchCapabilitiesAPI>>['data'] | undefined
  try {
    const res = await fetchCapabilitiesAPI(signal, PROBE_TIMEOUT)
    status = res.status
    data = res.data
  } catch (e) {
    if (stale()) return
    // A network error, abort, or timeout means unavailable, not unsupported.
    setAll('temporarily-unavailable')
    capabilityError.value = e instanceof Error ? e.message : String(e)
    scheduleRetry()
    return
  }
  if (stale()) return

  if (status === 404) {
    // This core has no /capabilities endpoint, so it is not a 5gpn core. This is permanent.
    setAll('unsupported')
    return
  }
  if (status === 401) {
    // The interceptor already logged out and redirected to setup; do not add state here.
    return
  }
  if (status >= 500 || status === 0) {
    setAll('temporarily-unavailable')
    scheduleRetry()
    return
  }

  const advertised = data?.features ?? {}
  const nextStates: Record<string, FeatureState> = {}
  const nextVersions: Record<string, number> = {}
  const nextOwners: Record<string, string> = {}

  for (const [key, understood] of Object.entries(UNDERSTOOD_SCHEMA_VERSIONS)) {
    const feature = advertised[key]
    if (!feature) {
      nextStates[key] = 'unsupported'
      continue
    }
    nextVersions[key] = feature.version
    if (feature.version !== understood) {
      nextStates[key] = 'unsupported'
      continue
    }
    nextOwners[key] = feature.owner ?? ''
    nextStates[key] = 'supported'
  }

  states.value = nextStates
  versions.value = nextVersions
  owners.value = nextOwners
  capabilityError.value = ''
}

export const stopCapabilityDiscovery = () => {
  clearRetry()
  controller?.abort()
  controller = undefined
  generation++
  reset()
}

/**
 * The sole trigger for capability discovery.
 *
 * Previously, initCapabilityDiscovery correctly handled every 404, 401, 5xx,
 * and timeout case but was **never called**. Its only reference was its own
 * retry timer. As a result, states remained empty, featureState returned
 * 'unknown' for every key, featureSupported was always false, renderRoutes
 * filtered out 5gpn-dns and 5gpn-extensions, and SettingsPage omitted the
 * interception and bot sections. The entire 5gpn half of the panel was therefore
 * unreachable on every backend, making a connected, traffic-carrying gateway
 * look exactly like upstream zashboard.
 *
 * This watcher lives at module scope rather than in a component because the gate
 * consumers (helper's renderRoutes and SettingsPage's menuItems) are outside a
 * component lifecycle. version.ts uses the same pattern. immediate probes on
 * initial load, while UUID changes cover backend switching.
 */
watch(
  activeUuid,
  (uuid) => {
    if (uuid) {
      void initCapabilityDiscovery()
    } else {
      // On logout or backend removal, discard conclusions that belong to that backend.
      stopCapabilityDiscovery()
    }
  },
  { immediate: true },
)
