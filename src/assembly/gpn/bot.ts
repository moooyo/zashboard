import type { GpnBotEnvelope, GpnBotView } from '@/api/gpn'
import { fetchBotAPI, putBotAPI } from '@/api/gpn'
import { activeUuid } from '@/store/setup'
import { ref } from 'vue'
import { featureSupported } from './capabilities'

/**
 * Telegram bot 的状态。
 *
 * 与拦截同样的五态:'absent' 与 'error' 必须分开 —— 前者是核心根本没装这个
 * 子系统(503),后者是装了但读不出来。
 *
 * token 永远不在这里。读回来的只有 token_set,写的时候留空表示「保持原样」,
 * 所以这个 store 从来不持有凭据,也就不可能不小心把它渲染出去。
 */
export type BotStatus = 'idle' | 'loading' | 'ready' | 'absent' | 'error'

export const botStatus = ref<BotStatus>('idle')
export const bot = ref<GpnBotView | null>(null)
export const botRevision = ref('')
export const botError = ref('')

export const botSupported = featureSupported('gpn-bot')

let generation = 0
let controller: AbortController | undefined

const adopt = (data: GpnBotEnvelope) => {
  bot.value = data.bot
  botRevision.value = data.revision
  botStatus.value = 'ready'
  botError.value = ''
}

export const refreshBot = async () => {
  controller?.abort()
  controller = new AbortController()
  const gen = ++generation
  const uuid = activeUuid.value
  const stale = () => gen !== generation || uuid !== activeUuid.value

  if (!uuid) {
    botStatus.value = 'idle'
    return
  }
  botStatus.value = 'loading'
  botError.value = ''

  let status = 0
  let data: GpnBotEnvelope | undefined
  try {
    const res = await fetchBotAPI(controller.signal)
    status = res.status
    data = res.data
  } catch (e) {
    if (stale()) return
    botStatus.value = 'error'
    botError.value = e instanceof Error ? e.message : String(e)
    return
  }
  if (stale()) return

  if (status === 503) {
    botStatus.value = 'absent'
    bot.value = null
    return
  }
  if (status !== 200 || !data) {
    botStatus.value = 'error'
    botError.value = `bot returned ${status}`
    return
  }
  adopt(data)
}

/**
 * 写。token 缺省表示不动已存的那一份 —— 控制台在从没见过它的情况下也能改
 * 管理员名单;传 '-' 才是清除。
 */
export const saveBot = async (next: {
  enabled: boolean
  admins: number[]
  alerts: boolean
  token?: string
}): Promise<string> => {
  if (!botRevision.value) return 'no revision'
  try {
    const res = await putBotAPI({ revision: botRevision.value, ...next })
    if (res.status === 200 && res.data) {
      adopt(res.data)
      return ''
    }
    if (res.status === 409) {
      await refreshBot()
      return 'conflict'
    }
    const data = res.data as unknown as { message?: string } | undefined
    return data?.message ?? `bot returned ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export const stopBot = () => {
  controller?.abort()
  controller = undefined
  generation++
  bot.value = null
  botRevision.value = ''
  botStatus.value = 'idle'
  botError.value = ''
}
