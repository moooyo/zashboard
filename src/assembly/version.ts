// Assembly layer for runtime version discovery.
// fetchVersionAPI normalizes Clash /version and sing-box gRPC GetVersion.
// isSingBoxCore follows the runtime version string, while isSingboxBackend
// follows the configured transport type; a Clash-compatible endpoint can still
// expose a sing-box core.
import { fetchClashVersion, restartCoreAPI } from '@/api/clash'
import { MIHOMO } from '@/constant'
import { activeBackend, activeUuid } from '@/store/setup'
import { computed, ref, watch } from 'vue'
import { isSingboxBackend } from './backend'

export const version = ref()
export const zashboardVersion = ref(__APP_VERSION__)

// sing-box gRPC API version (0 when unknown / non-sing-box). Gates capabilities
// such as usbip, which requires apiVersion >= 2.
export const singboxApiVersion = ref(0)

// sing-box 内核启动时刻(ms epoch);0 表示未知 / 当前后端无此能力。
// 仅 sing-box native gRPC(GetStartedAt)提供,Clash /version 无运行时长。
export const startedAt = ref(0)

export const isSingBoxCore = computed(() => version.value?.includes('sing-box'))

export const mihomo = computed<[MIHOMO, string] | undefined>(() => {
  if (isSingBoxCore.value) return undefined
  else {
    const match = /(alpha-smart|alpha|beta|meta)-?(\w+)/.exec(version.value)
    switch (match?.[1]) {
      case 'alpha':
        return [MIHOMO.Alpha, match[2] ?? version.value]
      case 'alpha-smart':
        return [MIHOMO.Smart, match[2] ?? version.value]
      case 'meta':
        return [MIHOMO.Meta, match[2] ?? version.value]
      default:
        return [MIHOMO.Meta, version.value]
    }
  }
})

const fetchSingboxVersion = async () => {
  const { getSingboxClient } = await import('@/api/singbox/client')
  const client = getSingboxClient()?.client
  if (!client) return { data: { version: 'sing-box' } }
  const v = await client.getVersion({})
  singboxApiVersion.value = v.apiVersion
  const version = v.version.includes('sing-box') ? v.version : `sing-box ${v.version}`
  return { data: { version } }
}

export const fetchVersionAPI = () => {
  if (isSingboxBackend.value) return fetchSingboxVersion()
  singboxApiVersion.value = 0
  return fetchClashVersion()
}

const fetchSingboxStartedAt = async (): Promise<number> => {
  const { getSingboxClient } = await import('@/api/singbox/client')
  const client = getSingboxClient()?.client
  if (!client) return 0
  try {
    const res = await client.getStartedAt({})
    return Number(res.startedAt)
  } catch {
    return 0
  }
}

watch(
  activeBackend,
  async (val) => {
    if (val) {
      // 每次 await 后都要重新确认后端没有被切换。否则上一个后端的慢响应会覆盖
      // 新后端的版本号,而 mihomo 那个正则(isSingBoxCore / mihomo computed)
      // 直接建立在 version 之上 —— 能力发现的结论一旦与版本串相关,这条竞态就
      // 会把结论也带偏。用 uuid 而不是 activeBackend 对象:后者是 computed,
      // 列表被编辑时对象身份就会变。
      const uuid = activeUuid.value
      const stale = () => uuid !== activeUuid.value

      const { data } = await fetchVersionAPI()
      if (stale()) return

      version.value = data?.version || ''
      const started = isSingboxBackend.value ? await fetchSingboxStartedAt() : 0
      if (stale()) return
      startedAt.value = started
    }
  },
  { immediate: true },
)

export { restartCoreAPI }
