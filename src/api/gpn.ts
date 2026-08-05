import axios from 'axios'
import {
  interceptionSettingsWrite,
  type GpnInterceptionSettingsWrite,
} from './gpnInterceptionSettings'
import './http'

/**
 * 5gpn 私有接口。刻意与 api/clash.ts 分开:后者是通用 Clash 兼容面,
 * 而 /capabilities 与 /gpn/* 是 fork 私有能力,不能被当成 Clash API 的一部分。
 *
 * 鉴权就是 zashboard 已有的那一套 —— 控制器 secret 走 api/http.ts 的默认
 * axios 实例。5gpn 自己的 bearer、一次性 ticket、handoff 会话和双 origin
 * 全部删除了,这里没有第二套凭据。
 *
 * 这些路径都在 api/http.ts 的 ignoreNotificationUrls 里,所以 404 会以
 * resolve 的形式返回 AxiosError —— 调用方必须先看 status,不能直接解构 data。
 */

export type FeatureDescriptor = {
  version: number
  owner?: string
}

export type Capabilities = {
  controllerApi: string
  features: Record<string, FeatureDescriptor>
}

/**
 * 探测必须有超时:没有超时的挂起请求会把发现状态永远钉在 'unknown',
 * 而 'unknown' 是「什么都不渲染」,操作者只会看到一个空白页面。
 */
export const fetchCapabilitiesAPI = (signal?: AbortSignal, timeout = 5000) =>
  axios.get<Capabilities>('/capabilities', { signal, timeout })

// ---------------------------------------------------------------------------
// 拦截 / 扩展
// ---------------------------------------------------------------------------

export type GpnModuleSummary = {
  id: string
  name?: string
  version?: string
  enabled: boolean
  capture_hosts: string[]
  capture_dns: string
  egress_group?: string
  egress_group_required: boolean
}

export type GpnCertificateState = {
  loaded: boolean
  not_after?: number
  covers_all_capture_hosts: boolean
  missing_hosts?: string[]
}

export type GpnInterception = {
  enabled: boolean
  http2: boolean
  http3: false
  modules: GpnModuleSummary[]
  execution_order: string[]
  available_egress_groups: string[]
  active_capture_hosts: string[]
  certificate: GpnCertificateState
}

export type GpnModuleSetting = {
  key: string
  type: string
  label?: string
  description?: string
  required: boolean
  options?: string[]
  min?: number
  max?: number
  default?: unknown
  value?: unknown
}

export type GpnActionSummary = {
  id: string
  phase: string
  hosts?: string[]
  schemes?: string[]
  methods?: string[]
  path?: string
  statuses?: number[]
  digest?: string
}

export type GpnMappingSummary = {
  pattern: string
  target: string
  resolver: boolean
}

export type GpnRoutingRule = {
  action: string
  domain?: string
  domain_suffix?: string
  domain_keywords?: string[]
  all_domain_keywords?: string[]
  ip_cidr?: string
  network?: string
  destination_port?: number
}

export type GpnModuleDetail = GpnModuleSummary & {
  description?: string
  imported_at?: string
  source_url?: string
  source_digest?: string
  network: boolean
  persistent_storage: boolean
  settings?: GpnModuleSetting[]
  actions?: GpnActionSummary[]
  routing_rules?: GpnRoutingRule[]
  upstream_mappings?: GpnMappingSummary[]
}

export type GpnCandidate = {
  detail: GpnModuleDetail
  digest: string
  installed?: string
  installedVersion?: string
}

/** 每次读和每次写都带回 revision,所以客户端写完不需要再读一次。 */
export type GpnInterceptionEnvelope = {
  snapshot: GpnInterception
  revision: string
}

/**
 * 503 表示引擎没装上,与 enabled:false 是两回事 —— 后者是一份加载成功并声明
 * 关闭的文档,前者是一份没能加载的文档。调用方必须先看 status。
 */
export const fetchInterceptionAPI = (signal?: AbortSignal) =>
  axios.get<GpnInterceptionEnvelope>('/gpn/interception', { signal, timeout: 5000 })

export const putInterceptionSettingsAPI = (body: GpnInterceptionSettingsWrite) =>
  axios.put<GpnInterceptionEnvelope>('/gpn/interception/settings', interceptionSettingsWrite(body))

export const putInterceptionOrderAPI = (body: { revision: string; order: string[] }) =>
  axios.put<GpnInterceptionEnvelope>('/gpn/interception/order', body)

export const fetchExtensionAPI = (id: string, signal?: AbortSignal) =>
  axios.get<{ extension: GpnModuleDetail; revision: string }>(
    `/gpn/interception/extensions/${encodeURIComponent(id)}`,
    { signal },
  )

export const putExtensionEnabledAPI = (id: string, body: { revision: string; enabled: boolean }) =>
  axios.put<GpnInterceptionEnvelope>(
    `/gpn/interception/extensions/${encodeURIComponent(id)}/enabled`,
    body,
  )

export const putExtensionEgressAPI = (id: string, body: { revision: string; group: string }) =>
  axios.put<GpnInterceptionEnvelope>(
    `/gpn/interception/extensions/${encodeURIComponent(id)}/egress`,
    body,
  )

export const putExtensionCaptureDNSAPI = (
  id: string,
  body: { revision: string; resolver: string },
) =>
  axios.put<GpnInterceptionEnvelope>(
    `/gpn/interception/extensions/${encodeURIComponent(id)}/capture-dns`,
    body,
  )

export const putExtensionSettingAPI = (
  id: string,
  key: string,
  body: { revision: string; value: unknown },
) =>
  axios.put<GpnInterceptionEnvelope>(
    `/gpn/interception/extensions/${encodeURIComponent(id)}/settings/${encodeURIComponent(key)}`,
    body,
  )

export const deleteExtensionAPI = (id: string, body: { revision: string }) =>
  axios.delete<GpnInterceptionEnvelope>(`/gpn/interception/extensions/${encodeURIComponent(id)}`, {
    data: body,
  })

/** 审阅只读取,不改任何状态;它返回的 digest 才是安装时要带回来的凭据。 */
export const reviewExtensionAPI = (body: { url?: string; content?: string }) =>
  axios.post<{ candidate: GpnCandidate; revision: string }>('/gpn/interception/review', body, {
    timeout: 120000,
  })

export const installExtensionAPI = (body: {
  revision: string
  digest: string
  url?: string
  content?: string
}) => axios.post<GpnInterceptionEnvelope>('/gpn/interception/extensions', body, { timeout: 120000 })

export const checkExtensionUpdateAPI = (id: string) =>
  axios.get<{ candidate: GpnCandidate; revision: string }>(
    `/gpn/interception/extensions/${encodeURIComponent(id)}/update`,
    { timeout: 120000 },
  )

export const applyExtensionUpdateAPI = (id: string, body: { revision: string; digest: string }) =>
  axios.post<GpnInterceptionEnvelope>(
    `/gpn/interception/extensions/${encodeURIComponent(id)}/update`,
    body,
    { timeout: 120000 },
  )

// ---------------------------------------------------------------------------
// 扩展目录(marketplace)
// ---------------------------------------------------------------------------

/**
 * 目录只是「一份 manifest 清单」。它不授予任何权限:从条目安装走的仍然是
 * 审阅 → 确认 digest → 安装这条路,而 digest 是重新抓取 manifest 算出来的,
 * 不是目录说了算。目录本身从不落盘,所以这里没有 revision 概念 —— 写的只有
 * 来源列表,那个才是操作者的状态。
 */
export type GpnCatalogCapabilities = {
  captureHostCount: number
  actionCount: number
  settingCount: number
  network: boolean
  persistentStorage: boolean
  upstreamMappingCount: number
  egressGroupRequired: boolean
  routingRuleCount?: number | null
}

export type GpnCatalogEntry = {
  id: string
  name?: string
  version?: string
  description?: string
  tags?: string[]
  license?: { spdx?: string; url?: string }
  documentationUrl?: string
  manifest: { url: string; sha256: string; size?: number }
  capabilities: GpnCatalogCapabilities
  /** 本网关已装的版本,没装则为空。由网关填,不是目录里的字段。 */
  installed_version?: string
}

export type GpnCatalogSource = {
  id: string
  name?: string
  url: string
  enabled: boolean
}

export type GpnCatalogSourceView = GpnCatalogSource & {
  /** 抓取失败的原因。有它就没有 entries,但来源仍然要列出来才能被删掉。 */
  error?: string
  fetched_at?: string
  metadata: { id?: string; name?: string; description?: string; homepage?: string }
  entries: GpnCatalogEntry[]
}

export type GpnCatalogEnvelope = {
  catalog: { sources: GpnCatalogSourceView[] }
  revision: string
}

export const fetchCatalogAPI = (refresh = false, signal?: AbortSignal) =>
  axios.get<GpnCatalogEnvelope>('/gpn/interception/catalog', {
    params: refresh ? { refresh: '1' } : undefined,
    signal,
    timeout: 120000,
  })

/**
 * 扩展日志。一次读取,不是订阅。
 *
 * 引擎另有一条 websocket 用于实时跟随,但操作者真正的问题是「它坏之前干了什么」,
 * 而这个问题是在它坏之后才问的 —— 从「现在」开始的流回答不了。核心为此保留了
 * 一个有界环形缓冲。
 */
export type GpnEngineLog = {
  time: string
  level: 'info' | 'warn' | 'error'
  source: 'script' | 'engine'
  extension?: string
  action?: string
  phase?: string
  duration_ms?: number
  url?: string
  script_digest?: string
  message: string
}

export const fetchEngineLogsAPI = (
  params: { extension?: string; level?: string; contains?: string; limit?: number },
  signal?: AbortSignal,
) =>
  axios.get<{ logs: GpnEngineLog[] }>('/gpn/interception/logs', {
    params,
    signal,
    timeout: 5000,
  })

export const putCatalogSourcesAPI = (body: { revision: string; sources: GpnCatalogSource[] }) =>
  axios.put<GpnInterceptionEnvelope>('/gpn/interception/catalog/sources', body)

/**
 * 目录条目的审阅。返回的东西和粘贴 URL 的审阅一模一样 —— 后面的安装就是同一个
 * 调用。多出来的是核对:manifest 的 digest 和条目公布的一致,声明的能力和条目
 * 打的标签一致。对不上就在这里拒绝,因为审阅页正是操作者做决定的地方。
 */
export const reviewCatalogEntryAPI = (source: string, entry: string) =>
  axios.post<{ candidate: GpnCandidate; url: string; revision: string }>(
    `/gpn/interception/catalog/${encodeURIComponent(source)}/entries/${encodeURIComponent(entry)}/review`,
    {},
    { timeout: 120000 },
  )

/**
 * 从目录条目发起更新。这会**改变**该扩展代码的来源 —— 这正是它和
 * /extensions/{id}/update 分成两条路的原因:后者重读操作者已经选定的来源,
 * 这条替换它。合并成一个带开关的调用,等于把「改来源」变成一个本来不会改
 * 来源的操作的参数。
 */
export const applyCatalogUpdateAPI = (
  source: string,
  entry: string,
  body: { revision: string; digest: string },
) =>
  axios.post<GpnInterceptionEnvelope>(
    `/gpn/interception/catalog/${encodeURIComponent(source)}/entries/${encodeURIComponent(entry)}/update`,
    body,
    { timeout: 120000 },
  )

// ---------------------------------------------------------------------------
// Telegram bot
// ---------------------------------------------------------------------------

/**
 * token 是只写的:读回来的永远只有 token_set,没有值。写的时候留空表示
 * 「保持原样」,这样控制台可以在从没见过 token 的情况下改管理员名单;
 * 传 '-' 才是清除。
 */
export type GpnBotView = {
  enabled: boolean
  token_set: boolean
  admins: number[]
  alerts: boolean
  state: string
  last_error?: string
}

export type GpnBotEnvelope = {
  bot: GpnBotView
  revision: string
}

export const fetchBotAPI = (signal?: AbortSignal) =>
  axios.get<GpnBotEnvelope>('/gpn/bot', { signal, timeout: 5000 })

export const putBotAPI = (body: {
  revision: string
  enabled: boolean
  admins: number[]
  alerts: boolean
  token?: string
}) => axios.put<GpnBotEnvelope>('/gpn/bot', body)

// ---------------------------------------------------------------------------
// DNS
// ---------------------------------------------------------------------------

export type GpnPolicyRule = {
  id: string
  kind: 'domain' | 'domain-suffix' | 'domain-keyword' | 'subscription'
  value: string
  intent: 'block' | 'direct' | 'proxy'
  enabled: boolean
  format?: string
  intervalSeconds?: number
}

export type GpnDnsDocument = {
  listen: {
    dot: string
    debug?: string
    origin?: string
    certificate?: string
    privateKey?: string
  }
  gateway: string
  localNames?: string[]
  upstreams: {
    china: string[]
    trust: string[]
    ecs?: string
  }
  policy: {
    rules: GpnPolicyRule[]
    fallback: 'auto' | 'direct' | 'gateway'
  }
  tuning: {
    timeoutMs?: number
    ttlMinSeconds?: number
    ttlMaxSeconds?: number
    cacheSize?: number
    maxInflight?: number
  }
}

export type GpnGroupStats = {
  ok: number
  err: number
  p50Ms: number
  p95Ms: number
  latencyCount: number
}

export type GpnDnsStats = {
  total: number
  block: number
  forceDirect: number
  forceProxy: number
  chnrouteCn: number
  chnrouteForeign: number
  cacheHits: number
  cacheMisses: number
  cacheEntries: number
  refused: number
  china: GpnGroupStats
  trust: GpnGroupStats
  cnRanges: number
}

export type GpnSubscriptionStatus = {
  ruleId: string
  lastAttempt?: string
  lastSuccess?: string
  entries: number
  error?: string
}

export type GpnDnsEnvelope = {
  document: GpnDnsDocument
  revision: string
  stats: GpnDnsStats
  subscriptions: GpnSubscriptionStatus[]
}

export type GpnQueryLogEntry = {
  time: string
  client?: string
  name: string
  qtype: string
  verdict?: string
  reason?: string
  upstream?: string
  cacheHit: boolean
  rcode: string
  ips?: string[]
  durationMs: number
}

export type GpnExplanation = {
  name: string
  verdict: { verdict?: string; reason?: string }
  rule?: { id: string; kind: string; value: string; intent: string; entries: number }
  capture?: {
    extensionId: string
    extensionName?: string
    pattern?: string
    resolver?: string
    ready: boolean
  }
  fallback: string
  gateway?: string
  rcode: string
  upstream?: string
  cacheHit: boolean
  answers?: string[]
  origin?: string[]
}

export const fetchDnsAPI = (signal?: AbortSignal) =>
  axios.get<GpnDnsEnvelope>('/gpn/dns', { signal, timeout: 5000 })

export const putDnsAPI = (body: { revision: string; document: GpnDnsDocument }) =>
  axios.put<GpnDnsEnvelope>('/gpn/dns', body)

export const fetchDnsStatsAPI = (signal?: AbortSignal) =>
  axios.get<GpnDnsStats>('/gpn/dns/stats', { signal, timeout: 5000 })

export const fetchQueryLogAPI = (q: string, limit: number, signal?: AbortSignal) =>
  axios.get<{ entries: GpnQueryLogEntry[] }>('/gpn/dns/querylog', {
    params: { q, limit },
    signal,
    timeout: 5000,
  })

export const resolveTestAPI = (name: string) =>
  axios.get<GpnExplanation>('/gpn/dns/resolve', { params: { name }, timeout: 15000 })

export const flushDnsCacheAPI = () => axios.post('/gpn/dns/flush')
