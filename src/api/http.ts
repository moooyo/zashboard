// API layer · global interceptors for the Axios instance.
// This is the only API-layer module allowed to depend on store/setup: requests
// obtain the current target (baseURL and authentication) from activeBackend.
// All other API modules must remain independent of higher layers.
import { ROUTE_NAME } from '@/constant'
import { showNotification } from '@/helper/notification'
import { getUrlFromBackend } from '@/helper/utils'
import { activeBackend, activeBackendSession, activeUuid } from '@/store/setup'
import axios, { AxiosError, type GenericAbortSignal } from 'axios'
import { nextTick } from 'vue'

const requestSessionEpochs = new WeakMap<object, number>()

const combineSignals = (request: GenericAbortSignal | undefined, session: AbortSignal) => {
  if (!request || request === session) return session
  if (
    typeof request.addEventListener !== 'function' ||
    typeof request.removeEventListener !== 'function' ||
    !('reason' in request) ||
    !('throwIfAborted' in request)
  ) {
    return request.aborted ? AbortSignal.abort() : session
  }
  return AbortSignal.any([request as AbortSignal, session])
}

axios.interceptors.request.use((config) => {
  const backend = activeBackend.value
  const session = activeBackendSession.value
  if (backend && session) {
    config.baseURL = getUrlFromBackend(backend)
    config.headers['Authorization'] = 'Bearer ' + backend.password
    requestSessionEpochs.set(config, session.epoch)
    config.signal = combineSignals(config.signal, session.signal)
  }
  return config
})

const ignoreNotificationUrls = [
  '/delay',
  '/healthcheck',
  '/weights',
  '/storage/zashboard',
  // Capability discovery probes endpoints a stock core does not have. A 404 is
  // the expected answer there, not something to raise a toast about.
  '/capabilities',
  '/5gpn',
]

// endsWith alone never matched the entries that name a path *prefix*:
// '/5gpn' is listed, but the request is '/5gpn/<subsystem>', so every probe
// against a stock core raised a toast the list existed to suppress. Sub-paths
// have to be matched as sub-paths.
const ignoresNotification = (url?: string) =>
  !!url && ignoreNotificationUrls.some((u) => url.endsWith(u) || url.includes(u + '/'))

axios.interceptors.response.use(
  (response) => {
    const epoch = requestSessionEpochs.get(response.config)
    if (epoch !== undefined && epoch !== activeBackendSession.value?.epoch) {
      return Promise.reject(
        new AxiosError(
          'backend session changed',
          AxiosError.ERR_CANCELED,
          response.config,
          response.request,
          response,
        ),
      )
    }
    return response
  },
  async (
    error: AxiosError<{
      message: string
    }>,
  ) => {
    const requestEpoch = error.config ? requestSessionEpochs.get(error.config) : undefined
    const stale = requestEpoch !== undefined && requestEpoch !== activeBackendSession.value?.epoch
    if (stale) return Promise.reject(error)

    if ((error.status === 401 || error.response?.status === 401) && activeUuid.value) {
      const { default: router } = await import('@/router')
      const currentBackendUuid = activeUuid.value
      activeUuid.value = ''
      router.push({
        name: ROUTE_NAME.setup,
        query: { editBackend: currentBackendUuid },
      })
      nextTick(() => {
        showNotification({ content: 'unauthorizedTip' })
      })
    } else if (!ignoresNotification(error.config?.url)) {
      const errorMessage = error.response?.data?.message || error.message

      showNotification({
        key: errorMessage,
        // `raw`, not `content`: both halves are server-controlled — the URL is
        // echoed back and errorMessage is the response body's message field —
        // so neither may reach the translator or a markup sink.
        raw: `${decodeURIComponent(error.config?.url || '')} \n${errorMessage}`,
        type: 'alert-error',
      })
    }

    // Suppressing a notification never changes the promise contract. Returning
    // AxiosError as a fulfilled value made every caller carry two incompatible
    // response shapes and allowed failed controller writes to look successful.
    return Promise.reject(error)
  },
)
