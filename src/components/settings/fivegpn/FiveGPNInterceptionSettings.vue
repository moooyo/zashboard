<template>
  <div
    v-if="hasVisibleItems"
    class="flex flex-col gap-3 text-sm"
  >
    <!-- A missing engine does not mean interception is disabled. Disabled means a successfully
         loaded document declares enabled:false; missing means the document could not be loaded.
         Rendering both states alike would claim the configuration is honored when nothing reads it. -->
    <template v-if="interceptionStatus === 'absent'">
      <div class="alert alert-warning py-2">
        <span>{{ $t('fivegpnInterceptionAbsent') }}</span>
      </div>
    </template>

    <template v-else-if="interceptionStatus === 'error'">
      <div class="alert alert-error py-2">
        <span>{{ interceptionError }}</span>
      </div>
    </template>

    <!-- Render when data exists rather than only while status is ready. Refreshing changes status
         to loading, so status-based rendering would blank the panel on every refresh. Preserve the
         existing values and let the button communicate refresh activity. -->
    <template v-else-if="data">
      <div
        v-if="data.certificate.status === 'pending'"
        class="alert alert-info py-2"
      >
        <span>{{ $t('fivegpnCertificatePending') }}</span>
      </div>
      <div
        v-else-if="data.certificate.status === 'error'"
        class="alert alert-error py-2"
      >
        <span>{{ $t('fivegpnCertificateError') }}</span>
      </div>
      <div
        v-else-if="certificateGap"
        class="alert alert-warning py-2"
      >
        <span>{{ $t('fivegpnCertificateBoundaryGap', { hosts: missingHosts }) }}</span>
      </div>

      <div class="settings-grid">
        <SettingItem :setting-key="k.fivegpnMitmMaster">
          <div class="setting-item-label">{{ $t('fivegpnMitmMaster') }}</div>
          <input
            type="checkbox"
            class="toggle"
            :checked="data.enabled"
            :disabled="busy"
            @change="toggleMaster"
          />
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnHttp2">
          <div class="setting-item-label">{{ $t('fivegpnHttp2') }}</div>
          <input
            type="checkbox"
            class="toggle"
            :checked="data.http2"
            :disabled="busy"
            @change="toggleHttp2"
          />
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnHttp3">
          <div class="setting-item-label">{{ $t('fivegpnHttp3') }}</div>
          <div
            data-testid="fivegpn-http3-boundary"
            class="text-sm"
          >
            {{ $t('fivegpnHttp3Disabled') }}
          </div>
        </SettingItem>

        <!-- "Installed" and "currently captured" are different counts. Disabled extensions still
             declare hosts; reporting declarations as the active set would falsely claim that traffic
             is being intercepted. -->
        <SettingItem :setting-key="k.fivegpnModules">
          <div class="setting-item-label">{{ $t('fivegpnModules') }}</div>
          <div>
            {{ $t('fivegpnModuleCount', { enabled: enabledCount, total: data.modules.length }) }}
          </div>
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnCaptureHosts">
          <div class="setting-item-label">{{ $t('fivegpnCaptureHosts') }}</div>
          <div>{{ data.active_capture_hosts.length }}</div>
        </SettingItem>

        <!-- An empty egress group has no meaning by itself. For a module that requires one, however,
             it fully explains why an installed and enabled module captures nothing. Show it only
             when the binding is genuinely missing. -->
        <SettingItem
          :setting-key="k.fivegpnUnboundEgress"
          :when="unboundEgress.length > 0"
        >
          <div class="setting-item-label">{{ $t('fivegpnUnboundEgress') }}</div>
          <div class="text-error">{{ unboundEgress.join(', ') }}</div>
        </SettingItem>

        <SettingItem
          :setting-key="k.fivegpnCertificateExpiry"
          :when="Boolean(data.certificate.loaded && data.certificate.not_after)"
        >
          <div class="setting-item-label">{{ $t('fivegpnCertificateExpiry') }}</div>
          <div>{{ expiry }}</div>
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnInterceptionRefresh">
          <div class="setting-item-label">{{ $t('fivegpnInterceptionRefresh') }}</div>
          <button
            class="btn btn-sm"
            :disabled="interceptionStatus === 'loading'"
            @click="refreshInterception"
          >
            {{ $t('fivegpnInterceptionRefresh') }}
          </button>
        </SettingItem>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  interception,
  interceptionError,
  interceptionStatus,
  refreshInterception,
  setInterceptionSettings,
  startInterceptionLifecyclePolling,
  stopInterceptionLifecyclePolling,
} from '@/assembly/fivegpn/interception'
import SettingItem from '@/components/settings/SettingItem.vue'
import { useHasAnyVisibleSetting } from '@/composables/settings'
import { FIVEGPN_INTERCEPTION_ITEM_KEYS, getAllKeysForCategory } from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const k = FIVEGPN_INTERCEPTION_ITEM_KEYS
const hasVisibleItems = useHasAnyVisibleSetting(
  getAllKeysForCategory(SETTINGS_MENU_KEY.fivegpnInterception),
)

const data = computed(() => interception.value)

// The mutable interception controls live in Settings and apply immediately.
// HTTP/3 is deliberately not one of them: the fixed gateway guard blocks
// UDP/443, and the request boundary below omits this read-only snapshot field.
const busy = ref(false)

const settingsOf = () => ({
  enabled: data.value?.enabled ?? false,
  http2: data.value?.http2 ?? false,
})

const apply = async (next: ReturnType<typeof settingsOf>) => {
  if (!data.value || busy.value) return
  busy.value = true
  const error = await setInterceptionSettings(next)
  busy.value = false
  if (error) {
    // On failure, restore the core's actual state instead of leaving a toggle that appears active.
    void refreshInterception()
  }
}

const toggleMaster = () => apply({ ...settingsOf(), enabled: !data.value?.enabled })
const toggleHttp2 = () => apply({ ...settingsOf(), http2: !data.value?.http2 })

const enabledCount = computed(() => (data.value?.modules ?? []).filter((m) => m.enabled).length)

const certificateGap = computed(
  () => data.value?.certificate.loaded === true && !data.value.certificate.covers_all_capture_hosts,
)

const missingHosts = computed(() => (data.value?.certificate.missing_hosts ?? []).join(', '))

const unboundEgress = computed(() =>
  (data.value?.modules ?? [])
    .filter((m) => m.enabled && m.egress_group_required && !m.egress_group)
    .map((m) => m.name || m.id),
)

const expiry = computed(() => {
  const at = data.value?.certificate.not_after
  return at ? new Date(at * 1000).toLocaleString() : ''
})

onMounted(startInterceptionLifecyclePolling)
onUnmounted(stopInterceptionLifecyclePolling)
</script>
