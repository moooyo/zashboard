import { backendConfigurationsEqual } from '@/helper/setupHandoff'
import type { Backend } from '@/types'
import { useStorage } from '@vueuse/core'
import { omit } from 'lodash'
import { v4 as uuid } from 'uuid'
import { computed, ref } from 'vue'
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

export const backendList = useStorage<Backend[]>('setup/api-list', [])

if (backendList.value.some((item) => !item.type || 'singboxChannel' in item)) {
  backendList.value = migrateBackendList(backendList.value as LegacyBackend[])
}

export const showBackendSettingsDialog = ref(false)

export const toggleBackendSettingsDialog = () => {
  showBackendSettingsDialog.value = !showBackendSettingsDialog.value
}
export const activeUuid = useStorage<string>('setup/active-uuid', '')
export const activeBackend = computed(() =>
  backendList.value.find((backend) => backend.uuid === activeUuid.value),
)

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

  activeUuid.value = nextBackend.uuid
  return nextBackend
}

export const addBackend = (backend: Omit<Backend, 'uuid'>) => {
  const currentEnd = backendList.value.find((end) =>
    backendConfigurationsEqual(omit(end, 'uuid'), backend),
  )

  if (currentEnd) {
    activeUuid.value = currentEnd.uuid
    return
  }

  const id = uuid()

  backendList.value.push({
    ...backend,
    uuid: id,
  })
  activeUuid.value = id
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
  backendList.value = backendList.value.filter((end) => end.uuid !== uuid)
  sourceIPLabelList.value.forEach((label) => {
    if (label.scope && label.scope.includes(uuid)) {
      label.scope = label.scope.filter((scope) => scope !== uuid)
      if (!label.scope.length) {
        delete label.scope
      }
    }
  })
}
