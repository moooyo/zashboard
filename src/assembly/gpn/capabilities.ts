import { fetchCapabilitiesAPI } from '@/api/gpn'
import { activeUuid } from '@/store/setup'
import { computed, ref } from 'vue'

/**
 * 能力发现 · 一次探测,N 个特性。
 *
 * 四态而非布尔值的理由:三者的正确 UI 反应完全不同。
 * 'unknown' 必须什么都不渲染(还不知道,渲染一个空面板等于撒谎),
 * 'unsupported' 永久隐藏,
 * 'temporarily-unavailable' 保留重试而不是把「暂时不可达」缓存成「不支持」。
 * 把后两者合并,一次 5xx 就会让面板在核心恢复后仍然消失。
 */
export type FeatureState = 'unknown' | 'supported' | 'unsupported' | 'temporarily-unavailable'

/**
 * 本前端理解的 schema 版本。核心报出更新的版本一律按 unsupported 处理 ——
 * 字段含义可能已经变了,照旧渲染等于对操作者展示一份可能是错的状态。
 *
 * 这张表同时是**门控白名单**:下面的探测只遍历这里的 key,所以核心宣称了、
 * 而这里没有列出的特性,状态永远停在 'unknown',`featureSupported` 永远是
 * false,对应的面板永远不渲染。加一个新子系统时必须同时加进这里 —— 否则
 * 后端全通、验收全绿,而界面上什么都没有。gpn-bot 就这样漏过一次。
 *
 * 反过来,这里列了而核心不宣称的 key 会永久是 'unsupported',那是死条目:
 * 它描述了一个不存在的特性,读这张表的人会以为它还在。
 */
export const UNDERSTOOD_SCHEMA_VERSIONS: Record<string, number> = {
  'gpn-dns': 1,
  'gpn-interception': 1,
  'gpn-bot': 1,
}

const RETRY_DELAY = 15000
const PROBE_TIMEOUT = 5000

const states = ref<Record<string, FeatureState>>({})
const versions = ref<Record<string, number>>({})
const owners = ref<Record<string, string>>({})

export const capabilityError = ref('')

/** 某个特性的四态。未探测到的 key 一律是 'unknown'。 */
export const featureState = (key: string) => computed(() => states.value[key] ?? 'unknown')

/**
 * 派生布尔值,只给路由/导航门控用。
 *
 * capabilities 是布尔类型且被 `!cap` 消费,直接把四态字符串塞进去会让
 * 'unknown' 和 'unsupported' 都变成真值,每个门控都反向。
 */
export const featureSupported = (key: string) => computed(() => states.value[key] === 'supported')

/** 特性宣称的 owner,未知时是空串。 */
export const featureOwner = (key: string) => computed(() => owners.value[key] ?? '')

/** 核心报出的 schema 版本,未知时是 0。 */
export const featureVersion = (key: string) => computed(() => versions.value[key] ?? 0)

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
  states.value = {}
  versions.value = {}
  owners.value = {}
  capabilityError.value = ''
}

/** 把所有已知特性置为同一个状态。用于「整个核心不可达/不支持」这类结论。 */
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
 * 探测一次 /capabilities 并解出全部特性状态。
 *
 * 注意 status 为 0 的情况:api/http.ts 的响应拦截器对 ignoreNotificationUrls
 * 里的路径是 resolve 而不是 reject,调用方拿到的是 AxiosError 而不是
 * AxiosResponse,data 是 undefined。所以这里先判 status,绝不先解构 data。
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
    // 网络错误 / 中止 / 超时 —— 不可达,不等于不支持。
    setAll('temporarily-unavailable')
    capabilityError.value = e instanceof Error ? e.message : String(e)
    scheduleRetry()
    return
  }
  if (stale()) return

  if (status === 404) {
    // 这个核心根本没有 /capabilities:它不是 5gpn 内核。永久结论。
    setAll('unsupported')
    return
  }
  if (status === 401) {
    // 拦截器已经登出并跳转到 setup 了,这里不要再叠加状态。
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
