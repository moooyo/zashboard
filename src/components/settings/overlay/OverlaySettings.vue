<template>
  <div
    v-if="hasVisibleItems"
    class="flex flex-col gap-3 text-sm"
  >
    <!-- 'unknown' 什么都不渲染:发现还没有结论,展示一个空面板等于告诉操作者
         「这里没有 overlay」,而那还不是已知的。 -->
    <template v-if="overlayState === 'temporarily-unavailable'">
      <div class="alert alert-warning py-2">
        <span>{{ $t('overlayUnavailable') }}</span>
      </div>
    </template>

    <template v-else-if="overlayState === 'supported'">
      <div class="settings-grid">
        <SettingItem :setting-key="k.overlayProcessorState">
          <div class="setting-item-label">{{ $t('overlayProcessorState') }}</div>
          <div
            class="badge badge-sm"
            :class="stateBadgeClass"
          >
            {{ $t(stateLabelKey) }}
          </div>
        </SettingItem>

        <SettingItem :setting-key="k.overlayGeneration">
          <div class="setting-item-label">{{ $t('overlayGeneration') }}</div>
          <div class="font-mono text-xs break-all">
            {{ readback?.activeGeneration || $t('overlayNoGeneration') }}
          </div>
        </SettingItem>

        <!-- 持久化代与生效代分开显示。提交先写durable恢复决定、再做原子交换,
             两者之间存在一个合法的窗口;把它们合并成一个字段,会让「崩在窗口里」
             看起来和「提交失败」完全一样。 -->
        <SettingItem
          :setting-key="k.overlayPersisted"
          :when="showsPersistedMismatch"
        >
          <div class="setting-item-label">{{ $t('overlayPersisted') }}</div>
          <div class="font-mono text-xs break-all">{{ readback?.persistedGeneration }}</div>
        </SettingItem>

        <SettingItem :setting-key="k.overlayDigest">
          <div class="setting-item-label">{{ $t('overlayDigest') }}</div>
          <div class="font-mono text-xs break-all">{{ shortDigest }}</div>
        </SettingItem>

        <SettingItem :setting-key="k.overlayLease">
          <div class="setting-item-label">{{ $t('overlayLease') }}</div>
          <div class="flex items-center gap-2">
            <div
              class="badge badge-sm"
              :class="leaseBadgeClass"
            >
              {{ $t(leaseLabelKey) }}
            </div>
            <span
              v-if="readback?.processorInstanceId"
              class="font-mono text-xs opacity-60"
            >
              {{ readback.processorInstanceId.slice(0, 12) }}
            </span>
          </div>
        </SettingItem>

        <SettingItem
          :setting-key="k.overlayDraining"
          :when="Boolean(readback?.drainingGenerations?.length)"
        >
          <div class="setting-item-label">{{ $t('overlayDraining') }}</div>
          <div class="font-mono text-xs break-all">
            {{ readback?.drainingGenerations.join(', ') }}
          </div>
        </SettingItem>

        <SettingItem
          :setting-key="k.overlayPrepared"
          :when="Boolean(readback?.preparedGenerations?.length)"
        >
          <div class="setting-item-label">{{ $t('overlayPrepared') }}</div>
          <div class="font-mono text-xs break-all">
            {{ readback?.preparedGenerations.join(', ') }}
          </div>
        </SettingItem>

        <SettingItem :setting-key="k.overlayRevision">
          <div class="setting-item-label">{{ $t('overlayRevision') }}</div>
          <div class="font-mono text-xs">
            {{ readback?.coreConfigRevision }} / {{ readback?.resolverEpoch }}
          </div>
        </SettingItem>

        <SettingItem :setting-key="k.overlayRefresh">
          <div class="setting-item-label">{{ $t('overlayRefresh') }}</div>
          <button
            class="btn btn-sm"
            @click="refresh"
          >
            {{ $t('overlayRefresh') }}
          </button>
        </SettingItem>
      </div>

      <!-- 依赖错误必须显式展示。generation 仍然是 active,捕获仍然 fail-closed,
           所以从流量上看只是「不通」;不说清楚原因,操作者只会以为是网络问题。 -->
      <div
        v-if="readback?.dependencyErrors?.length"
        class="alert alert-error flex-col items-start gap-1 py-2"
      >
        <span class="font-semibold">{{ $t('overlayDependencyErrors') }}</span>
        <span
          v-for="(err, i) in readback.dependencyErrors"
          :key="i"
          class="font-mono text-xs break-all"
          >{{ err }}</span
        >
      </div>

      <div
        v-if="!isMutationAllowed"
        class="text-xs opacity-60"
      >
        {{ $t('overlayReadOnlyNotice') }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import SettingItem from '@/components/settings/SettingItem.vue'
import { useHasAnyVisibleSetting } from '@/composables/settings'
import { OVERLAY_ITEM_KEYS, getAllKeysForCategory } from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import { overlayReadback, overlayState, refreshOverlayReadback } from '@/assembly/overlay'
import { computed } from 'vue'

const k = OVERLAY_ITEM_KEYS
const hasVisibleItems = useHasAnyVisibleSetting(getAllKeysForCategory(SETTINGS_MENU_KEY.overlay))

const readback = computed(() => overlayReadback.value)

const showsPersistedMismatch = computed(
  () =>
    Boolean(readback.value) &&
    readback.value!.persistedGeneration !== readback.value!.activeGeneration,
)

const shortDigest = computed(() => readback.value?.activeDigest?.slice(0, 16) || '—')

const STATE_LABELS: Record<string, string> = {
  disabled: 'overlayStateDisabled',
  quarantined: 'overlayStateQuarantined',
  'not-ready': 'overlayStateNotReady',
  degraded: 'overlayStateDegraded',
  ready: 'overlayStateReady',
}

const stateLabelKey = computed(
  () => STATE_LABELS[readback.value?.processorState ?? 'disabled'] ?? 'overlayStateDisabled',
)

const stateBadgeClass = computed(() => {
  switch (readback.value?.processorState) {
    case 'ready':
      return 'badge-success'
    case 'degraded':
      return 'badge-error'
    case 'quarantined':
    case 'not-ready':
      return 'badge-warning'
    default:
      return 'badge-ghost'
  }
})

const leaseLabelKey = computed(() => {
  switch (readback.value?.leaseState) {
    case 'valid':
      return 'overlayLeaseValid'
    case 'expired':
      return 'overlayLeaseExpired'
    default:
      return 'overlayLeaseNone'
  }
})

const leaseBadgeClass = computed(() =>
  readback.value?.leaseState === 'valid'
    ? 'badge-success'
    : readback.value?.leaseState === 'expired'
      ? 'badge-warning'
      : 'badge-ghost',
)

// 这个面板是只读的。浏览器永远不持有真正的 mihomo 控制凭据,所有变更都必须
// 走 5gpn BFF,那里才有 review / 证书 / sidecar / DNS 的顺序保证。
const isMutationAllowed = false

const refresh = () => {
  void refreshOverlayReadback()
}
</script>
