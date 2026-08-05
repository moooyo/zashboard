import type { FiveGPNBotEnvelope, FiveGPNBotView } from '@/api/fivegpn'
import { fetchBotAPI, putBotAPI } from '@/api/fivegpn'
import { activeUuid } from '@/store/setup'
import { ref } from 'vue'
import { featureSupported } from './capabilities'

/**
 * Telegram bot state.
 *
 * This uses the same five states as interception. 'absent' and 'error' must
 * remain distinct: the former means the core does not provide the subsystem
 * (503), while the latter means it is present but cannot be read.
 *
 * The token never appears here. Reads return only token_set, and an empty value
 * on write means "keep unchanged". This store therefore never holds the
 * credential and cannot accidentally render it.
 */
export type BotStatus = 'idle' | 'loading' | 'ready' | 'absent' | 'error'

export const botStatus = ref<BotStatus>('idle')
export const bot = ref<FiveGPNBotView | null>(null)
export const botRevision = ref('')
export const botError = ref('')

export const botSupported = featureSupported('5gpn-bot')

let generation = 0
let controller: AbortController | undefined

const adopt = (data: FiveGPNBotEnvelope) => {
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
  let data: FiveGPNBotEnvelope | undefined
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
 * Write the bot configuration. Omitting token preserves the stored value, so
 * the console can update administrators without ever seeing it. Pass '-' to
 * clear the token.
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
