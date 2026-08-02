import axios from 'axios'
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
