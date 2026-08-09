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
  fetchDnsStatsAPI,
  fetchQueryLogAPI,
  flushDnsCacheAPI,
  putDnsAPI,
  resolveTestAPI,
} from '@/api/fivegpn'
import { responseData, responseMessage, responseStatus } from '@/api/response'
import { SerialRevisionWriter } from '@/helper/serialRevisionWriter'
import { SingleFlightRequest } from '@/helper/singleFlightRequest'
import {
  activeBackendSession,
  backendSessionIsCurrent,
  captureBackendSession,
} from '@/store/setup'
import { ref, watch } from 'vue'
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
// out-of-order responses within one session, while the session epoch rejects
// responses from a backend that was switched or edited in place.
let generation = 0
let controller: AbortController | undefined

const cancelDnsRead = () => {
  controller?.abort()
  controller = undefined
  generation += 1
}

export type DnsWriteConflict = {
  sessionEpoch: number
  baseRevision: string
  serverRevision?: string
  draft: FiveGPNDnsDocument
}

export const dnsWritesPending = ref(0)
export const dnsWriteConflict = ref<DnsWriteConflict | null>(null)
export const dnsWriteError = ref('')
const dnsWriter = new SerialRevisionWriter<FiveGPNDnsDocument, FiveGPNDnsEnvelope>()

const cloneDocument = (document: FiveGPNDnsDocument): FiveGPNDnsDocument =>
  JSON.parse(JSON.stringify(document))

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
let subscriptionTimer: ReturnType<typeof setInterval> | undefined
let lastTotal = -1
let lastAt = 0
let samplers = 0
let subscriptionSamplers = 0
const statsRequest = new SingleFlightRequest<FiveGPNDnsStats>()
const subscriptionRequest = new SingleFlightRequest<FiveGPNSubscriptionStatus[]>()

const SUBSCRIPTION_SAMPLE_INTERVAL = 30000

const sampleOnce = async () => {
  const session = captureBackendSession()
  if (!session) return
  await statsRequest.run(
    async (signal) => {
      const res = await fetchDnsStatsAPI(signal)
      if (res.status !== 200 || !res.data) throw new Error(`dns stats returned ${res.status}`)
      return res.data
    },
    (stats) => {
      if (!backendSessionIsCurrent(session)) return
      dnsStats.value = stats
      const now = Date.now()
      const total = stats.total ?? 0
      // The first sample establishes a baseline. A core restart decreases the
      // counter and starts a new baseline instead of producing a negative rate.
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
      pushLatency(chinaLatencyHistory, stats.china)
      pushLatency(trustLatencyHistory, stats.trust)
    },
  )
}

const sampleSubscriptionsOnce = async () => {
  const session = captureBackendSession()
  if (!session) return
  await subscriptionRequest.run(
    async (signal) => {
      const res = await fetchDnsAPI(signal)
      if (res.status !== 200 || !res.data) throw new Error(`dns returned ${res.status}`)
      return res.data.subscriptions ?? []
    },
    (subscriptions) => {
      if (backendSessionIsCurrent(session)) dnsSubscriptions.value = subscriptions
    },
  )
}

/** Low-frequency subscription status is independent of the one-second chart. */
export const startDnsSubscriptionSampling = () => {
  subscriptionSamplers += 1
  if (subscriptionTimer) return
  void sampleSubscriptionsOnce()
  subscriptionTimer = setInterval(
    () => void sampleSubscriptionsOnce(),
    SUBSCRIPTION_SAMPLE_INTERVAL,
  )
}

export const stopDnsSubscriptionSampling = () => {
  if (subscriptionSamplers === 0) return
  subscriptionSamplers -= 1
  if (subscriptionSamplers > 0 || !subscriptionTimer) return
  clearInterval(subscriptionTimer)
  subscriptionTimer = undefined
  subscriptionRequest.cancel()
}

/** Reference count so multiple mounted cards share one timer. */
export const startQpsSampling = () => {
  samplers += 1
  startDnsSubscriptionSampling()
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
  if (samplers === 0) return
  samplers -= 1
  stopDnsSubscriptionSampling()
  if (samplers > 0 || !sampleTimer) return
  clearInterval(sampleTimer)
  sampleTimer = undefined
  statsRequest.cancel()
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
  cancelDnsRead()
  controller = new AbortController()
  const gen = ++generation
  const session = captureBackendSession()
  const stale = () => gen !== generation || !backendSessionIsCurrent(session)

  if (!session) {
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
    const status = responseStatus(e)
    if (status === 503) {
      dnsStatus.value = 'absent'
      dnsDocument.value = null
      return
    }
    dnsStatus.value = 'error'
    dnsError.value = responseMessage(e) || (e instanceof Error ? e.message : String(e))
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
export const saveDns = async (
  document: FiveGPNDnsDocument,
  expectedRevision = dnsRevision.value,
): Promise<string> => {
  const session = captureBackendSession()
  const baseRevision = expectedRevision
  if (!session) return 'no backend'
  if (!baseRevision) return 'no revision'

  const draft = cloneDocument(document)
  const sessionKey = String(session.epoch)
  dnsWritesPending.value += 1
  try {
    const outcome = await dnsWriter.enqueue({
      sessionKey,
      baseRevision,
      value: draft,
      isCurrent: () => backendSessionIsCurrent(session),
      write: async (revision, value) => {
        // A GET that began before this transaction must never publish an old
        // document or revision after the PUT succeeds.
        cancelDnsRead()
        try {
          const res = await putDnsAPI({ revision, document: value })
          if (res.status === 200 && res.data) {
            // Fence any read started while the write was in flight and before
            // the server committed the new document.
            cancelDnsRead()
            return { status: 'saved' as const, revision: res.data.revision, response: res.data }
          }
          if (res.status === 409) {
            return {
              status: 'conflict' as const,
              serverRevision: responseData<{ revision?: string }>(res)?.revision,
            }
          }
          return {
            status: 'error' as const,
            message: messageOf(res) || `dns returned ${res.status}`,
          }
        } catch (error) {
          const status = responseStatus(error)
          if (status === 409) {
            return {
              status: 'conflict' as const,
              serverRevision: responseData<{ revision?: string }>(error)?.revision,
            }
          }
          return {
            status: 'error' as const,
            message:
              responseMessage(error) || (error instanceof Error ? error.message : String(error)),
          }
        }
      },
    })

    if (!backendSessionIsCurrent(session)) return 'backend changed'
    if (outcome.status === 'saved') {
      adopt(outcome.response)
      dnsWriteError.value = ''
      return ''
    }
    if (outcome.status === 'conflict') {
      dnsWriteConflict.value = {
        sessionEpoch: session.epoch,
        baseRevision: outcome.baseRevision,
        serverRevision: outcome.serverRevision,
        draft: cloneDocument(outcome.attempted),
      }
      dnsWriteError.value = 'conflict'
      return 'conflict'
    }
    dnsWriteError.value = outcome.message
    return outcome.message
  } finally {
    if (backendSessionIsCurrent(session)) {
      dnsWritesPending.value = Math.max(0, dnsWritesPending.value - 1)
    }
  }
}

/** Explicitly discard the preserved local draft and adopt the server document. */
export const discardDnsConflict = async () => {
  const conflict = dnsWriteConflict.value
  if (conflict) dnsWriter.clear(String(conflict.sessionEpoch))
  dnsWriteConflict.value = null
  dnsWriteError.value = ''
  await refreshDns()
}

export const clearDnsWriteError = () => {
  dnsWriteError.value = ''
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
  const session = captureBackendSession()
  if (!session) return
  try {
    const res = await fetchQueryLogAPI(queryLogFilter.value, 500, logController.signal)
    if (!backendSessionIsCurrent(session)) return
    if (res.status === 200 && res.data) {
      queryLog.value = res.data.entries ?? []
      queryLogError.value = ''
      return
    }
    queryLogError.value = `query log returned ${res.status}`
  } catch (e) {
    if (!backendSessionIsCurrent(session)) return
    queryLogError.value = e instanceof Error ? e.message : String(e)
  }
}

// --- Resolution diagnostics ------------------------------------------------

export const explanation = ref<FiveGPNExplanation | null>(null)
export const explanationError = ref('')
export const explaining = ref(false)
let explainGeneration = 0
let explainController: AbortController | undefined

export const explain = async (name: string) => {
  explainController?.abort()
  const gen = ++explainGeneration
  const session = captureBackendSession()
  if (!session) {
    explainController = undefined
    explaining.value = false
    return
  }
  const requestController = new AbortController()
  explainController = requestController
  const stale = () => gen !== explainGeneration || !backendSessionIsCurrent(session)
  explaining.value = true
  explanationError.value = ''
  try {
    const res = await resolveTestAPI(name, requestController.signal)
    if (stale()) return
    if (res.status === 200 && res.data) {
      explanation.value = res.data
      return
    }
    explanation.value = null
    explanationError.value = messageOf(res) || `resolve returned ${res.status}`
  } catch (e) {
    if (stale()) return
    explanation.value = null
    explanationError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (!stale()) explaining.value = false
  }
}

export const flushCache = async () => {
  await flushDnsCacheAPI()
  await refreshDns()
}

export const stopDns = () => {
  cancelDnsRead()
  logController?.abort()
  logController = undefined
  explainController?.abort()
  explainController = undefined
  explainGeneration += 1
  statsRequest.cancel()
  subscriptionRequest.cancel()
  lastTotal = -1
  lastAt = 0
  qps.value = 0
  qpsHistory.value = makeQpsHistory()
  chinaLatencyHistory.value = makeQpsHistory()
  trustLatencyHistory.value = makeQpsHistory()
  dnsWriter.clear()
  dnsWritesPending.value = 0
  dnsWriteConflict.value = null
  dnsWriteError.value = ''
  dnsDocument.value = null
  dnsStats.value = null
  dnsSubscriptions.value = []
  dnsRevision.value = ''
  dnsStatus.value = 'idle'
  dnsError.value = ''
  queryLog.value = []
  explanation.value = null
  if (activeBackendSession.value) {
    if (samplers > 0) void sampleOnce()
    if (subscriptionSamplers > 0) void sampleSubscriptionsOnce()
  }
}

watch(activeBackendSession, (_session, previous) => {
  if (previous !== undefined) stopDns()
})
