import { backendConfigurationsEqual } from '@/helper/setupHandoff'
import { BackendSessionTracker } from '@/helper/backendSession'
import {
  BACKEND_LIST_STORAGE_KEY,
  BACKEND_SESSION_SECRETS_KEY,
  dehydrateBackendState,
  hydrateBackendState,
  type StoredBackend,
} from '@/helper/backendCredentialStorage'
import { useStorage } from '@/helper/storage'
import type { Backend } from '@/types'
import { omit } from 'lodash'
import { v4 as uuid } from 'uuid'
import { computed, ref, shallowRef, watch } from 'vue'
import { sourceIPLabelList } from './settings'

// Legacy backends had no `type` and stored sing-box as a nested channel.
type LegacySingboxChannel = {
  protocol?: string
  host?: string
  port?: string
  secret?: string
}
type LegacyBackend = Partial<Backend> & { singboxChannel?: LegacySingboxChannel }

// One-time migration adds `type` and splits singboxChannel into its own backend.
const migrateBackendList = (list: LegacyBackend[]): Backend[] => {
  const migrated: Backend[] = []

  for (const item of list) {
    const channel = item.singboxChannel
    const base = omit(item, 'singboxChannel') as Backend

    migrated.push({
      ...base,
      type: base.type ?? 'clash',
      authMode: base.authMode ?? 'secret',
    })

    if (channel?.host) {
      migrated.push({
        type: 'singbox',
        protocol: channel.protocol || 'http',
        host: channel.host,
        port: channel.port || '9090',
        secondaryPath: '',
        password: channel.secret || '',
        uuid: uuid(),
        label: base.label ? `${base.label} (sing-box)` : undefined,
      })
    }
  }

  return migrated
}

const storedBackendList = useStorage<StoredBackend[]>(BACKEND_LIST_STORAGE_KEY, [])
const backendSessionSecrets = useStorage<Record<string, string>>(
  BACKEND_SESSION_SECRETS_KEY,
  {},
  sessionStorage,
)
export const backendList = ref<Backend[]>(
  hydrateBackendState(storedBackendList.value, backendSessionSecrets.value),
)

if (backendList.value.some((item) => !item.type || 'singboxChannel' in item)) {
  backendList.value = migrateBackendList(backendList.value as LegacyBackend[])
}

const persistBackendState = () => {
  const state = dehydrateBackendState(backendList.value)
  // Publish the session copy first so stripping or newly remembering a legacy
  // local secret cannot lose the current tab's credential between writes.
  backendSessionSecrets.value = state.sessionSecrets
  storedBackendList.value = state.stored
}

watch(backendList, persistBackendState, { deep: true, flush: 'sync' })
// Immediately remove legacy unacknowledged secrets from localStorage while
// preserving them for this tab's current session.
persistBackendState()

export const activeUuid = useStorage<string>('setup/active-uuid', '')
export const activeBackend = computed(() =>
  backendList.value.find((backend) => backend.uuid === activeUuid.value),
)

// 切换后端的唯一写入口。切换本身只是改一个 uuid,但后续的一切(会话重启、探测、
// 提示)都挂在 activeBackend 的 watch 上,散着写 activeUuid 就没有地方能收口。
export const setActiveBackend = (uuid: string) => {
  activeUuid.value = uuid
}

// 会话纪元:后端一变就作废上一个后端还在路上的所有请求(见 api/http.ts)。
// 挂在 activeBackend 而不是 activeUuid 上 —— 改密码、改地址同样要换一个会话,
// uuid 却没变。
const sessionTracker = new BackendSessionTracker()
export const activeBackendSession = shallowRef(sessionTracker.update(activeBackend.value ?? null))

watch(
  [activeUuid, activeBackend],
  () => {
    activeBackendSession.value = sessionTracker.update(activeBackend.value ?? null)
  },
  { deep: true, flush: 'sync' },
)

export const captureBackendSession = () => activeBackendSession.value

export const backendSessionIsCurrent = (session: { epoch: number } | null | undefined) =>
  Boolean(session && activeBackendSession.value?.epoch === session.epoch)

// 后端管理面板的形态。null = 关闭;list / create / edit 是同一个面板的三种视图,
// 而不是三个弹窗 —— 从列表点进编辑、保存后退回列表,都不该有弹窗开合的闪烁。
//
// 放在 store 而不是 composable:api 层遇到 401 要把编辑框直接摆到用户面前,而按
// eslint.config.ts 的分层约束,api 层只允许依赖 store/setup。
export type BackendManagerView =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; uuid: string }

export const backendManagerView = ref<BackendManagerView | null>(null)

export const openBackendManager = (view: BackendManagerView = { mode: 'list' }) => {
  backendManagerView.value = view
}

export const closeBackendManager = () => {
  backendManagerView.value = null
}

export const switchActiveBackend = (direction: 1 | -1) => {
  if (backendList.value.length < 2) {
    return null
  }

  const currentIndex = backendList.value.findIndex((backend) => backend.uuid === activeUuid.value)
  const startIndex = currentIndex >= 0 ? currentIndex : 0
  const nextIndex = (startIndex + direction + backendList.value.length) % backendList.value.length

  const nextBackend = backendList.value[nextIndex]

  if (!nextBackend) {
    return null
  }

  setActiveBackend(nextBackend.uuid)
  return nextBackend
}

export const addBackend = (backend: Omit<Backend, 'uuid'>) => {
  const currentEnd = backendList.value.find((end) =>
    backendConfigurationsEqual(omit(end, 'uuid'), backend),
  )

  if (currentEnd) {
    // 同一个后端被再次添加时,只有「记住密钥」这一项跟着最新一次的勾选走 ——
    // 其余字段本来就相等(否则不会命中这条),而记不记密钥是用户当次的决定。
    if (typeof backend.rememberSecret === 'boolean') {
      currentEnd.rememberSecret = backend.rememberSecret
    }
    setActiveBackend(currentEnd.uuid)
    return currentEnd.uuid
  }

  const id = uuid()

  backendList.value.push({
    ...backend,
    uuid: id,
  })
  setActiveBackend(id)
  return id
}

export const updateBackend = (uuid: string, backend: Omit<Backend, 'uuid'>) => {
  const index = backendList.value.findIndex((end) => end.uuid === uuid)
  if (index !== -1) {
    backendList.value[index] = {
      ...backend,
      uuid,
    }
  }
}

export const removeBackend = (uuid: string) => {
  const wasActive = activeUuid.value === uuid

  backendList.value = backendList.value.filter((end) => end.uuid !== uuid)

  // 删掉的正是当前后端时,顺手落到剩下的第一个。否则 activeBackend 变成 undefined,
  // 路由守卫会当场把用户踢去 setup 页 —— 而他只是在管理面板里删了一条。
  if (wasActive) {
    setActiveBackend(backendList.value[0]?.uuid ?? '')
  }

  sourceIPLabelList.value.forEach((label) => {
    if (label.scope && label.scope.includes(uuid)) {
      label.scope = label.scope.filter((scope) => scope !== uuid)
      if (!label.scope.length) {
        delete label.scope
      }
    }
  })
}
