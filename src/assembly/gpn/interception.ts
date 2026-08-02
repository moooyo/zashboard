import type { GpnCandidate, GpnInterception, GpnInterceptionEnvelope } from '@/api/gpn'
import {
  applyExtensionUpdateAPI,
  checkExtensionUpdateAPI,
  deleteExtensionAPI,
  fetchInterceptionAPI,
  installExtensionAPI,
  putExtensionCaptureDNSAPI,
  putExtensionEgressAPI,
  putExtensionEnabledAPI,
  putExtensionSettingAPI,
  putInterceptionOrderAPI,
  putInterceptionSettingsAPI,
  reviewExtensionAPI,
} from '@/api/gpn'
import { activeUuid } from '@/store/setup'
import { ref } from 'vue'
import { featureSupported } from './capabilities'

/**
 * 拦截子系统的状态。
 *
 * 五态而非「数据 or null」:'absent' 与 'error' 必须分开。核心在引擎没装上时
 * 返回 503,那与「拦截已关闭」是两回事 —— 后者是一份加载成功并声明 enabled:false
 * 的文档,前者是一份根本没能加载的文档。把两者渲染成同一个界面,等于告诉操作者
 * 他的配置正在被遵守,而实际上没有人在读它。
 */
export type InterceptionStatus = 'idle' | 'loading' | 'ready' | 'absent' | 'error'

export const interceptionStatus = ref<InterceptionStatus>('idle')
export const interception = ref<GpnInterception | null>(null)
export const interceptionRevision = ref('')
export const interceptionError = ref('')

export const interceptionSupported = featureSupported('gpn-interception')

// 与 capabilities 同样的双重护栏:代数挡住同一后端内的乱序响应,uuid 挡住
// 切换后端后旧后端的迟到响应。
let generation = 0
let controller: AbortController | undefined

const adopt = (data: GpnInterceptionEnvelope) => {
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
  let data: GpnInterceptionEnvelope | undefined
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
 * 每个写操作都走这里。
 *
 * 409 不覆盖,而是把最新状态取回来并让调用方看见冲突:两个标签页同时开着扩展
 * 页是常态,而这一页上的「最后一次写获胜」意味着某个扩展在没有人决定的情况下
 * 开始或停止解密流量。
 */
const write = async (
  call: (revision: string) => Promise<{ status: number; data?: unknown }>,
): Promise<string> => {
  if (!interceptionRevision.value) return 'no revision'
  try {
    const res = await call(interceptionRevision.value)
    if (res.status === 200 && res.data) {
      adopt(res.data as GpnInterceptionEnvelope)
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

export const setInterceptionSettings = (settings: {
  enabled: boolean
  http2: boolean
  quicFallbackProtection: boolean
}) => write((revision) => putInterceptionSettingsAPI({ revision, ...settings }))

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
  candidate: GpnCandidate,
  source: { url?: string; content?: string },
) => write((revision) => installExtensionAPI({ revision, digest: candidate.digest, ...source }))

export const applyReviewedUpdate = (id: string, candidate: GpnCandidate) =>
  write((revision) => applyExtensionUpdateAPI(id, { revision, digest: candidate.digest }))

/**
 * 审阅一份候选。只读取,不改任何状态 —— 它返回的 digest 才是安装时要带回来的
 * 凭据,而重新审阅一次是免费的。
 */
export const reviewExtension = async (source: {
  url?: string
  content?: string
}): Promise<{ candidate?: GpnCandidate; error: string }> => {
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
): Promise<{ candidate?: GpnCandidate; error: string }> => {
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

export const stopInterception = () => {
  controller?.abort()
  controller = undefined
  generation++
  interception.value = null
  interceptionRevision.value = ''
  interceptionStatus.value = 'idle'
  interceptionError.value = ''
}
