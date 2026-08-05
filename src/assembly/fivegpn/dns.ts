import type {
  FiveGPNDnsDocument,
  FiveGPNDnsEnvelope,
  FiveGPNDnsStats,
  FiveGPNExplanation,
  FiveGPNQueryLogEntry,
  FiveGPNSubscriptionStatus,
} from '@/api/fivegpn'
import {
  fetchDnsAPI,
  fetchQueryLogAPI,
  flushDnsCacheAPI,
  putDnsAPI,
  resolveTestAPI,
} from '@/api/fivegpn'
import { activeUuid } from '@/store/setup'
import { ref } from 'vue'
import { featureSupported } from './capabilities'

/**
 * Resolver state.
 *
 * Like the interception surface, this uses five states instead of "data or null".
 * 'absent' and 'error' must remain distinct. A 503 means the engine is missing,
 * not that DNS is disabled. Rendering both as the same screen would tell the
 * operator that policy is active when nothing is actually reading it.
 */
export type DnsStatus = 'idle' | 'loading' | 'ready' | 'absent' | 'error'

export const dnsStatus = ref<DnsStatus>('idle')
export const dnsDocument = ref<FiveGPNDnsDocument | null>(null)
export const dnsRevision = ref('')
export const dnsStats = ref<FiveGPNDnsStats | null>(null)
export const dnsSubscriptions = ref<FiveGPNSubscriptionStatus[]>([])
export const dnsError = ref('')

export const dnsSupported = featureSupported('5gpn-dns')

// This uses the same double guard as capabilities: generation rejects
// out-of-order responses from one backend, while UUID rejects late responses
// from the previous backend after a switch.
let generation = 0
let controller: AbortController | undefined

/**
 * Statistics sampling updates only stats and never touches dnsDocument.
 *
 * QPS is a rate, but the core reports only a cumulative total, so the frontend
 * derives the rate from adjacent samples. This mirrors zashboard's traffic
 * chart, except that chart receives websocket pushes while this path polls.
 *
 * refreshDns cannot be reused because it writes dnsDocument, which the settings
 * panel watches to reset its draft. A poll during input would erase what the
 * operator is typing. Sharing a write path between sampling and editing would
 * let viewing a chart disrupt configuration changes.
 */
export type FiveGPNQpsPoint = { name: number; value: [number, number]; init?: boolean }

const QPS_SECONDS = 60
// Keep two extra off-screen points so removing the oldest point beyond the
// grid's left edge does not create a visible break as the edge scrolls.
const QPS_POINTS = QPS_SECONDS + 2

const makeQpsHistory = (): FiveGPNQpsPoint[] => {
  const now = Date.now()
  return new Array(QPS_POINTS).fill(0).map((_, i) => {
    const at = now - (QPS_POINTS - 1 - i) * 1000
    return { name: at, value: [at, 0] as [number, number], init: true }
  })
}

export const qps = ref(0)
export const qpsHistory = ref<FiveGPNQpsPoint[]>(makeQpsHistory())
// p50 time series for each upstream group. The core reports a 15-minute rolling
// window, so this line represents the cost of a typical query in the group at
// the latest sample, not the average since startup.
export const chinaLatencyHistory = ref<FiveGPNQpsPoint[]>(makeQpsHistory())
export const trustLatencyHistory = ref<FiveGPNQpsPoint[]>(makeQpsHistory())

let sampleTimer: ReturnType<typeof setInterval> | undefined
let lastTotal = -1
let lastAt = 0
let samplers = 0

const sampleOnce = async () => {
  const uuid = activeUuid.value
  if (!uuid) return
  let data: FiveGPNDnsEnvelope | undefined
  try {
    const res = await fetchDnsAPI()
    if (res.status !== 200 || !res.data) return
    data = res.data
  } catch {
    // A sampling failure does not change status; one network wobble must not mark the engine absent.
    return
  }
  if (uuid !== activeUuid.value) return

  dnsStats.value = data.stats
  // Adopt subscription status as well. It is a read-only fetch result rather
  // than document state. Sampling intentionally avoids dnsDocument because that
  // would erase an active draft, but entry counts describe what is currently
  // installed, belong with stats, and already arrive in the same response. If
  // ignored here, the standalone overview card can never observe them.
  dnsSubscriptions.value = data.subscriptions ?? []
  const now = Date.now()
  const total = data.stats?.total ?? 0
  // The first sample establishes a baseline and cannot produce a rate. A core
  // restart makes total decrease; that starts a new counter rather than a
  // negative rate, so it also only rebuilds the baseline.
  if (lastTotal >= 0 && total >= lastTotal && lastAt > 0) {
    const seconds = Math.max((now - lastAt) / 1000, 0.001)
    qps.value = (total - lastTotal) / seconds
  } else {
    qps.value = 0
  }
  lastTotal = total
  lastAt = now

  qpsHistory.value.push({ name: now, value: [now, qps.value] })
  qpsHistory.value = qpsHistory.value.slice(-QPS_POINTS)

  // Upstream latency has a 15-minute sample age limit, so an idle gateway really
  // can return to "no samples". Plotting an ordinary zero would falsely claim
  // zero milliseconds. Mark the point with init, following makeQpsHistory's
  // placeholder convention: draw it on the zero line without a tooltip and do
  // not present it as a measurement.
  const pushLatency = (
    history: typeof qpsHistory,
    group?: { latencyCount: number; p50Ms: number },
  ) => {
    const measured = (group?.latencyCount ?? 0) > 0
    history.value.push(
      measured
        ? { name: now, value: [now, group!.p50Ms] }
        : { name: now, value: [now, 0], init: true },
    )
    history.value = history.value.slice(-QPS_POINTS)
  }
  pushLatency(chinaLatencyHistory, data.stats?.china)
  pushLatency(trustLatencyHistory, data.stats?.trust)
}

/** Reference count so multiple mounted cards share one timer. */
export const startQpsSampling = () => {
  samplers += 1
  if (sampleTimer) return
  lastTotal = -1
  lastAt = 0
  qpsHistory.value = makeQpsHistory()
  chinaLatencyHistory.value = makeQpsHistory()
  trustLatencyHistory.value = makeQpsHistory()
  void sampleOnce()
  sampleTimer = setInterval(() => void sampleOnce(), 1000)
}

export const stopQpsSampling = () => {
  samplers = Math.max(0, samplers - 1)
  if (samplers > 0 || !sampleTimer) return
  clearInterval(sampleTimer)
  sampleTimer = undefined
  qps.value = 0
}

const adopt = (data: FiveGPNDnsEnvelope) => {
  dnsDocument.value = data.document
  dnsRevision.value = data.revision
  dnsStats.value = data.stats
  dnsSubscriptions.value = data.subscriptions ?? []
  dnsStatus.value = 'ready'
  dnsError.value = ''
}

export const refreshDns = async () => {
  controller?.abort()
  controller = new AbortController()
  const gen = ++generation
  const uuid = activeUuid.value
  const stale = () => gen !== generation || uuid !== activeUuid.value

  if (!uuid) {
    dnsStatus.value = 'idle'
    return
  }

  dnsStatus.value = 'loading'
  dnsError.value = ''

  let status = 0
  let data: FiveGPNDnsEnvelope | undefined
  try {
    const res = await fetchDnsAPI(controller.signal)
    status = res.status
    data = res.data
  } catch (e) {
    if (stale()) return
    dnsStatus.value = 'error'
    dnsError.value = e instanceof Error ? e.message : String(e)
    return
  }
  if (stale()) return

  if (status === 503) {
    dnsStatus.value = 'absent'
    dnsDocument.value = null
    return
  }
  if (status !== 200 || !data) {
    dnsStatus.value = 'error'
    dnsError.value = `dns returned ${status}`
    return
  }
  adopt(data)
}

/**
 * Save the complete document.
 *
 * The whole document is written because these edits are not independent.
 * Changing a gateway address and the upstream that serves it is one operation;
 * two writes would expose an intermediate state in which the resolver matches
 * neither side.
 *
 * A 409 means someone changed the document after it was read. Fetch the latest
 * state and expose the conflict instead of overwriting it; having this page open
 * in two tabs is normal, not exceptional.
 */
export const saveDns = async (document: FiveGPNDnsDocument): Promise<string> => {
  if (!dnsRevision.value) return 'no revision'
  try {
    const res = await putDnsAPI({ revision: dnsRevision.value, document })
    if (res.status === 200 && res.data) {
      adopt(res.data)
      return ''
    }
    if (res.status === 409) {
      await refreshDns()
      return 'conflict'
    }
    return messageOf(res) || `dns returned ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

const messageOf = (res: { data?: unknown }) => {
  const data = res.data as { message?: string } | undefined
  return data?.message ?? ''
}

// --- Query log --------------------------------------------------------------

export const queryLog = ref<FiveGPNQueryLogEntry[]>([])
export const queryLogFilter = ref('')
export const queryLogError = ref('')

let logController: AbortController | undefined

export const refreshQueryLog = async () => {
  logController?.abort()
  logController = new AbortController()
  const uuid = activeUuid.value
  if (!uuid) return
  try {
    const res = await fetchQueryLogAPI(queryLogFilter.value, 500, logController.signal)
    if (uuid !== activeUuid.value) return
    if (res.status === 200 && res.data) {
      queryLog.value = res.data.entries ?? []
      queryLogError.value = ''
      return
    }
    queryLogError.value = `query log returned ${res.status}`
  } catch (e) {
    queryLogError.value = e instanceof Error ? e.message : String(e)
  }
}

// --- Resolution diagnostics ------------------------------------------------

export const explanation = ref<FiveGPNExplanation | null>(null)
export const explanationError = ref('')
export const explaining = ref(false)

export const explain = async (name: string) => {
  explaining.value = true
  explanationError.value = ''
  try {
    const res = await resolveTestAPI(name)
    if (res.status === 200 && res.data) {
      explanation.value = res.data
      return
    }
    explanation.value = null
    explanationError.value = messageOf(res) || `resolve returned ${res.status}`
  } catch (e) {
    explanation.value = null
    explanationError.value = e instanceof Error ? e.message : String(e)
  } finally {
    explaining.value = false
  }
}

export const flushCache = async () => {
  await flushDnsCacheAPI()
  await refreshDns()
}

export const stopDns = () => {
  controller?.abort()
  logController?.abort()
  controller = undefined
  logController = undefined
  generation++
  dnsDocument.value = null
  dnsStats.value = null
  dnsSubscriptions.value = []
  dnsRevision.value = ''
  dnsStatus.value = 'idle'
  dnsError.value = ''
  queryLog.value = []
  explanation.value = null
}
