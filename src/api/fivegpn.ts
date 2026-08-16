import axios from 'axios'
import {
  interceptionSettingsWrite,
  type FiveGPNInterceptionSettingsWrite,
} from './fivegpnInterceptionSettings'
import './http'

export const FIVEGPN_REVIEW_CONTRACT = 7 as const
export type FiveGPNReviewContract = typeof FIVEGPN_REVIEW_CONTRACT

/**
 * Private 5gpn APIs. This module is deliberately separate from api/clash.ts:
 * the latter is the generic Clash-compatible surface, while /capabilities and
 * /5gpn/* are fork-specific features and must not be treated as part of the Clash API.
 *
 * Authentication uses zashboard's existing mechanism: the controller secret
 * flows through the default Axios instance in api/http.ts. The separate 5gpn
 * bearer, one-time ticket, handoff session, and dual-origin model have all been
 * removed, so there is no second credential here.
 *
 * These paths are listed in ignoreNotificationUrls in api/http.ts, which only
 * suppresses expected toasts. HTTP failures still reject consistently and
 * callers classify the AxiosError where a status has product meaning.
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
 * Discovery must have a timeout. A request that hangs without one would leave
 * discovery permanently at 'unknown', which renders nothing and presents the
 * operator with a blank page.
 */
export const fetchCapabilitiesAPI = (signal?: AbortSignal, timeout = 5000) =>
  axios.get<Capabilities>('/capabilities', { signal, timeout })

// ---------------------------------------------------------------------------
// Interception / extensions
// ---------------------------------------------------------------------------

export type FiveGPNModuleSummary = {
  id: string
  name?: string
  version?: string
  enabled: boolean
  capture_hosts: string[]
  capture_dns: FiveGPNCaptureDNS
  egress_group: string
  egress_group_required: boolean
  setting_count: number
  runtime: FiveGPNModuleRuntime
}

export type FiveGPNCaptureDNS = 'trust' | 'china'

export type FiveGPNModuleRuntimePhase =
  | 'disabled'
  | 'armed'
  | 'certificate_pending'
  | 'certificate_error'
  | 'boundary_unavailable'
  | 'egress_unavailable'
  | 'active'

export type FiveGPNModuleRuntime = {
  ready: boolean
  phase: FiveGPNModuleRuntimePhase
  reason?: string
}

export type FiveGPNCertificateState = {
  ready: boolean
  loaded: boolean
  not_after?: number
  covers_all_capture_hosts: boolean
  missing_hosts?: string[]
  status?: 'idle' | 'pending' | 'ready' | 'error'
  target_digest?: string
  attempt?: string
  error_code?: string
  error_message?: string
}

export type FiveGPNInterception = {
  enabled: boolean
  http2: boolean
  http3: false
  modules: FiveGPNModuleSummary[]
  execution_order: string[]
  available_egress_groups: string[]
  active_capture_hosts: string[]
  certificate: FiveGPNCertificateState
}

export type FiveGPNLocationValue = {
  longitude?: number
  latitude?: number
  accuracy: number
}

export type FiveGPNLocationSearchResult = {
  label: string
  latitude: number
  longitude: number
  bounding_box: {
    south: number
    north: number
    west: number
    east: number
  }
}

export type FiveGPNLocationSearchResponse = {
  results: FiveGPNLocationSearchResult[]
}

export type FiveGPNSettingValue = string | number | boolean | FiveGPNLocationValue | null

export type FiveGPNModuleSetting = {
  key: string
  type: 'boolean' | 'select' | 'text' | 'number' | 'location'
  label?: string
  description?: string
  required: boolean
  options?: string[]
  min?: number
  max?: number
  default?: FiveGPNSettingValue
  value?: FiveGPNSettingValue
}

export type FiveGPNActionPhase = 'request' | 'response'
export type FiveGPNActionKind =
  'script' | 'jq' | 'reject' | 'mock' | 'headers' | 'rewrite' | 'replace_body'
export type FiveGPNActionBodyMode = 'none' | 'text' | 'binary'
export type FiveGPNActionEntry = 'native' | 'proxy-compat'
export type FiveGPNActionSourceKind = 'url' | 'inline'

export type FiveGPNActionGate = {
  key: string
  equals: string
}

export type FiveGPNActionReviewCommon = {
  id: string
  phase: FiveGPNActionPhase
  hosts?: string[]
  schemes?: Array<'http' | 'https'>
  methods?: string[]
  path?: string
  statuses?: number[]
  enabled_when?: FiveGPNActionGate
  body_mode: FiveGPNActionBodyMode
  review_digest: string
  timeout_ms: number
  max_body_bytes: number
}

export type FiveGPNMockBodyReview = {
  kind: 'empty' | 'text' | 'base64'
  bytes: number
  sha256: string
}

export type FiveGPNMockReview = {
  status: number
  headers?: Record<string, string>
  body: FiveGPNMockBodyReview
}

export type FiveGPNHeadersReview = {
  set?: Record<string, string>
  remove?: string[]
}

export type FiveGPNRewriteReview = {
  pattern: string
  to: string
  status: 0 | 302 | 307
}

export type FiveGPNReplaceBodyReview = {
  pattern: string
  to: string
  value_map?: Record<string, Record<string, string>>
}

type FiveGPNScriptActionReviewCommon = FiveGPNActionReviewCommon & {
  kind: 'script'
  entry: FiveGPNActionEntry
  code_digest: string
  code_bytes: number
}

export type FiveGPNScriptActionReview = FiveGPNScriptActionReviewCommon &
  ({ source_kind: 'url'; source_url: string } | { source_kind: 'inline'; source_url?: never })

export type FiveGPNJQActionReview = Omit<FiveGPNActionReviewCommon, 'body_mode'> & {
  kind: 'jq'
  body_mode: 'text'
  code_digest: string
  code_bytes: number
}

export type FiveGPNRejectActionReview = FiveGPNActionReviewCommon & {
  kind: 'reject'
}

export type FiveGPNMockActionReview = FiveGPNActionReviewCommon & {
  kind: 'mock'
  mock: FiveGPNMockReview
}

export type FiveGPNHeadersActionReview = FiveGPNActionReviewCommon & {
  kind: 'headers'
  headers: FiveGPNHeadersReview
}

export type FiveGPNRewriteActionReview = Omit<FiveGPNActionReviewCommon, 'phase'> & {
  kind: 'rewrite'
  phase: 'request'
  rewrite: FiveGPNRewriteReview
}

export type FiveGPNReplaceBodyActionReview = Omit<FiveGPNActionReviewCommon, 'body_mode'> & {
  kind: 'replace_body'
  body_mode: 'text' | 'binary'
  replace_body: FiveGPNReplaceBodyReview
}

export type FiveGPNActionReview =
  | FiveGPNScriptActionReview
  | FiveGPNJQActionReview
  | FiveGPNRejectActionReview
  | FiveGPNMockActionReview
  | FiveGPNHeadersActionReview
  | FiveGPNRewriteActionReview
  | FiveGPNReplaceBodyActionReview

export type FiveGPNMappingSummary = {
  pattern: string
  target: string
  resolver: boolean
}

export type FiveGPNRoutingRule = {
  action: 'reject' | 'direct'
  domain?: string
  domain_suffix?: string
  domain_keywords?: string[]
  all_domain_keywords?: string[]
  ip_cidr?: string
  network?: 'tcp' | 'udp'
  destination_port?: number
}

export type FiveGPNModuleDetail = FiveGPNModuleSummary & {
  review_contract?: number
  description?: string
  imported_at?: string
  source_url?: string
  source_digest?: string
  snapshot_digest: string
  network: boolean
  persistent_storage: boolean
  settings?: FiveGPNModuleSetting[]
  actions?: FiveGPNActionReview[]
  routing_rules?: FiveGPNRoutingRule[]
  upstream_mappings?: FiveGPNMappingSummary[]
}

export type FiveGPNCandidate = {
  detail: FiveGPNModuleDetail
  digest: string
  installed?: string
  installedVersion?: string
}

/** Every read and write returns the revision, so clients need no follow-up read after a write. */
export type FiveGPNInterceptionEnvelope = {
  snapshot: FiveGPNInterception
  revision: string
}

/**
 * A 503 means the engine is unavailable, which differs from enabled:false.
 * The latter is a successfully loaded document that explicitly disables the
 * feature; the former is a document that could not be loaded. Callers must
 * inspect status first.
 */
export const fetchInterceptionAPI = (signal?: AbortSignal) =>
  axios.get<FiveGPNInterceptionEnvelope>('/5gpn/interception', { signal, timeout: 5000 })

export const searchInterceptionLocationAPI = (
  body: { query: string; language: string },
  signal?: AbortSignal,
) =>
  axios.post<FiveGPNLocationSearchResponse>('/5gpn/interception/location/search', body, {
    signal,
    timeout: 15000,
  })

export const putInterceptionSettingsAPI = (body: FiveGPNInterceptionSettingsWrite) =>
  axios.put<FiveGPNInterceptionEnvelope>(
    '/5gpn/interception/settings',
    interceptionSettingsWrite(body),
    { timeout: 120000 },
  )

export const putInterceptionOrderAPI = (body: {
  revision: string
  review_contract: FiveGPNReviewContract
  order: string[]
}) => axios.put<FiveGPNInterceptionEnvelope>('/5gpn/interception/order', body, { timeout: 120000 })

export const fetchExtensionAPI = (id: string, signal?: AbortSignal) =>
  axios.get<{ extension: FiveGPNModuleDetail; revision: string }>(
    `/5gpn/interception/extensions/${encodeURIComponent(id)}`,
    { signal, timeout: 5000 },
  )

export type FiveGPNExtensionEnabledWrite =
  | { revision: string; enabled: false; review_contract?: never }
  | { revision: string; enabled: true; review_contract: FiveGPNReviewContract }

export const putExtensionEnabledAPI = (
  id: string,
  body: FiveGPNExtensionEnabledWrite,
  signal?: AbortSignal,
) =>
  axios.put<FiveGPNInterceptionEnvelope>(
    `/5gpn/interception/extensions/${encodeURIComponent(id)}/enabled`,
    body,
    { signal, timeout: 120000 },
  )

export const putExtensionEgressAPI = (id: string, body: { revision: string; group: string }) =>
  axios.put<FiveGPNInterceptionEnvelope>(
    `/5gpn/interception/extensions/${encodeURIComponent(id)}/egress`,
    body,
    { timeout: 120000 },
  )

export const putExtensionCaptureDNSAPI = (
  id: string,
  body: { revision: string; resolver: FiveGPNCaptureDNS },
) =>
  axios.put<FiveGPNInterceptionEnvelope>(
    `/5gpn/interception/extensions/${encodeURIComponent(id)}/capture-dns`,
    body,
    { timeout: 120000 },
  )

export const putExtensionSettingsAPI = (
  id: string,
  body: { revision: string; values: Record<string, FiveGPNSettingValue> },
) =>
  axios.put<FiveGPNInterceptionEnvelope>(
    `/5gpn/interception/extensions/${encodeURIComponent(id)}/settings`,
    body,
    { timeout: 120000 },
  )

export const retryInterceptionCertificateAPI = (body: {
  revision: string
  target_digest: string
  attempt: string
}) =>
  axios.post<FiveGPNInterceptionEnvelope>('/5gpn/interception/certificate/retry', body, {
    timeout: 120000,
  })

export const deleteExtensionAPI = (id: string, body: { revision: string }) =>
  axios.delete<FiveGPNInterceptionEnvelope>(
    `/5gpn/interception/extensions/${encodeURIComponent(id)}`,
    {
      data: body,
      timeout: 120000,
    },
  )

/** Review is read-only; its returned digest is the credential supplied during installation. */
export const reviewExtensionAPI = (
  body: { url?: string; content?: string },
  signal?: AbortSignal,
) =>
  axios.post<{ candidate: FiveGPNCandidate; revision: string }>('/5gpn/interception/review', body, {
    signal,
    timeout: 120000,
  })

export const installExtensionAPI = (
  body: {
    revision: string
    review_contract: FiveGPNReviewContract
    digest: string
    url?: string
    content?: string
  },
  signal?: AbortSignal,
) =>
  axios.post<FiveGPNInterceptionEnvelope>('/5gpn/interception/extensions', body, {
    signal,
    timeout: 120000,
  })

// ---------------------------------------------------------------------------
// Extension catalog (marketplace)
// ---------------------------------------------------------------------------

/**
 * The catalog is only a list of manifests and grants no permissions. Installing
 * an entry still follows review -> confirm digest -> install, and the digest is
 * computed from a freshly fetched manifest rather than trusted from the catalog.
 * The catalog itself is never persisted, so it has no revision. Only the source
 * list is written, because that is operator-controlled state.
 */
export type FiveGPNCatalogCapabilities = {
  captureHostCount: number
  actionCount: number
  settingCount: number
  network: boolean
  persistentStorage: boolean
  upstreamMappingCount: number
  egressGroupRequired: boolean
  routingRuleCount?: number | null
}

export type FiveGPNCatalogEntry = {
  id: string
  name?: string
  version?: string
  description?: string
  tags?: string[]
  license?: { spdx?: string; url?: string }
  documentationUrl?: string
  manifest: { url: string; sha256: string; size?: number }
  capabilities: FiveGPNCatalogCapabilities
  /** Version installed on this gateway, or empty when absent. The gateway supplies this value. */
  installed_version?: string
  /** True only when the installed version and manifest bytes match this catalog entry. */
  installed_current?: boolean
}

export type FiveGPNCatalogSource = {
  id: string
  name?: string
  url: string
  enabled: boolean
}

export type FiveGPNCatalogSourceView = FiveGPNCatalogSource & {
  /** Fetch failure reason. A last complete snapshot may remain visible beside this error. */
  error?: string
  fetched_at?: string
  metadata: { id?: string; name?: string; description?: string; homepage?: string }
  entries: FiveGPNCatalogEntry[]
}

export type FiveGPNCatalogEnvelope = {
  catalog: { sources: FiveGPNCatalogSourceView[] }
  revision: string
}

export const fetchCatalogAPI = (refresh = false, signal?: AbortSignal) =>
  axios.get<FiveGPNCatalogEnvelope>('/5gpn/interception/catalog', {
    params: refresh ? { refresh: '1' } : undefined,
    signal,
    timeout: 120000,
  })

/**
 * Extension logs. Each request returns one bounded ring snapshot rather than
 * opening a second streaming listener. The dedicated view may poll snapshots
 * while mounted; pausing that view never pauses ingestion in the core.
 *
 * Operators usually need to know what happened before a failure, after it has
 * already occurred. The core therefore retains a bounded in-memory ring for
 * authenticated reads instead of exposing a second log listener.
 */
export type FiveGPNEngineLog = {
  seq: string
  time: string
  level: 'info' | 'warn' | 'error'
  source: 'script' | 'engine'
  extension?: string
  action?: string
  phase?: 'request' | 'response'
  duration_ms?: number
  url?: string
  script_digest?: string
  message: string
}

export type FiveGPNEngineLogPage = {
  logs: FiveGPNEngineLog[]
  stream_id: string
  oldest_seq: string
  latest_seq: string
  dropped: string
  reset: boolean
}

export const fetchEngineLogsAPI = (
  params: {
    extension?: string
    level?: string
    contains?: string
    limit?: number
    stream_id?: string
    after?: string
  },
  signal?: AbortSignal,
) =>
  axios.get<FiveGPNEngineLogPage>('/5gpn/interception/logs', {
    params,
    signal,
    timeout: 5000,
  })

export const putCatalogSourcesAPI = (body: { revision: string; sources: FiveGPNCatalogSource[] }) =>
  axios.put<FiveGPNInterceptionEnvelope>('/5gpn/interception/catalog/sources', body, {
    timeout: 120000,
  })

/**
 * Review a catalog entry. The result is identical to reviewing a pasted URL,
 * and installation uses the same call. This path additionally verifies that
 * the manifest digest matches the catalog entry and that declared capabilities
 * match its labels. A mismatch is rejected here because the review page is
 * where the operator makes the decision.
 */
export const reviewCatalogEntryAPI = (source: string, entry: string, signal?: AbortSignal) =>
  axios.post<{ candidate: FiveGPNCandidate; url: string; revision: string }>(
    `/5gpn/interception/catalog/${encodeURIComponent(source)}/entries/${encodeURIComponent(entry)}/review`,
    {},
    { signal, timeout: 120000 },
  )

/**
 * Update from a catalog entry. This changes the installed extension's source
 * to the explicitly selected marketplace entry. Installed-extension updates
 * have no URL/source-check path in the Console; this reviewed catalog action is
 * the only update flow.
 */
export const applyCatalogUpdateAPI = (
  source: string,
  entry: string,
  body: {
    revision: string
    review_contract: FiveGPNReviewContract
    digest: string
    url: string
    values?: Record<string, FiveGPNSettingValue>
  },
  signal?: AbortSignal,
) =>
  axios.post<FiveGPNInterceptionEnvelope>(
    `/5gpn/interception/catalog/${encodeURIComponent(source)}/entries/${encodeURIComponent(entry)}/update`,
    body,
    { signal, timeout: 120000 },
  )

// ---------------------------------------------------------------------------
// Telegram bot
// ---------------------------------------------------------------------------

/**
 * The token is write-only: reads return only token_set, never the value. An empty
 * token on write means "keep unchanged", allowing the console to update the
 * administrator list without ever seeing the token. Pass '-' to clear it.
 */
export type FiveGPNBotView = {
  enabled: boolean
  token_set: boolean
  admins: number[]
  alerts: boolean
  state: string
  last_error?: string
}

export type FiveGPNBotEnvelope = {
  bot: FiveGPNBotView
  revision: string
}

export const fetchBotAPI = (signal?: AbortSignal) =>
  axios.get<FiveGPNBotEnvelope>('/5gpn/bot', { signal, timeout: 5000 })

export const putBotAPI = (body: {
  revision: string
  enabled: boolean
  admins: number[]
  alerts: boolean
  token?: string
}) => axios.put<FiveGPNBotEnvelope>('/5gpn/bot', body)

// ---------------------------------------------------------------------------
// DNS
// ---------------------------------------------------------------------------

export type FiveGPNPolicyRule = {
  id: string
  kind: 'domain' | 'domain-suffix' | 'domain-keyword' | 'subscription'
  value: string
  intent: 'block' | 'direct' | 'proxy'
  enabled: boolean
  format?: string
  intervalSeconds?: number
}

export type FiveGPNDnsDocument = {
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
    rules: FiveGPNPolicyRule[]
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

export type FiveGPNGroupStats = {
  ok: number
  err: number
  p50Ms: number
  p95Ms: number
  latencyCount: number
}

export type FiveGPNDnsStats = {
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
  china: FiveGPNGroupStats
  trust: FiveGPNGroupStats
  cnRanges: number
}

export type FiveGPNSubscriptionStatus = {
  ruleId: string
  lastAttempt?: string
  lastSuccess?: string
  entries: number
  error?: string
}

export type FiveGPNDnsEnvelope = {
  document: FiveGPNDnsDocument
  revision: string
  stats: FiveGPNDnsStats
  subscriptions: FiveGPNSubscriptionStatus[]
}

export type FiveGPNQueryLogEntry = {
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

export type FiveGPNExplanation = {
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
  axios.get<FiveGPNDnsEnvelope>('/5gpn/dns', { signal, timeout: 5000 })

export const putDnsAPI = (body: { revision: string; document: FiveGPNDnsDocument }) =>
  axios.put<FiveGPNDnsEnvelope>('/5gpn/dns', body)

export const fetchDnsStatsAPI = (signal?: AbortSignal) =>
  axios.get<FiveGPNDnsStats>('/5gpn/dns/stats', { signal, timeout: 5000 })

export const fetchQueryLogAPI = (q: string, limit: number, signal?: AbortSignal) =>
  axios.get<{ entries: FiveGPNQueryLogEntry[] }>('/5gpn/dns/querylog', {
    params: { q, limit },
    signal,
    timeout: 5000,
  })

export const resolveTestAPI = (name: string, signal?: AbortSignal) =>
  axios.get<FiveGPNExplanation>('/5gpn/dns/resolve', {
    params: { name },
    signal,
    timeout: 15000,
  })

export const flushDnsCacheAPI = () => axios.post('/5gpn/dns/flush')
