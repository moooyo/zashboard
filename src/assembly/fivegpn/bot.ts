import type { FiveGPNBotEnvelope, FiveGPNBotView } from '@/api/fivegpn'
import { fetchBotAPI, putBotAPI } from '@/api/fivegpn'
import { responseData, responseMessage, responseStatus } from '@/api/response'
import {
  activeBackendSession,
  backendSessionIsCurrent,
  captureBackendSession,
} from '@/store/setup'
import { ref, watch } from 'vue'
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

const cancelBotRead = () => {
  controller?.abort()
  controller = undefined
  generation += 1
}

const adopt = (data: FiveGPNBotEnvelope) => {
  bot.value = data.bot
  botRevision.value = data.revision
  botStatus.value = 'ready'
  botError.value = ''
}

export const refreshBot = async () => {
  cancelBotRead()
  controller = new AbortController()
  const gen = ++generation
  const session = captureBackendSession()
  const stale = () => gen !== generation || !backendSessionIsCurrent(session)

  if (!session) {
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
    if (responseStatus(e) === 503) {
      botStatus.value = 'absent'
      bot.value = null
      return
    }
    botStatus.value = 'error'
    botError.value = responseMessage(e) || (e instanceof Error ? e.message : String(e))
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
  const session = captureBackendSession()
  if (!session) return 'no backend'
  const revision = botRevision.value
  if (!revision) return 'no revision'
  cancelBotRead()
  try {
    const res = await putBotAPI({ revision, ...next })
    if (!backendSessionIsCurrent(session)) return 'backend changed'
    if (res.status === 200 && res.data) {
      cancelBotRead()
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
    if (!backendSessionIsCurrent(session)) return 'backend changed'
    if (responseStatus(e) === 409) {
      await refreshBot()
      return 'conflict'
    }
    const data = responseData<{ message?: string }>(e)
    return (
      data?.message ??
      (responseMessage(e) || (e instanceof Error ? e.message : String(e)))
    )
  }
}

export const stopBot = () => {
  cancelBotRead()
  bot.value = null
  botRevision.value = ''
  botStatus.value = 'idle'
  botError.value = ''
}

watch(activeBackendSession, (_session, previous) => {
  if (previous !== undefined) stopBot()
})
