// 组装层 · 后端判定与能力门控。
// 这里的 isSingboxBackend 基于「用户配置的后端类型」(activeBackend.type),决定
// 走 sing-box native gRPC 还是 Clash REST/WS —— 是整个 assembly 层做后端选择的依据。
// 注意与 assembly/version.ts 的 isSingBoxCore 区分:后者基于运行时内核版本字符串,
// Clash 通道也可能连到 sing-box 兼容核心,两者语义不同,不可互相替代。

import { probeClashChannel } from '@/api/clash'
import { getSingboxUrlFromBackend } from '@/helper/utils'
import { activeBackend } from '@/store/setup'
import type { Backend } from '@/types'
import { computed } from 'vue'
import { overlaySupported } from './overlay/discovery'

// 当前后端是否为 sing-box native(gRPC)登录。
export const isSingboxBackend = computed(() => activeBackend.value?.type === 'singbox')

// Clash 通道:非 sing-box 的常规后端。
export const hasClashChannel = computed(() => !!activeBackend.value && !isSingboxBackend.value)

// sing-box native 通道:供 Tools / ChartsCard(goroutines)等使用。
export const hasSingboxChannel = computed(() => isSingboxBackend.value)

// 各页面能力门控。sing-box native 暂不支持 rules/providers/dns/smart/内核升级。
export const capabilities = computed(() => ({
  proxies: !!activeBackend.value,
  connections: !!activeBackend.value,
  logs: !!activeBackend.value,
  overview: !!activeBackend.value,
  rules: hasClashChannel.value,
  providers: hasClashChannel.value,
  dns: hasClashChannel.value,
  smart: hasClashChannel.value,
  upgrade: hasClashChannel.value,
  tools: isSingboxBackend.value,
  // runtime overlay 是发现出来的,不是从后端类型推断出来的:它是 fork 私有能力,
  // 版本号或后端类型都不能作为存在性证据。这里只暴露派生布尔值,四态本身留在
  // assembly/overlay/discovery.ts —— 因为 capabilities 被 `!cap` 消费,
  // 'unknown' 和 'unsupported' 都是真值,直接塞字符串会让每个门控反向。
  overlay: overlaySupported.value,
}))

// 后端连通性探测(供 Setup / EditBackend 测试连接使用)。
export const isSingboxChannelAvailable = (backend: Backend, timeout: number = 10000) => {
  if (!getSingboxUrlFromBackend(backend)) return Promise.resolve(false)
  return import('@/api/singbox/client').then((m) => m.probeSingboxChannel(backend, timeout))
}

export const isBackendAvailable = (backend: Backend, timeout: number = 10000) =>
  backend.type === 'singbox'
    ? isSingboxChannelAvailable(backend, timeout)
    : probeClashChannel(backend, timeout)
