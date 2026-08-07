import type {
  FiveGPNCandidate,
  FiveGPNCatalogSource,
  FiveGPNCatalogSourceView,
  FiveGPNEngineLog,
  FiveGPNInterception,
  FiveGPNInterceptionEnvelope,
  FiveGPNModuleDetail,
  FiveGPNSettingValue,
} from '@/api/fivegpn'
import {
  applyCatalogUpdateAPI,
  deleteExtensionAPI,
  fetchCatalogAPI,
  fetchEngineLogsAPI,
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
import { activeUuid } from '@/store/setup'
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

type ResponseLike<T = unknown> = {
  status?: number
  data?: T
  message?: string
  response?: {
    status?: number
    data?: T
  }
}

const responseStatus = (res: unknown) => {
  const response = res as ResponseLike
  return response.status ?? response.response?.status ?? 0
}

const responseData = <T>(res: unknown) => {
  const response = res as ResponseLike<T>
  return response.data ?? response.response?.data
}

// This uses the same double guard as capabilities: generation rejects
// out-of-order responses from one backend, while UUID rejects late responses
// from the previous backend after a switch.
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
  const uuid = activeUuid.value
  const stale = () => gen !== generation || uuid !== activeUuid.value

  if (!uuid) {
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
    if (!inBackground || !interception.value) {
      interceptionStatus.value = 'error'
      interceptionError.value = e instanceof Error ? e.message : String(e)
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
  const response = res as ResponseLike<{ message?: string }>
  return responseData<{ message?: string }>(response)?.message ?? response.message ?? ''
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
  const requestedUuid = activeUuid.value
  if (!requestedUuid) return Promise.resolve('no backend')
  const execute = async () => {
    if (requestedUuid !== activeUuid.value) return 'backend changed'
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
      if (requestedUuid !== activeUuid.value) return 'backend changed'
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
      return e instanceof Error ? e.message : String(e)
    }
  }

  const previous = writeQueues.get(requestedUuid) ?? Promise.resolve()
  const result = previous.then(execute, execute)
  const tail = result.then(
    () => undefined,
    () => undefined,
  )
  writeQueues.set(requestedUuid, tail)
  void tail.then(() => {
    if (writeQueues.get(requestedUuid) === tail) writeQueues.delete(requestedUuid)
  })
  return result
}

export const setInterceptionSettings = (settings: { enabled: boolean; http2: boolean }) =>
  write((revision) => putInterceptionSettingsAPI({ revision, ...settings }))

export const setExecutionOrder = (order: string[]) =>
  write((revision) => putInterceptionOrderAPI({ revision, order }))

export const setExtensionEnabled = (
  id: string,
  enabled: boolean,
  expectedRevision?: string,
  signal?: AbortSignal,
) =>
  write(
    (revision) => putExtensionEnabledAPI(id, { revision, enabled }, signal),
    [200],
    expectedRevision,
  )

export const setExtensionEgress = (id: string, group: string) =>
  write((revision) => putExtensionEgressAPI(id, { revision, group }))

export const setExtensionCaptureDNS = (id: string, resolver: string) =>
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
) =>
  write(
    (revision) => installExtensionAPI({ revision, digest: candidate.digest, ...source }, signal),
    [200],
    expectedRevision,
  )

let detailGeneration = 0
let detailController: AbortController | undefined

export const fetchExtensionDetail = async (
  id: string,
): Promise<{ detail?: FiveGPNModuleDetail; revision?: string; error: string }> => {
  detailController?.abort()
  detailController = new AbortController()
  const gen = ++detailGeneration
  const uuid = activeUuid.value
  const stale = () => gen !== detailGeneration || uuid !== activeUuid.value
  if (!uuid) return { error: 'no backend' }
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
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

let inspectionGeneration = 0
let inspectionController: AbortController | undefined

const inspectionContext = () => {
  inspectionController?.abort()
  inspectionController = new AbortController()
  return {
    generation: ++inspectionGeneration,
    uuid: activeUuid.value,
    signal: inspectionController.signal,
  }
}

const inspectionStale = (context: ReturnType<typeof inspectionContext>) =>
  context.generation !== inspectionGeneration || context.uuid !== activeUuid.value

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
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export const inspectExtensionDetail = async (id: string): Promise<InspectedExtensionDetail> => {
  const context = inspectionContext()
  if (!context.uuid) return { error: 'no backend' }
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
  if (!context.uuid) return { error: 'no backend' }
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
    return { error: e instanceof Error ? e.message : String(e) }
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
/**
 * Extension logs follow the DNS query-log model: one filtered read refreshed by
 * the operator.
 *
 * Do not poll automatically. Logs are inspected after a problem rather than
 * watched as a live instrument. Fetching them every few seconds would add
 * continuous control-plane load in exchange for an unread list.
 */
export const engineLogs = ref<FiveGPNEngineLog[]>([])
export const engineLogError = ref('')
export const engineLogFilter = ref('')
export const engineLogExtension = ref('')
export const engineLogLevel = ref('')

let logController: AbortController | undefined

export const refreshEngineLogs = async () => {
  logController?.abort()
  logController = new AbortController()
  const uuid = activeUuid.value
  if (!uuid) return
  try {
    const res = await fetchEngineLogsAPI(
      {
        contains: engineLogFilter.value || undefined,
        extension: engineLogExtension.value || undefined,
        level: engineLogLevel.value || undefined,
        limit: 500,
      },
      logController.signal,
    )
    if (uuid !== activeUuid.value) return
    const status = responseStatus(res)
    const data = responseData<{ logs: FiveGPNEngineLog[] }>(res)
    if (status === 200 && data) {
      engineLogs.value = data.logs ?? []
      engineLogError.value = ''
      return
    }
    engineLogError.value = messageOf(res) || `logs returned ${status}`
  } catch (e) {
    if (uuid !== activeUuid.value) return
    engineLogError.value = e instanceof Error ? e.message : String(e)
  }
}

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
  const uuid = activeUuid.value
  const stale = () => gen !== catalogGeneration || uuid !== activeUuid.value

  if (!uuid) {
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
    catalogError.value = e instanceof Error ? e.message : String(e)
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
  expectedRevision: string,
  values?: Record<string, FiveGPNSettingValue>,
  signal?: AbortSignal,
) =>
  write(
    (revision) =>
      applyCatalogUpdateAPI(
        source,
        entry,
        { revision, digest: candidate.digest, url: candidate.detail.source_url ?? '', values },
        signal,
      ),
    [200],
    expectedRevision,
  )

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
  if (!context.uuid) return { error: 'no backend' }
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
    return { error: e instanceof Error ? e.message : String(e) }
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
  const uuid = activeUuid.value
  lifecycleTimer = setTimeout(async () => {
    lifecycleTimer = undefined
    if (!lifecyclePolling || !uuid || uuid !== activeUuid.value) return
    await refreshInterception(true)
    if (!lifecyclePolling || uuid !== activeUuid.value || !certificatePending()) return
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

watch(activeUuid, (_uuid, previous) => {
  if (previous !== undefined) stopInterception()
})
