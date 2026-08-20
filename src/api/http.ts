// API layer · global interceptors for the Axios instance.
// This is the only API-layer module allowed to depend on store/setup: requests
// obtain the current target (baseURL and authentication) from activeBackend.
// All other API modules must remain independent of higher layers.
import { showNotification } from '@/helper/notification'
import { getUrlFromBackend } from '@/helper/utils'
import { activeBackend, activeBackendSession, activeUuid, openBackendManager } from '@/store/setup'
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

// 响应拦截器只做两件事:作废上一个后端会话的回包,以及「401 → 把这个后端的编辑框
// 摆到用户面前」。后者任何请求打到 401 都必须如此,不是「要不要提示用户」的问题。
// 密码过期要改的就是密码,所以直接打开编辑态 —— 以前是清空 activeUuid 再跳 setup
// 页带 query 把弹窗绕回来,一次密码失效就把人整个登出了,而他要做的只是改一个字段。
//
// 其余错误一律原样抛出,不在这里弹提示 —— 提示该由发起请求的业务层用 try-catch
// 决定(见 helper/requestError.ts):只有用户手动触发的动作才打扰用户,后台
// 自动拉取失败保持静默。以前靠 url 黑名单区分二者,加一个端点就得改一次名单,
// 而且拦截器根本不知道这次请求是谁发的、为什么发 —— 5gpn 的 /5gpn/* 能力探测
// 正是被这份名单漏掉的那类请求。
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
  (
    error: AxiosError<{
      message: string
    }>,
  ) => {
    const requestEpoch = error.config ? requestSessionEpochs.get(error.config) : undefined
    const stale = requestEpoch !== undefined && requestEpoch !== activeBackendSession.value?.epoch
    if (stale) return Promise.reject(error)

    if ((error.status === 401 || error.response?.status === 401) && activeUuid.value) {
      openBackendManager({ mode: 'edit', uuid: activeUuid.value })
      nextTick(() => {
        showNotification({ content: 'unauthorizedTip' })
      })
    }

    // Suppressing a notification never changes the promise contract. Returning
    // AxiosError as a fulfilled value made every caller carry two incompatible
    // response shapes and allowed failed controller writes to look successful.
    return Promise.reject(error)
  },
)
