import type {
  FiveGPNCandidate,
  FiveGPNCatalogSource,
  FiveGPNCatalogSourceView,
  FiveGPNEngineLog,
  FiveGPNInterception,
  FiveGPNInterceptionEnvelope,
} from '@/api/fivegpn'
import {
  applyCatalogUpdateAPI,
  applyExtensionUpdateAPI,
  checkExtensionUpdateAPI,
  deleteExtensionAPI,
  fetchCatalogAPI,
  fetchEngineLogsAPI,
  fetchInterceptionAPI,
  installExtensionAPI,
  putCatalogSourcesAPI,
  putExtensionCaptureDNSAPI,
  putExtensionEgressAPI,
  putExtensionEnabledAPI,
  putExtensionSettingAPI,
  putInterceptionOrderAPI,
  putInterceptionSettingsAPI,
  reviewCatalogEntryAPI,
  reviewExtensionAPI,
} from '@/api/fivegpn'
import { activeUuid } from '@/store/setup'
import { ref } from 'vue'
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
// out-of-order responses from one backend, while UUID rejects late responses
// from the previous backend after a switch.
let generation = 0
let controller: AbortController | undefined

const adopt = (data: FiveGPNInterceptionEnvelope) => {
  interception.value = data.snapshot
  interceptionRevision.value = data.revision
  interceptionStatus.value = 'ready'
  interceptionError.value = ''
}

export const refreshInterception = async () => {
  controller?.abort()
  controller = new AbortController()
  const gen = ++generation
  const uuid = activeUuid.value
  const stale = () => gen !== generation || uuid !== activeUuid.value

  if (!uuid) {
    interceptionStatus.value = 'idle'
    return
  }

  interceptionStatus.value = 'loading'
  interceptionError.value = ''

  let status = 0
  let data: FiveGPNInterceptionEnvelope | undefined
  try {
    const res = await fetchInterceptionAPI(controller.signal)
    status = res.status
    data = res.data
  } catch (e) {
    if (stale()) return
    interceptionStatus.value = 'error'
    interceptionError.value = e instanceof Error ? e.message : String(e)
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

const messageOf = (res: { data?: unknown }) => {
  const data = res.data as { message?: string } | undefined
  return data?.message ?? ''
}

/**
 * Every write operation passes through this function.
 *
 * A 409 does not overwrite state. It fetches the latest state and exposes the
 * conflict to the caller. Having the extensions page open in two tabs is normal,
 * and last-write-wins here could make an extension start or stop decrypting
 * traffic without an operator deciding to do so.
 */
const write = async (
  call: (revision: string) => Promise<{ status: number; data?: unknown }>,
): Promise<string> => {
  if (!interceptionRevision.value) return 'no revision'
  try {
    const res = await call(interceptionRevision.value)
    if (res.status === 200 && res.data) {
      adopt(res.data as FiveGPNInterceptionEnvelope)
      return ''
    }
    if (res.status === 409) {
      await refreshInterception()
      return 'conflict'
    }
    return messageOf(res) || `interception returned ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export const setInterceptionSettings = (settings: { enabled: boolean; http2: boolean }) =>
  write((revision) => putInterceptionSettingsAPI({ revision, ...settings }))

export const setExecutionOrder = (order: string[]) =>
  write((revision) => putInterceptionOrderAPI({ revision, order }))

export const setExtensionEnabled = (id: string, enabled: boolean) =>
  write((revision) => putExtensionEnabledAPI(id, { revision, enabled }))

export const setExtensionEgress = (id: string, group: string) =>
  write((revision) => putExtensionEgressAPI(id, { revision, group }))

export const setExtensionCaptureDNS = (id: string, resolver: string) =>
  write((revision) => putExtensionCaptureDNSAPI(id, { revision, resolver }))

export const setExtensionSetting = (id: string, key: string, value: unknown) =>
  write((revision) => putExtensionSettingAPI(id, key, { revision, value }))

export const uninstallExtension = (id: string) =>
  write((revision) => deleteExtensionAPI(id, { revision }))

export const installReviewed = (
  candidate: FiveGPNCandidate,
  source: { url?: string; content?: string },
) => write((revision) => installExtensionAPI({ revision, digest: candidate.digest, ...source }))

export const applyReviewedUpdate = (id: string, candidate: FiveGPNCandidate) =>
  write((revision) => applyExtensionUpdateAPI(id, { revision, digest: candidate.digest }))

/**
 * Review a candidate without changing state. The returned digest is the
 * credential supplied during installation, and repeating a review is harmless.
 */
export const reviewExtension = async (source: {
  url?: string
  content?: string
}): Promise<{ candidate?: FiveGPNCandidate; error: string }> => {
  try {
    const res = await reviewExtensionAPI(source)
    if (res.status === 200 && res.data?.candidate) {
      return { candidate: res.data.candidate, error: '' }
    }
    return { error: messageOf(res) || `review returned ${res.status}` }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export const checkExtensionUpdate = async (
  id: string,
): Promise<{ candidate?: FiveGPNCandidate; error: string }> => {
  try {
    const res = await checkExtensionUpdateAPI(id)
    if (res.status === 200 && res.data?.candidate) {
      return { candidate: res.data.candidate, error: '' }
    }
    return { error: messageOf(res) || `update check returned ${res.status}` }
  } catch (e) {
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
    if (res.status === 200 && res.data) {
      engineLogs.value = res.data.logs ?? []
      engineLogError.value = ''
      return
    }
    engineLogError.value = `logs returned ${res.status}`
  } catch (e) {
    if (uuid !== activeUuid.value) return
    engineLogError.value = e instanceof Error ? e.message : String(e)
  }
}

export const catalogStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
export const catalogSources = ref<FiveGPNCatalogSourceView[]>([])
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
    return
  }
  catalogStatus.value = 'loading'
  catalogError.value = ''
  try {
    const res = await fetchCatalogAPI(refresh, catalogController.signal)
    if (stale()) return
    if (res.status !== 200 || !res.data?.catalog) {
      catalogStatus.value = 'error'
      catalogError.value = messageOf(res) || `catalog returned ${res.status}`
      return
    }
    catalogSources.value = res.data.catalog.sources ?? []
    catalogStatus.value = 'ready'
  } catch (e) {
    if (stale()) return
    catalogStatus.value = 'error'
    catalogError.value = e instanceof Error ? e.message : String(e)
  }
}

export const setCatalogSources = (sources: FiveGPNCatalogSource[]) =>
  write((revision) => putCatalogSourcesAPI({ revision, sources }))

/**
 * Updating from a catalog entry changes the extension source to that entry's
 * manifest URL.
 *
 * This is a separate call rather than a branch of applyReviewedUpdate. That path
 * rereads the URL used at installation, while this one replaces it. The operator
 * explicitly selected this catalog entry, so changing the source is the intended
 * result rather than a configuration side effect.
 */
export const applyCatalogUpdate = (source: string, entry: string, candidate: FiveGPNCandidate) =>
  write((revision) => applyCatalogUpdateAPI(source, entry, { revision, digest: candidate.digest }))

/**
 * Review a catalog entry. The returned URL is the source supplied during
 * installation. It comes from the server rather than being reconstructed from
 * the listing by the client, ensuring installation reads exactly what was reviewed.
 */
export const reviewCatalogEntry = async (
  source: string,
  entry: string,
): Promise<{ candidate?: FiveGPNCandidate; url?: string; error: string }> => {
  try {
    const res = await reviewCatalogEntryAPI(source, entry)
    if (res.status === 200 && res.data?.candidate) {
      return { candidate: res.data.candidate, url: res.data.url, error: '' }
    }
    return { error: messageOf(res) || `review returned ${res.status}` }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export const stopInterception = () => {
  controller?.abort()
  controller = undefined
  generation++
  interception.value = null
  interceptionRevision.value = ''
  interceptionStatus.value = 'idle'
  interceptionError.value = ''

  catalogController?.abort()
  catalogController = undefined
  catalogGeneration++
  catalogSources.value = []
  catalogStatus.value = 'idle'
  catalogError.value = ''
}
