import type { OverlayReadback } from '@/api/overlay'
import { fetchOverlayCapabilitiesAPI, fetchOverlayReadbackAPI } from '@/api/overlay'
import { activeUuid } from '@/store/setup'
import { computed, ref } from 'vue'

/**
 * 能力发现的四个状态。
 *
 * 之所以不是布尔值:三者的正确 UI 反应完全不同。'unknown' 必须什么都不渲染
 * (还不知道,渲染一个空面板等于撒谎),'unsupported' 永久隐藏,
 * 'temporarily-unavailable' 保留重试而不是把「暂时不可达」缓存成「不支持」。
 * 把后两者合并,一次 5xx 就会让面板在核心恢复后仍然消失。
 */
export type FeatureState = 'unknown' | 'supported' | 'unsupported' | 'temporarily-unavailable'

/** 本前端理解的 overlay schema 版本。更新的版本一律按 unsupported 处理。 */
const UNDERSTOOD_SCHEMA_VERSION = 1

const FEATURE_KEY = 'runtime-overlays'
const RETRY_DELAY = 15000

export const overlayState = ref<FeatureState>('unknown')
export const overlayOwner = ref('')
export const overlaySchemaVersion = ref(0)
export const overlayReadback = ref<OverlayReadback | null>(null)
export const overlayError = ref('')

/** 只把派生布尔值暴露给路由/导航。capabilities 是布尔类型且被 `!` 消费,
 * 塞一个四态字符串进去会让 'unknown' 和 'unsupported' 都变成真值。 */
export const overlaySupported = computed(() => overlayState.value === 'supported')

// 请求代数 + backend uuid 双重护栏。前者挡住同一后端内的乱序响应,
// 后者挡住切换后端后旧后端的迟到响应污染新后端的状态。
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
  overlayState.value = 'unknown'
  overlayOwner.value = ''
  overlaySchemaVersion.value = 0
  overlayReadback.value = null
  overlayError.value = ''
}

/**
 * 把一次探测的 HTTP 结果映射到状态。
 *
 * 注意 status 为 0 的情况:api/http.ts 的响应拦截器对 ignoreNotificationUrls
 * 里的路径是 resolve 而不是 reject,调用方拿到的是 AxiosError 而不是
 * AxiosResponse,data 是 undefined。所以这里先判 status,绝不先解构 data。
 */
export const initOverlayDiscovery = async () => {
  clearRetry()
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal
  const gen = ++generation
  const uuid = activeUuid.value

  reset()
  if (!uuid) {
    return
  }

  const stale = () => gen !== generation || uuid !== activeUuid.value

  let status = 0
  let data: Awaited<ReturnType<typeof fetchOverlayCapabilitiesAPI>>['data'] | undefined
  try {
    const res = await fetchOverlayCapabilitiesAPI(signal)
    status = res.status
    data = res.data
  } catch (e) {
    if (stale()) return
    // 网络错误 / 中止 / 超时 —— 不可达,不等于不支持。
    overlayState.value = 'temporarily-unavailable'
    overlayError.value = e instanceof Error ? e.message : String(e)
    scheduleRetry()
    return
  }
  if (stale()) return

  if (status === 404) {
    overlayState.value = 'unsupported'
    return
  }
  if (status === 401) {
    // 拦截器已经登出并跳转到 setup 了,这里不要再叠加状态。
    return
  }
  if (status >= 500 || status === 0) {
    overlayState.value = 'temporarily-unavailable'
    scheduleRetry()
    return
  }

  const feature = data?.features?.[FEATURE_KEY]
  if (!feature) {
    overlayState.value = 'unsupported'
    return
  }
  overlaySchemaVersion.value = feature.version
  if (feature.version !== UNDERSTOOD_SCHEMA_VERSION) {
    // 未来的 schema 绝不静默当作支持:字段含义可能已经变了,照旧渲染
    // 等于对操作者展示一份可能是错的状态。
    overlayState.value = 'unsupported'
    overlayError.value = `schema version ${feature.version}`
    return
  }

  overlayOwner.value = feature.owner ?? ''
  overlayState.value = 'supported'
  await refreshOverlayReadback()
}

/** 拉取权威状态。发现成功后才有意义。 */
export const refreshOverlayReadback = async () => {
  if (overlayState.value !== 'supported' || !overlayOwner.value) {
    return
  }
  const gen = generation
  const uuid = activeUuid.value
  try {
    const { status, data } = await fetchOverlayReadbackAPI(overlayOwner.value, controller?.signal)
    if (gen !== generation || uuid !== activeUuid.value) return
    if (status !== 200 || !data) {
      overlayError.value = `readback returned ${status}`
      return
    }
    overlayReadback.value = data
    overlayError.value = ''
  } catch (e) {
    if (gen !== generation || uuid !== activeUuid.value) return
    overlayError.value = e instanceof Error ? e.message : String(e)
  }
}

const scheduleRetry = () => {
  clearRetry()
  const gen = generation
  const uuid = activeUuid.value
  retryTimer = setTimeout(() => {
    if (gen !== generation || uuid !== activeUuid.value) return
    void initOverlayDiscovery()
  }, RETRY_DELAY)
}

export const stopOverlayDiscovery = () => {
  clearRetry()
  controller?.abort()
  controller = undefined
  generation++
  reset()
}
