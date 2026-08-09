// Assembly layer for runtime version discovery. The configured transport
// selects Clash /version or sing-box gRPC GetVersion, while the returned
// version identifies the actual core. Component upgrades are intentionally not
// controller capabilities in the 5gpn fork.
import { fetchClashVersion, restartCoreAPI } from '@/api/clash'
import HonkLogo from '@/assets/images/honk.svg'
import MetacubexLogo from '@/assets/images/metacubex.jpg'
import SingBoxLogo from '@/assets/images/sing-box.svg'
import { MIHOMO, MIHOMO_CHANNEL } from '@/constant'
import {
  activeBackend,
  activeBackendSession,
  backendSessionIsCurrent,
  captureBackendSession,
} from '@/store/setup'
import type { Backend } from '@/types'
import { computed, nextTick, ref, watch } from 'vue'
import { apiVersion, can, Channel, channel, core, Core, resetCore } from './backend'

export const version = ref()
export const zashboardVersion = ref(__APP_VERSION__)

// sing-box start time (milliseconds since epoch); zero means unavailable.
export const startedAt = ref(0)

// honk identifies itself as "honk <semver>" on its Clash-compatible endpoint.
const detectCore = (versionString: string): Core => {
  if (!versionString) return Core.Unknown
  if (versionString.includes('sing-box')) return Core.Singbox
  if (/\bhonk\b/i.test(versionString)) return Core.Honk
  return Core.Mihomo
}

// Branding is presentation only and must not be used as a capability gate.
export const coreBrand = computed(() => {
  switch (core.value) {
    case Core.Singbox:
      return { logo: SingBoxLogo, url: 'https://github.com/sagernet/sing-box' }
    case Core.Honk:
      return { logo: HonkLogo, url: 'https://github.com/Glassyiris/honk' }
    default:
      return {
        logo: MetacubexLogo,
        url: MIHOMO_CHANNEL[mihomo.value?.[0] ?? MIHOMO.Meta].url,
      }
  }
})

export const mihomo = computed<[MIHOMO, string] | undefined>(() => {
  if (core.value !== Core.Mihomo) return undefined

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
})

const fetchSingboxVersion = async () => {
  const { getSingboxClient } = await import('@/api/singbox/client')
  const client = getSingboxClient()?.client
  if (!client) return { data: { version: 'sing-box' } }
  const v = await client.getVersion({})
  apiVersion.value = v.apiVersion
  const version = v.version.includes('sing-box') ? v.version : `sing-box ${v.version}`
  return { data: { version } }
}

export const fetchVersionAPI = () =>
  channel.value === Channel.Singbox ? fetchSingboxVersion() : fetchClashVersion()

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

const probeBackend = async (backend: Backend, session: ReturnType<typeof captureBackendSession>) => {
  const { data } = await fetchVersionAPI()

  // Discard a result if the operator switched or edited the backend while probing.
  if (!backendSessionIsCurrent(session)) return

  version.value = data?.version || ''
  core.value = detectCore(version.value)
  const nextStartedAt = can('startedAt') ? await fetchSingboxStartedAt() : 0
  if (!backendSessionIsCurrent(session)) return
  startedAt.value = nextStartedAt
}

// Consumers that need a reliable core/channel conclusion await this probe.
let probe: Promise<void> = Promise.resolve()

export const coreReady = async () => {
  // Let the backend watcher install the new probe before awaiting it.
  await nextTick()
  await probe
}

watch(
  activeBackendSession,
  (val) => {
    resetCore()
    version.value = ''
    startedAt.value = 0

    const backend = activeBackend.value
    probe = val && backend ? probeBackend(backend, val).catch(() => {}) : Promise.resolve()
  },
  { immediate: true },
)

export { restartCoreAPI }
