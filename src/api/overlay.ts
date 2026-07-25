import axios from 'axios'
import './http'

/**
 * 私有 mihomo 扩展接口。刻意与 api/clash.ts 分开:后者是通用 Clash 兼容面,
 * 而 runtime overlay 是 fork 私有能力,不能被当成 Clash API 的一部分。
 *
 * 这两个路径都在 api/http.ts 的 ignoreNotificationUrls 里,所以 404 会以
 * resolve 的形式返回 AxiosError —— 调用方必须先看 status,不能直接解构 data。
 */

export type OverlayCapabilities = {
  controllerApi: string
  features: Record<string, { version: number; owner?: string }>
}

export type OverlayReadback = {
  enabled: boolean
  activeGeneration: string
  activeDigest?: string
  activeProjectionDigest?: string
  persistedGeneration: string
  coreConfigRevision: number
  resolverEpoch: number
  processorState: 'disabled' | 'quarantined' | 'not-ready' | 'degraded' | 'ready'
  dependencyErrors?: string[]
  processorInstanceId?: string
  sidecarBundleDigest?: string
  capabilitySetDigest?: string
  leaseState: 'none' | 'valid' | 'expired'
  leaseExpiresAt?: number
  fencingToken?: number
  preparedGenerations: string[]
  drainingGenerations: string[]
  bootEpoch: string
  schemaVersion: number
}

// 探测必须有超时:没有超时的挂起请求会把发现状态永远钉在 'unknown',
// 而 'unknown' 是「什么都不渲染」,操作者只会看到一个空白页面。
const PROBE_TIMEOUT = 5000

export const fetchOverlayCapabilitiesAPI = (signal?: AbortSignal) =>
  axios.get<OverlayCapabilities>('/capabilities', { signal, timeout: PROBE_TIMEOUT })

export const fetchOverlayReadbackAPI = (owner: string, signal?: AbortSignal) =>
  axios.get<OverlayReadback>(`/runtime-overlays/${encodeURIComponent(owner)}`, {
    signal,
    timeout: PROBE_TIMEOUT,
  })
