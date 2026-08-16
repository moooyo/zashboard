import type {
  FiveGPNCandidate,
  FiveGPNCaptureDNS,
  FiveGPNCatalogSource,
  FiveGPNCatalogSourceView,
  FiveGPNInterception,
  FiveGPNInterceptionEnvelope,
  FiveGPNModuleDetail,
  FiveGPNSettingValue,
} from '@/api/fivegpn'
import {
  FIVEGPN_REVIEW_CONTRACT,
  applyCatalogUpdateAPI,
  deleteExtensionAPI,
  fetchCatalogAPI,
  fetchExtensionAPI,
  fetchInterceptionAPI,
  installExtensionAPI,
  putCatalogSourcesAPI,
  putExtensionCaptureDNSAPI,
  putExtensionEgressAPI,
  putExtensionEnabledAPI,
  putExtensionSettingsAPI,
  putInterceptionOrderAPI,
  putInterceptionSettingsAPI,
  retryInterceptionCertificateAPI,
  reviewCatalogEntryAPI,
  reviewExtensionAPI,
} from '@/api/fivegpn'
import { responseData, responseMessage, responseStatus } from '@/api/response'
import { catalogUpdateBody } from '@/helper/catalogReview'
import { withReviewContract } from '@/helper/fivegpnExtensionReview'
import { activeBackendSession, backendSessionIsCurrent, captureBackendSession } from '@/store/setup'
import { ref, watch } from 'vue'
import { featureSupported } from './capabilities'

/**
 * Interception subsystem state.
 *
 * Five states are used instead of "data or null" because 'absent' and 'error'
 * must remain distinct. The core returns 503 when the engine is unavailable,
 * which differs from "interception disabled": the latter is a successfully
 * loaded document declaring enabled:false, while the former is a document that
 * could not be loaded at all. Rendering both as the same screen would tell the
 * operator that configuration is being honored when nothing is reading it.
 */
export type InterceptionStatus = 'idle' | 'loading' | 'ready' | 'absent' | 'error'

export const interceptionStatus = ref<InterceptionStatus>('idle')
export const interception = ref<FiveGPNInterception | null>(null)
export const interceptionRevision = ref('')
export const interceptionError = ref('')

export const interceptionSupported = featureSupported('5gpn-interception')

// This uses the same double guard as capabilities: generation rejects
// out-of-order responses within one session, while the session epoch rejects
// responses from a backend that was switched or edited in place.
let generation = 0
const writeQueues = new Map<string, Promise<void>>()
let controller: AbortController | undefined

const cancelInterceptionRead = () => {
  controller?.abort()
  controller = undefined
  generation++
}

const adopt = (data: FiveGPNInterceptionEnvelope) => {
  interception.value = data.snapshot
  interceptionRevision.value = data.revision
  interceptionStatus.value = 'ready'
  interceptionError.value = ''
  syncInterceptionLifecyclePolling()
}

export const refreshInterception = async (background: boolean | Event = false) => {
  const inBackground = background === true
  controller?.abort()
  controller = new AbortController()
  const gen = ++generation
  const session = captureBackendSession()
  const stale = () => gen !== generation || !backendSessionIsCurrent(session)

  if (!session) {
    interceptionStatus.value = 'idle'
    return
  }

  if (!inBackground || !interception.value) {
    interceptionStatus.value = 'loading'
    interceptionError.value = ''
  }

  let status = 0
  let data: FiveGPNInterceptionEnvelope | undefined
  try {
    const res = await fetchInterceptionAPI(controller.signal)
    status = responseStatus(res)
    data = responseData<FiveGPNInterceptionEnvelope>(res)
  } catch (e) {
    if (stale()) return
    const status = responseStatus(e)
    if (status === 503) {
      interceptionStatus.value = 'absent'
      interception.value = null
      return
    }
    if (!inBackground || !interception.value) {
      interceptionStatus.value = 'error'
      interceptionError.value = responseMessage(e) || (e instanceof Error ? e.message : String(e))
    }
    return
  }
  if (stale()) return

  if (status === 503) {
    interceptionStatus.value = 'absent'
    interception.value = null
    return
  }
  if (status !== 200 || !data) {
    interceptionStatus.value = 'error'
    interceptionError.value = `interception returned ${status}`
    return
  }
  adopt(data)
}

const messageOf = (res: unknown) => {
  return responseMessage(res)
}

/**
 * Every write operation passes through this function.
 *
 * A 409 does not overwrite state. It fetches the latest state and exposes the
 * conflict to the caller. Having the extensions page open in two tabs is normal,
 * and last-write-wins here could make an extension start or stop decrypting
 * traffic without an operator deciding to do so.
 */
const write = (
  call: (revision: string) => Promise<{ status: number; data?: unknown }>,
  acceptedStatuses: readonly number[] = [200],
  expectedRevision?: string,
): Promise<string> => {
  const requestedSession = captureBackendSession()
  if (!requestedSession) return Promise.resolve('no backend')
  const execute = async () => {
    if (!backendSessionIsCurrent(requestedSession)) return 'backend changed'
    if (!interceptionRevision.value) return 'no revision'
    if (expectedRevision && expectedRevision !== interceptionRevision.value) return 'conflict'
    cancelInterceptionRead()
    detailController?.abort()
    detailController = undefined
    detailGeneration++
    inspectionController?.abort()
    inspectionController = undefined
    inspectionGeneration++
    try {
      const res = await call(expectedRevision ?? interceptionRevision.value)
      if (!backendSessionIsCurrent(requestedSession)) return 'backend changed'
      const status = responseStatus(res)
      const data = responseData<FiveGPNInterceptionEnvelope>(res)
      if (acceptedStatuses.includes(status) && data) {
        cancelInterceptionRead()
        adopt(data)
        return ''
      }
      if (status === 409) {
        await refreshInterception(true)
        return 'conflict'
      }
      return messageOf(res) || `interception returned ${status}`
    } catch (e) {
      if (!backendSessionIsCurrent(requestedSession)) return 'backend changed'
      if (responseStatus(e) === 409) {
        await refreshInterception(true)
        return 'conflict'
      }
      return responseMessage(e) || (e instanceof Error ? e.message : String(e))
    }
  }

  const sessionKey = String(requestedSession.epoch)
  const previous = writeQueues.get(sessionKey) ?? Promise.resolve()
  const result = previous.then(execute, execute)
  const tail = result.then(
    () => undefined,
    () => undefined,
  )
  writeQueues.set(sessionKey, tail)
  void tail.then(() => {
    if (writeQueues.get(sessionKey) === tail) writeQueues.delete(sessionKey)
  })
  return result
}

export const setInterceptionSettings = (settings: { enabled: boolean; http2: boolean }) =>
  write((revision) => putInterceptionSettingsAPI({ revision, ...settings }))

export const setExecutionOrder = (order: string[], expectedRevision: string) =>
  write(
    (revision) =>
      putInterceptionOrderAPI({
        revision,
        review_contract: FIVEGPN_REVIEW_CONTRACT,
        order,
      }),
    [200],
    expectedRevision,
  )

export function setExtensionEnabled(
  id: string,
  enabled: false,
  expectedRevision?: string,
  reviewContract?: undefined,
  signal?: AbortSignal,
): Promise<string>
export function setExtensionEnabled(
  id: string,
  enabled: true,
  expectedRevision: string,
  reviewContract: number,
  signal?: AbortSignal,
): Promise<string>
export function setExtensionEnabled(
  id: string,
  enabled: boolean,
  expectedRevision?: string,
  reviewContract?: number,
  signal?: AbortSignal,
) {
  if (enabled) {
    const request = withReviewContract(reviewContract, FIVEGPN_REVIEW_CONTRACT, () =>
      write(
        (revision) =>
          putExtensionEnabledAPI(
            id,
            { revision, enabled: true, review_contract: FIVEGPN_REVIEW_CONTRACT },
            signal,
          ),
        [200],
        expectedRevision,
      ),
    )
    return request ?? Promise.resolve('review contract changed; reload the current state')
  }
  return write(
    (revision) => putExtensionEnabledAPI(id, { revision, enabled: false }, signal),
    [200],
    expectedRevision,
  )
}

export const setExtensionEgress = (id: string, group: string) =>
  write((revision) => putExtensionEgressAPI(id, { revision, group }))

export const setExtensionCaptureDNS = (id: string, resolver: FiveGPNCaptureDNS) =>
  write((revision) => putExtensionCaptureDNSAPI(id, { revision, resolver }))

export const setExtensionSettings = (
  id: string,
  values: Record<string, FiveGPNSettingValue>,
  expectedRevision: string,
) => write((revision) => putExtensionSettingsAPI(id, { revision, values }), [200], expectedRevision)

export const retryInterceptionCertificate = () => {
  const certificate = interception.value?.certificate
  if (!certificate?.target_digest || !certificate.attempt) return Promise.resolve('no retry target')
  return write(
    (revision) =>
      retryInterceptionCertificateAPI({
        revision,
        target_digest: certificate.target_digest!,
        attempt: certificate.attempt!,
      }),
    [202],
  )
}

export const uninstallExtension = (id: string) =>
  write((revision) => deleteExtensionAPI(id, { revision }))

export const installReviewed = (
  candidate: FiveGPNCandidate,
  source: { url?: string; content?: string },
  expectedRevision: string,
  signal?: AbortSignal,
) => {
  const request = withReviewContract(
    candidate.detail.review_contract,
    FIVEGPN_REVIEW_CONTRACT,
    () =>
      write(
        (revision) =>
          installExtensionAPI(
            {
              revision,
              review_contract: FIVEGPN_REVIEW_CONTRACT,
              digest: candidate.digest,
              ...source,
            },
            signal,
          ),
        [200],
        expectedRevision,
      ),
  )
  return request ?? Promise.resolve('review contract changed; reload the current state')
}

let detailGeneration = 0
let detailController: AbortController | undefined

export const fetchExtensionDetail = async (
  id: string,
): Promise<{ detail?: FiveGPNModuleDetail; revision?: string; error: string }> => {
  detailController?.abort()
  detailController = new AbortController()
  const gen = ++detailGeneration
  const session = captureBackendSession()
  const stale = () => gen !== detailGeneration || !backendSessionIsCurrent(session)
  if (!session) return { error: 'no backend' }
  try {
    const res = await fetchExtensionAPI(id, detailController.signal)
    if (stale()) return { error: 'backend changed' }
    const status = responseStatus(res)
    const data = responseData<{ extension: FiveGPNModuleDetail; revision: string }>(res)
    if (status !== 200 || !data?.extension) {
      return { error: messageOf(res) || `extension returned ${status}` }
    }
    if (data.revision !== interceptionRevision.value) {
      await refreshInterception(true)
      return { error: 'conflict' }
    }
    return { detail: data.extension, revision: data.revision, error: '' }
  } catch (e) {
    if (stale()) return { error: '' }
    return { error: responseMessage(e) || (e instanceof Error ? e.message : String(e)) }
  }
}

let inspectionGeneration = 0
let inspectionController: AbortController | undefined

const inspectionContext = () => {
  inspectionController?.abort()
  inspectionController = new AbortController()
  return {
    generation: ++inspectionGeneration,
    session: captureBackendSession(),
    signal: inspectionController.signal,
  }
}

const inspectionStale = (context: ReturnType<typeof inspectionContext>) =>
  context.generation !== inspectionGeneration || !backendSessionIsCurrent(context.session)

export const cancelInterceptionInspection = () => {
  inspectionController?.abort()
  inspectionController = undefined
  inspectionGeneration++
}

type InspectedExtensionDetail = {
  detail?: FiveGPNModuleDetail
  revision?: string
  error: string
}

const fetchInspectedExtensionDetail = async (
  id: string,
  context: ReturnType<typeof inspectionContext>,
): Promise<InspectedExtensionDetail> => {
  try {
    const res = await fetchExtensionAPI(id, context.signal)
    if (inspectionStale(context)) return { error: 'backend changed' }
    const status = responseStatus(res)
    const data = responseData<{ extension: FiveGPNModuleDetail; revision: string }>(res)
    if (status !== 200 || !data?.extension) {
      return { error: messageOf(res) || `extension returned ${status}` }
    }
    if (data.revision !== interceptionRevision.value) {
      await refreshInterception(true)
      return { error: 'conflict' }
    }
    return { detail: data.extension, revision: data.revision, error: '' }
  } catch (e) {
    if (inspectionStale(context)) return { error: 'backend changed' }
    return { error: responseMessage(e) || (e instanceof Error ? e.message : String(e)) }
  }
}

export const inspectExtensionDetail = async (id: string): Promise<InspectedExtensionDetail> => {
  const context = inspectionContext()
  if (!context.session) return { error: 'no backend' }
  return fetchInspectedExtensionDetail(id, context)
}

/**
 * Review a candidate without changing state. The returned digest is the
 * credential supplied during installation, and repeating a review is harmless.
 */
export const reviewExtension = async (source: {
  url?: string
  content?: string
}): Promise<{ candidate?: FiveGPNCandidate; revision?: string; error: string }> => {
  const context = inspectionContext()
  if (!context.session) return { error: 'no backend' }
  try {
    const res = await reviewExtensionAPI(source, context.signal)
    if (inspectionStale(context)) return { error: 'backend changed' }
    const status = responseStatus(res)
    const data = responseData<{ candidate: FiveGPNCandidate; revision: string }>(res)
    if (status === 200 && data?.candidate) {
      if (data.revision !== interceptionRevision.value) {
        await refreshInterception(true)
        return { error: 'conflict' }
      }
      return { candidate: data.candidate, revision: data.revision, error: '' }
    }
    return { error: messageOf(res) || `review returned ${status}` }
  } catch (e) {
    if (inspectionStale(context)) return { error: '' }
    if (responseStatus(e) === 409) {
      await refreshInterception(true)
      return { error: 'conflict' }
    }
    return { error: responseMessage(e) || (e instanceof Error ? e.message : String(e)) }
  }
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Catalog state remains separate from interception state.
 *
 * The catalog is not gateway state. One fetch failure must not prevent the
 * extensions page from describing what is already installed. When the listing
 * is unavailable, installed extensions must still be readable, toggleable, and
 * removable.
 */
export const catalogStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
export const catalogSources = ref<FiveGPNCatalogSourceView[]>([])
export const catalogRevision = ref('')
export const catalogError = ref('')

let catalogGeneration = 0
let catalogController: AbortController | undefined

export const refreshCatalog = async (refresh = false) => {
  catalogController?.abort()
  catalogController = new AbortController()
  const gen = ++catalogGeneration
  const session = captureBackendSession()
  const stale = () => gen !== catalogGeneration || !backendSessionIsCurrent(session)

  if (!session) {
    catalogStatus.value = 'idle'
    catalogRevision.value = ''
    return
  }
  catalogStatus.value = 'loading'
  catalogError.value = ''
  try {
    const res = await fetchCatalogAPI(refresh, catalogController.signal)
    if (stale()) return
    const status = responseStatus(res)
    const data = responseData<{
      catalog: { sources: FiveGPNCatalogSourceView[] }
      revision: string
    }>(res)
    if (status !== 200 || !data?.catalog) {
      catalogStatus.value = 'error'
      catalogError.value = messageOf(res) || `catalog returned ${status}`
      return
    }
    catalogSources.value = data.catalog.sources ?? []
    catalogRevision.value = data.revision
    catalogStatus.value = 'ready'
    if (data.revision !== interceptionRevision.value) await refreshInterception(true)
  } catch (e) {
    if (stale()) return
    catalogStatus.value = 'error'
    catalogError.value = responseMessage(e) || (e instanceof Error ? e.message : String(e))
  }
}

export const setCatalogSources = (sources: FiveGPNCatalogSource[], expectedRevision: string) =>
  write((revision) => putCatalogSourcesAPI({ revision, sources }), [200], expectedRevision)

/**
 * Updating from a catalog entry changes the extension source to that entry's
 * manifest URL.
 *
 * The operator explicitly selected this marketplace entry, so changing the
 * source is the intended reviewed result. No ordinary installed-source update
 * path is exposed by the Console.
 */
export const applyCatalogUpdate = (
  source: string,
  entry: string,
  candidate: FiveGPNCandidate,
  reviewedURL: string,
  expectedRevision: string,
  values?: Record<string, FiveGPNSettingValue>,
  signal?: AbortSignal,
) => {
  const request = withReviewContract(
    candidate.detail.review_contract,
    FIVEGPN_REVIEW_CONTRACT,
    () =>
      write(
        (revision) =>
          applyCatalogUpdateAPI(
            source,
            entry,
            {
              ...catalogUpdateBody(revision, candidate, reviewedURL, values),
              review_contract: FIVEGPN_REVIEW_CONTRACT,
            },
            signal,
          ),
        [200],
        expectedRevision,
      ),
  )
  return request ?? Promise.resolve('review contract changed; reload the current state')
}

/**
 * Review a catalog entry. The returned URL is the source supplied during
 * installation. It comes from the server rather than being reconstructed from
 * the listing by the client, ensuring installation reads exactly what was reviewed.
 */
export const reviewCatalogEntry = async (
  source: string,
  entry: string,
): Promise<{
  candidate?: FiveGPNCandidate
  installedDetail?: FiveGPNModuleDetail
  url?: string
  revision?: string
  error: string
}> => {
  const context = inspectionContext()
  if (!context.session) return { error: 'no backend' }
  try {
    const res = await reviewCatalogEntryAPI(source, entry, context.signal)
    if (inspectionStale(context)) return { error: 'backend changed' }
    const status = responseStatus(res)
    const data = responseData<{ candidate: FiveGPNCandidate; url: string; revision: string }>(res)
    if (status === 200 && data?.candidate) {
      if (data.revision !== interceptionRevision.value) {
        await refreshInterception(true)
        return { error: 'conflict' }
      }
      let installedDetail: FiveGPNModuleDetail | undefined
      if (data.candidate.installed) {
        const installed = await fetchInspectedExtensionDetail(data.candidate.detail.id, context)
        if (installed.error || !installed.detail || installed.revision !== data.revision) {
          return { error: installed.error || 'conflict' }
        }
        installedDetail = installed.detail
      }
      return {
        candidate: data.candidate,
        installedDetail,
        url: data.url,
        revision: data.revision,
        error: '',
      }
    }
    return { error: messageOf(res) || `review returned ${status}` }
  } catch (e) {
    if (inspectionStale(context)) return { error: '' }
    if (responseStatus(e) === 409) {
      await refreshInterception(true)
      return { error: 'conflict' }
    }
    return { error: responseMessage(e) || (e instanceof Error ? e.message : String(e)) }
  }
}

let lifecycleTimer: ReturnType<typeof setTimeout> | undefined
let lifecyclePolling = false
let lifecycleDelay = 750

const clearLifecycleTimer = () => {
  if (lifecycleTimer) {
    clearTimeout(lifecycleTimer)
    lifecycleTimer = undefined
  }
}

const certificatePending = () =>
  interception.value?.certificate.status === 'pending' ||
  (interception.value?.modules ?? []).some(
    (module) => module.runtime?.phase === 'certificate_pending',
  )

const scheduleLifecyclePoll = (delay: number) => {
  clearLifecycleTimer()
  const session = captureBackendSession()
  lifecycleTimer = setTimeout(async () => {
    lifecycleTimer = undefined
    if (!lifecyclePolling || !backendSessionIsCurrent(session)) return
    await refreshInterception(true)
    if (!lifecyclePolling || !backendSessionIsCurrent(session) || !certificatePending()) return
    lifecycleDelay = Math.min(lifecycleDelay * 2, 5000)
    scheduleLifecyclePoll(lifecycleDelay)
  }, delay)
}

/**
 * Lifecycle polling is page-scoped and single-flight. A pending certificate is
 * an externally completed transaction, so the old frame remains visible while
 * one background read waits. Errors are stable and require an explicit retry;
 * they are never hammered in a loop.
 */
export const startInterceptionLifecyclePolling = () => {
  lifecyclePolling = true
  lifecycleDelay = 750
  if (certificatePending()) scheduleLifecyclePoll(lifecycleDelay)
}

export const syncInterceptionLifecyclePolling = () => {
  if (!lifecyclePolling) return
  if (!certificatePending()) {
    clearLifecycleTimer()
    lifecycleDelay = 750
    return
  }
  if (!lifecycleTimer) scheduleLifecyclePoll(lifecycleDelay)
}

export const stopInterceptionLifecyclePolling = () => {
  lifecyclePolling = false
  clearLifecycleTimer()
  cancelInterceptionRead()
  detailController?.abort()
  detailController = undefined
  detailGeneration++
  inspectionController?.abort()
  inspectionController = undefined
  inspectionGeneration++
}

export const stopInterception = () => {
  stopInterceptionLifecyclePolling()
  interception.value = null
  interceptionRevision.value = ''
  interceptionStatus.value = 'idle'
  interceptionError.value = ''

  catalogController?.abort()
  catalogController = undefined
  catalogGeneration++
  catalogSources.value = []
  catalogRevision.value = ''
  catalogStatus.value = 'idle'
  catalogError.value = ''

  detailController?.abort()
  detailController = undefined
  detailGeneration++
  inspectionController?.abort()
  inspectionController = undefined
  inspectionGeneration++
}

watch(activeBackendSession, (_session, previous) => {
  if (previous !== undefined) stopInterception()
})
