<template>
  <CardState
    v-if="hasVisibleItems"
    :status="interceptionStatus"
    :ready="Boolean(data)"
    :loading-message="$t('fivegpnLoadingState')"
    :absent-message="$t('fivegpnInterceptionAbsent')"
    :error-message="interceptionError"
    :retry-label="$t('fivegpnRetryState')"
    :retrying="interceptionStatus === 'loading'"
    class="flex flex-col gap-3 text-sm"
    @retry="refreshInterception"
  >
    <!-- Render when data exists rather than only while status is ready. Refreshing changes status
         to loading, so status-based rendering would blank the panel on every refresh. Preserve the
         existing values and let the button communicate refresh activity. -->
    <template v-if="data">
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

        <!-- A selected group can disappear after a mihomo config reload. Keep the
             persisted name visible while the runtime fails closed. -->
        <SettingItem
          :setting-key="k.fivegpnUnavailableEgress"
          :when="unavailableEgress.length > 0"
        >
          <div class="setting-item-label">{{ $t('fivegpnUnavailableEgressLabel') }}</div>
          <div class="text-error">{{ unavailableEgress.join(', ') }}</div>
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
  </CardState>
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
import CardState from '@/components/ds/CardState.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import { useHasAnyVisibleSetting } from '@/composables/settings'
import { FIVEGPN_INTERCEPTION_ITEM_KEYS, getAllKeysForCategory } from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import {
  activeBackendSession,
  backendSessionIsCurrent,
  captureBackendSession,
} from '@/store/setup'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const k = FIVEGPN_INTERCEPTION_ITEM_KEYS
const hasVisibleItems = useHasAnyVisibleSetting(
  getAllKeysForCategory(SETTINGS_MENU_KEY.fivegpnInterception),
)

const data = computed(() => interception.value)

// The mutable interception controls live in Settings and apply immediately.
// HTTP/3 is deliberately not one of them: the fixed gateway guard blocks
// UDP/443, and the request boundary below omits this read-only snapshot field.
const busy = ref(false)
let actionEpoch = 0

const settingsOf = () => ({
  enabled: data.value?.enabled ?? false,
  http2: data.value?.http2 ?? false,
})

const apply = async (next: ReturnType<typeof settingsOf>) => {
  if (!data.value || busy.value) return
  const action = ++actionEpoch
  const session = captureBackendSession()
  if (!session) return
  busy.value = true
  const error = await setInterceptionSettings(next)
  if (action !== actionEpoch || !backendSessionIsCurrent(session)) return
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

const unavailableEgress = computed(() =>
  (data.value?.modules ?? [])
    .filter((m) => !(data.value?.available_egress_groups ?? []).includes(m.egress_group))
    .map((m) => m.name || m.id),
)

const expiry = computed(() => {
  const at = data.value?.certificate.not_after
  return at ? new Date(at * 1000).toLocaleString() : ''
})

let mounted = false
let loadEpoch = 0
const loadSession = async (session = captureBackendSession()) => {
  if (!session) return
  const epoch = ++loadEpoch
  await refreshInterception()
  if (mounted && epoch === loadEpoch && backendSessionIsCurrent(session)) {
    startInterceptionLifecyclePolling()
  }
}

onMounted(() => {
  mounted = true
  void loadSession()
})
watch(activeBackendSession, (session, previous) => {
  if (session?.epoch === previous?.epoch) return
  actionEpoch += 1
  loadEpoch += 1
  busy.value = false
  stopInterceptionLifecyclePolling()
  if (session) {
    void Promise.resolve().then(() => {
      if (backendSessionIsCurrent(session)) return loadSession(session)
    })
  }
})
onUnmounted(() => {
  mounted = false
  actionEpoch += 1
  loadEpoch += 1
  stopInterceptionLifecyclePolling()
})
</script>
