// API layer · global interceptors for the Axios instance.
// This is the only API-layer module allowed to depend on store/setup: requests
// obtain the current target (baseURL and authentication) from activeBackend.
// All other API modules must remain independent of higher layers.
import { ROUTE_NAME } from '@/constant'
import { showNotification } from '@/helper/notification'
import { getUrlFromBackend } from '@/helper/utils'
import { activeBackend, activeUuid } from '@/store/setup'
import axios, { AxiosError } from 'axios'
import { nextTick } from 'vue'

axios.interceptors.request.use((config) => {
  if (activeBackend.value) {
    config.baseURL = getUrlFromBackend(activeBackend.value)
    config.headers['Authorization'] = 'Bearer ' + activeBackend.value.password
  }
  return config
})

const ignoreNotificationUrls = [
  '/delay',
  '/healthcheck',
  '/weights',
  '/storage/zashboard',
  // Capability discovery probes endpoints a stock core does not have. A 404 is
  // the expected answer there, not something to raise a toast about — and
  // resolving instead of rejecting is what lets the caller branch on `status`.
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
  null,
  async (
    error: AxiosError<{
      message: string
    }>,
  ) => {
    if (error.status === 401 && activeUuid.value) {
      const { default: router } = await import('@/router')
      const currentBackendUuid = activeUuid.value
      activeUuid.value = null
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
      return Promise.reject(error)
    }

    return error
  },
)
