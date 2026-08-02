import type {
  GpnDnsDocument,
  GpnDnsEnvelope,
  GpnDnsStats,
  GpnExplanation,
  GpnQueryLogEntry,
  GpnSubscriptionStatus,
} from '@/api/gpn'
import {
  fetchDnsAPI,
  fetchQueryLogAPI,
  flushDnsCacheAPI,
  putDnsAPI,
  resolveTestAPI,
} from '@/api/gpn'
import { activeUuid } from '@/store/setup'
import { ref } from 'vue'
import { featureSupported } from './capabilities'

/**
 * 解析器状态。
 *
 * 与拦截面一样是五态而不是「数据 or null」:'absent' 与 'error' 必须分开。
 * 503 是引擎没装上,不是「DNS 关掉了」;把两者渲染成同一个界面,等于告诉
 * 操作者他的策略正在生效,而实际上没有人在读它。
 */
export type DnsStatus = 'idle' | 'loading' | 'ready' | 'absent' | 'error'

export const dnsStatus = ref<DnsStatus>('idle')
export const dnsDocument = ref<GpnDnsDocument | null>(null)
export const dnsRevision = ref('')
export const dnsStats = ref<GpnDnsStats | null>(null)
export const dnsSubscriptions = ref<GpnSubscriptionStatus[]>([])
export const dnsError = ref('')

export const dnsSupported = featureSupported('gpn-dns')

// 与 capabilities 同样的双重护栏:代数挡住同一后端内的乱序响应,uuid 挡住
// 切换后端后旧后端的迟到响应。
let generation = 0
let controller: AbortController | undefined

const adopt = (data: GpnDnsEnvelope) => {
  dnsDocument.value = data.document
  dnsRevision.value = data.revision
  dnsStats.value = data.stats
  dnsSubscriptions.value = data.subscriptions ?? []
  dnsStatus.value = 'ready'
  dnsError.value = ''
}

export const refreshDns = async () => {
  controller?.abort()
  controller = new AbortController()
  const gen = ++generation
  const uuid = activeUuid.value
  const stale = () => gen !== generation || uuid !== activeUuid.value

  if (!uuid) {
    dnsStatus.value = 'idle'
    return
  }

  dnsStatus.value = 'loading'
  dnsError.value = ''

  let status = 0
  let data: GpnDnsEnvelope | undefined
  try {
    const res = await fetchDnsAPI(controller.signal)
    status = res.status
    data = res.data
  } catch (e) {
    if (stale()) return
    dnsStatus.value = 'error'
    dnsError.value = e instanceof Error ? e.message : String(e)
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
 * 保存整份文档。
 *
 * 写整份而不是逐字段,是因为这些编辑不是彼此独立的:换网关地址和换服务它的
 * 上游是一件事,分成两次写就会留下一个中间态,解析器在那一刻两边都不是。
 *
 * 409 表示别人在你读之后改过。这里直接把最新状态取回来并让调用方看见冲突,
 * 而不是覆盖 —— 两个标签页同时开着这一页是常态,不是异常。
 */
export const saveDns = async (document: GpnDnsDocument): Promise<string> => {
  if (!dnsRevision.value) return 'no revision'
  try {
    const res = await putDnsAPI({ revision: dnsRevision.value, document })
    if (res.status === 200 && res.data) {
      adopt(res.data)
      return ''
    }
    if (res.status === 409) {
      await refreshDns()
      return 'conflict'
    }
    return messageOf(res) || `dns returned ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

const messageOf = (res: { data?: unknown }) => {
  const data = res.data as { message?: string } | undefined
  return data?.message ?? ''
}

// --- 查询日志 --------------------------------------------------------------

export const queryLog = ref<GpnQueryLogEntry[]>([])
export const queryLogFilter = ref('')
export const queryLogError = ref('')

let logController: AbortController | undefined

export const refreshQueryLog = async () => {
  logController?.abort()
  logController = new AbortController()
  const uuid = activeUuid.value
  if (!uuid) return
  try {
    const res = await fetchQueryLogAPI(queryLogFilter.value, 500, logController.signal)
    if (uuid !== activeUuid.value) return
    if (res.status === 200 && res.data) {
      queryLog.value = res.data.entries ?? []
      queryLogError.value = ''
      return
    }
    queryLogError.value = `query log returned ${res.status}`
  } catch (e) {
    queryLogError.value = e instanceof Error ? e.message : String(e)
  }
}

// --- 解析诊断 --------------------------------------------------------------

export const explanation = ref<GpnExplanation | null>(null)
export const explanationError = ref('')
export const explaining = ref(false)

export const explain = async (name: string) => {
  explaining.value = true
  explanationError.value = ''
  try {
    const res = await resolveTestAPI(name)
    if (res.status === 200 && res.data) {
      explanation.value = res.data
      return
    }
    explanation.value = null
    explanationError.value = messageOf(res) || `resolve returned ${res.status}`
  } catch (e) {
    explanation.value = null
    explanationError.value = e instanceof Error ? e.message : String(e)
  } finally {
    explaining.value = false
  }
}

export const flushCache = async () => {
  await flushDnsCacheAPI()
  await refreshDns()
}

export const stopDns = () => {
  controller?.abort()
  logController?.abort()
  controller = undefined
  logController = undefined
  generation++
  dnsDocument.value = null
  dnsStats.value = null
  dnsSubscriptions.value = []
  dnsRevision.value = ''
  dnsStatus.value = 'idle'
  dnsError.value = ''
  queryLog.value = []
  explanation.value = null
}
