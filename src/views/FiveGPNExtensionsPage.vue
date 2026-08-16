<template>
  <div class="relative size-full overflow-x-hidden">
    <div
      class="flex flex-col gap-3 p-3"
      :style="padding"
    >
      <div
        v-if="interceptionStatus === 'absent'"
        class="alert alert-warning"
      >
        <span>{{ $t('fivegpnInterceptionAbsent') }}</span>
      </div>
      <div
        v-else-if="interceptionStatus === 'error'"
        class="alert alert-error"
      >
        <span>{{ interceptionError }}</span>
      </div>

      <template v-if="data">
        <div
          v-if="notice"
          class="alert"
          :class="noticeIsError ? 'alert-error' : 'alert-success'"
        >
          <span>{{ notice }}</span>
        </div>

        <div
          v-if="data.certificate.status === 'pending'"
          class="alert alert-info"
        >
          <span class="loading loading-spinner loading-sm" />
          <span>{{ $t('fivegpnCertificatePending') }}</span>
        </div>
        <div
          v-else-if="data.certificate.status === 'error'"
          class="alert alert-error"
        >
          <div class="flex flex-1 flex-col gap-1">
            <span>{{ $t('fivegpnCertificateError') }}</span>
            <span class="font-mono text-xs">
              {{
                [data.certificate.error_code, data.certificate.error_message]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </span>
          </div>
          <button
            class="btn btn-sm"
            :disabled="busy"
            @click="retryCertificate"
          >
            {{ $t('fivegpnRetryCertificate') }}
          </button>
        </div>

        <!-- The MITM master and HTTP/2 controls live in Interception settings.
             HTTP/3 is intentionally unavailable because the gateway blocks UDP/443. -->
        <div class="base-container flex flex-wrap items-center gap-3 p-3 text-sm">
          <span
            class="badge badge-sm"
            :class="data.enabled ? 'badge-success' : 'badge-ghost'"
          >
            {{ $t('fivegpnMitmMaster') }}:
            {{ $t(data.enabled ? 'fivegpnEnabled' : 'fivegpnDisabled') }}
          </span>
          <span class="text-xs opacity-70">
            {{
              $t('fivegpnModuleCount', {
                enabled: enabledCount,
                total: (data.modules ?? []).length,
              })
            }}
            · {{ $t('fivegpnCaptureHosts') }}: {{ (data.active_capture_hosts ?? []).length }}
          </span>
        </div>

        <!-- Installed state and explicit manifest import are separate tasks on the same route.
             Marketplace discovery, host audit, and plugin logs have their own top-level routes. -->
        <SegmentedControl
          v-model="tab"
          :options="tabOptions"
        />

        <FiveGPNExtensionReviewDialog
          v-model="reviewOpen"
          v-model:draft="reviewDraft"
          :mode="reviewMode"
          :detail="reviewDetail"
          :digest="reviewDigest"
          :digest-kind="reviewDigestKind"
          :digest-is-new="reviewDigestIsNew"
          :egress-is-new="reviewEgressIsNew"
          :binding-is-new="reviewBindingIsNew"
          :installed-version="candidate?.installedVersion"
          :execution-position="reviewExecutionPosition"
          :history-restorable="reviewHistoryRestorable"
          :changes="candidateChanges"
          :new-difference-keys="reviewNewDifferenceKeys"
          :loading="reviewLoading"
          :submitting="reviewSubmitting"
          :conflict-message="reviewConflict"
          :error-message="reviewError"
          :resolved-message="reviewResolvedMessage"
          :blocking-reason="authorizationBlockingReason"
          :action-label="reviewActionLabel"
          @cancel="closeReview"
          @reload="reloadReview"
          @retry="retryReview"
          @confirm="confirmReview"
        />

        <template v-if="tab === 'installed'">
          <!-- Installed extensions. Order is priority: the earlier extension owns overlapping capture
               hosts, and the order also determines action composition, egress, and origin resolution. -->
          <div class="flex flex-col gap-2">
            <div
              v-for="(module, index) in orderedModules"
              :key="module.id"
              class="base-container flex flex-col gap-2 p-3"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="w-6 text-center text-xs opacity-60">{{ index + 1 }}</span>
                <input
                  type="checkbox"
                  class="toggle toggle-sm"
                  :checked="module.enabled"
                  :disabled="busy"
                  :aria-label="$t('fivegpnToggleExtension', { name: module.name || module.id })"
                  @change="requestToggle(module, $event)"
                />
                <span class="font-medium">{{ module.name || module.id }}</span>
                <span class="badge badge-ghost badge-sm">{{ module.version }}</span>
                <span
                  class="badge badge-sm"
                  :class="runtimeBadgeClass(module)"
                >
                  {{ runtimeLabel(module) }}
                </span>
                <span
                  v-if="!egressAvailable(module.egress_group)"
                  class="badge badge-error badge-sm"
                >
                  {{ $t('fivegpnUnavailableEgress', { group: module.egress_group }) }}
                </span>
                <div class="ml-auto flex gap-1">
                  <button
                    class="btn btn-ghost btn-xs"
                    :disabled="index === 0 || busy"
                    :aria-label="$t('fivegpnMoveExtensionUp', { name: module.name || module.id })"
                    @click="moveModule(index, -1)"
                  >
                    ↑
                  </button>
                  <button
                    class="btn btn-ghost btn-xs"
                    :disabled="index === orderedModules.length - 1 || busy"
                    :aria-label="$t('fivegpnMoveExtensionDown', { name: module.name || module.id })"
                    @click="moveModule(index, 1)"
                  >
                    ↓
                  </button>
                  <button
                    v-if="module.setting_count > 0"
                    class="btn btn-ghost btn-xs"
                    :disabled="busy"
                    @click="openSettings(module)"
                  >
                    {{ $t('fivegpnConfigureCount', { count: module.setting_count }) }}
                  </button>
                  <button
                    class="btn btn-ghost btn-xs text-error"
                    :disabled="busy"
                    @click="remove(module)"
                  >
                    {{ $t('fivegpnUninstall') }}
                  </button>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-3 pl-8 text-xs">
                <label class="flex items-center gap-1">
                  <span class="opacity-70">{{ $t('fivegpnEgressGroup') }}</span>
                  <select
                    class="select select-xs w-40"
                    :value="module.egress_group"
                    :disabled="busy"
                    @change="setEgress(module, $event)"
                  >
                    <option
                      v-if="!egressAvailable(module.egress_group)"
                      :value="module.egress_group"
                      disabled
                    >
                      {{ $t('fivegpnUnavailableEgress', { group: module.egress_group }) }}
                    </option>
                    <option
                      v-for="group in data.available_egress_groups"
                      :key="group"
                      :value="group"
                    >
                      {{ group }}
                    </option>
                  </select>
                </label>
                <label class="flex items-center gap-1">
                  <span class="opacity-70">{{ $t('fivegpnCaptureDns') }}</span>
                  <select
                    class="select select-xs w-28"
                    :value="module.capture_dns"
                    :disabled="busy"
                    @change="setCaptureDNS(module, $event)"
                  >
                    <option value="trust">trust</option>
                    <option value="china">china</option>
                  </select>
                </label>
                <span class="min-w-0 flex-1 font-mono break-all opacity-60">{{
                  module.capture_hosts.join(', ')
                }}</span>
              </div>

              <div
                v-if="module.enabled && !module.runtime.ready"
                class="ml-8 flex flex-col gap-1 text-xs"
                :class="module.runtime.phase === 'certificate_error' ? 'text-error' : 'opacity-70'"
              >
                <span>{{ lifecycleDescription(module) }}</span>
              </div>

              <div
                v-if="editingModuleId === module.id"
                class="border-base-300 ml-0 flex flex-col gap-3 border-t pt-3 md:ml-8"
              >
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">{{ $t('fivegpnExtensionConfiguration') }}</span>
                  <span
                    v-if="detailLoading"
                    class="loading loading-spinner loading-xs"
                  />
                </div>
                <div
                  v-if="detailError"
                  class="alert alert-error py-2"
                >
                  <span>{{ detailError }}</span>
                </div>
                <FiveGPNExtensionSettingsEditor
                  v-else-if="editingDetail"
                  :settings="editingDetail.settings ?? []"
                  :id-prefix="`installed-${module.id}`"
                  :busy="busy"
                  :submit-label="$t('fivegpnSaveConfiguration')"
                  :cancel-label="$t('fivegpnCancel')"
                  :conflict-message="settingsConflict"
                  @save="saveSettings(module.id, $event)"
                  @cancel="closeSettings"
                />
              </div>
            </div>
          </div>
        </template>
        <template v-else-if="tab === 'install'">
          <!-- Import -->
          <div class="base-container flex flex-col gap-2 p-3">
            <div class="flex flex-wrap items-end gap-2">
              <label class="flex flex-1 flex-col gap-1">
                <span class="text-sm font-medium">{{ $t('fivegpnImportUrl') }}</span>
                <input
                  v-model="importUrl"
                  class="input input-sm w-full"
                  placeholder="https://example.com/extension.yaml"
                />
              </label>
              <button
                class="btn btn-sm"
                :disabled="reviewing || busy || (!importUrl && !importContent)"
                @click="review"
              >
                {{ $t('fivegpnReview') }}
              </button>
            </div>
            <details>
              <summary class="cursor-pointer text-xs opacity-70">
                {{ $t('fivegpnPasteManifest') }}
              </summary>
              <textarea
                v-model="importContent"
                class="textarea textarea-sm mt-2 w-full font-mono"
                rows="6"
              />
            </details>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  FIVEGPN_REVIEW_CONTRACT,
  type FiveGPNCandidate,
  type FiveGPNCaptureDNS,
  type FiveGPNModuleDetail,
  type FiveGPNModuleSummary,
  type FiveGPNSettingValue,
} from '@/api/fivegpn'
import {
  cancelInterceptionInspection,
  installReviewed,
  interception,
  interceptionError,
  interceptionRevision,
  interceptionStatus,
  fetchExtensionDetail,
  inspectExtensionDetail,
  refreshInterception,
  retryInterceptionCertificate,
  reviewExtension,
  setExecutionOrder,
  setExtensionCaptureDNS,
  setExtensionEgress,
  setExtensionEnabled,
  setExtensionSettings,
  startInterceptionLifecyclePolling,
  stopInterceptionLifecyclePolling,
  uninstallExtension,
} from '@/assembly/fivegpn/interception'
import SegmentedControl, { type SegmentOption } from '@/components/common/SegmentedControl.vue'
import FiveGPNExtensionReviewDialog from '@/components/fivegpn/FiveGPNExtensionReviewDialog.vue'
import FiveGPNExtensionSettingsEditor from '@/components/fivegpn/FiveGPNExtensionSettingsEditor.vue'
import { usePaddingForViews } from '@/composables/paddingViews'
import {
  findFlatLocationSettings,
  invalidFlatLocationKeys,
} from '@/helper/fivegpnExtensionSettings'
import {
  extensionReviewChanges,
  mergeReviewDraft,
  reviewContractMatches,
  type FiveGPNReviewChange,
} from '@/helper/fivegpnExtensionReview'
import { activeBackendSession, backendSessionIsCurrent, captureBackendSession } from '@/store/setup'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { padding } = usePaddingForViews({ offsetTop: 12, offsetBottom: 8 })

// Installed state and explicit pasted import share the review transaction on
// this route. Marketplace discovery and plugin logs are separate top-level
// surfaces and therefore are intentionally absent from this switcher.
const tab = ref<'installed' | 'install'>('installed')
const tabOptions = computed<SegmentOption[]>(() => [
  {
    value: 'installed',
    label: t('fivegpnInstalledTab'),
    count: (data.value?.modules ?? []).length,
  },
  { value: 'install', label: t('fivegpnImportTab') },
])

const data = computed(() => interception.value)
const egressAvailable = (group: string) =>
  Boolean(group && data.value?.available_egress_groups.includes(group))
const busy = ref(false)
const notice = ref('')
const noticeIsError = ref(false)
let actionEpoch = 0

const importUrl = ref('')
const importContent = ref('')
const candidate = ref<FiveGPNCandidate | null>(null)
const candidateRevision = ref('')
const reviewOpen = ref(false)
const reviewHistoryRestorable = ref(true)
const reviewMode = ref<'install' | 'enable'>('install')
const reviewLoading = ref(false)
const reviewSubmitting = ref(false)
const reviewing = computed(() => reviewLoading.value || reviewSubmitting.value)
const reviewError = ref('')
let pageInspectionEpoch = 0
const reviewConflict = ref('')
const reviewResolvedMessage = ref('')
const reviewDraft = ref<Record<string, FiveGPNSettingValue>>({})
const reviewNewDifferenceKeys = ref<string[]>([])
const reviewBaselineDifferenceKeys = ref<string[]>([])
const reviewImportSource = ref<{ url?: string; content?: string } | null>(null)
let reviewActionController: AbortController | undefined
let reviewActionEpoch = 0

const editingModuleId = ref('')
const editingDetail = ref<FiveGPNModuleDetail | null>(null)
const editingRevision = ref('')
const detailLoading = ref(false)
let detailViewEpoch = 0
const detailError = ref('')
const settingsConflict = ref('')

const authorizationModuleId = ref('')
const authorizationDetail = ref<FiveGPNModuleDetail | null>(null)
const authorizationRevision = ref('')

const enabledCount = computed(() => (data.value?.modules ?? []).filter((m) => m.enabled).length)

// Execution order is authoritative; the modules array is only a set. Render in execution order, or
// the extension shown as first would differ from the one that actually matches first.
const orderedModules = computed(() => {
  const modules = data.value?.modules ?? []
  const order = data.value?.execution_order ?? []
  const byID = new Map(modules.map((m) => [m.id, m]))
  const out: FiveGPNModuleSummary[] = []
  for (const id of order) {
    const module = byID.get(id)
    if (module) {
      out.push(module)
      byID.delete(id)
    }
  }
  return [...out, ...byID.values()]
})

const report = (error: string) => {
  noticeIsError.value = Boolean(error)
  notice.value = error === 'conflict' ? t('fivegpnConflict') : error || t('fivegpnSaved')
}

const run = async (action: () => Promise<string>) => {
  const epoch = ++actionEpoch
  const session = captureBackendSession()
  busy.value = true
  const error = await action()
  if (epoch !== actionEpoch || !backendSessionIsCurrent(session)) return { error: '', stale: true }
  report(error)
  busy.value = false
  return { error, stale: false }
}

const runReviewAction = async (action: () => Promise<string>) => {
  const epoch = ++reviewActionEpoch
  const session = captureBackendSession()
  busy.value = true
  const error = await action()
  if (epoch !== reviewActionEpoch || !backendSessionIsCurrent(session)) {
    return { error: '', stale: true }
  }
  busy.value = false
  return { error, stale: false }
}

const runtimeBadgeClass = (module: FiveGPNModuleSummary) => {
  if (module.runtime.ready) return 'badge-success'
  if (
    module.runtime.phase === 'certificate_error' ||
    module.runtime.phase === 'boundary_unavailable'
  ) {
    return 'badge-error'
  }
  if (module.enabled) return 'badge-warning'
  return 'badge-ghost'
}

const runtimeLabel = (module: FiveGPNModuleSummary) => {
  const key: Record<string, string> = {
    disabled: 'fivegpnLifecycleDisabled',
    armed: 'fivegpnLifecycleArmed',
    certificate_pending: 'fivegpnLifecycleCertificatePending',
    certificate_error: 'fivegpnLifecycleCertificateError',
    boundary_unavailable: 'fivegpnLifecycleBoundaryUnavailable',
    egress_unavailable: 'fivegpnLifecycleEgressUnavailable',
    active: 'fivegpnLifecycleActive',
  }
  return t(key[module.runtime.phase] ?? 'fivegpnLifecycleUnavailable')
}

const lifecycleDescription = (module: FiveGPNModuleSummary) =>
  t(`fivegpnLifecycleDescription_${module.runtime.phase}`)

const closeAuthorization = () => {
  authorizationModuleId.value = ''
  authorizationDetail.value = null
  authorizationRevision.value = ''
}

const requiredSettingMissing = (detail: FiveGPNModuleDetail) =>
  (detail.settings ?? []).some((setting) => {
    if (!setting.required) return false
    const value = setting.value
    if (value === undefined || value === null) return true
    if (typeof value === 'string') return !value.trim()
    if (setting.type === 'location' && typeof value === 'object') {
      return value.longitude === undefined || value.latitude === undefined || !value.accuracy
    }
    return false
  })

const authorizationBlockingReason = computed(() => {
  const detail = authorizationDetail.value
  if (!detail) return ''
  if (!reviewContractMatches(detail.review_contract, FIVEGPN_REVIEW_CONTRACT)) {
    return t('fivegpnReviewContractChanged')
  }
  if (!egressAvailable(detail.egress_group)) {
    return t('fivegpnUnavailableEgress', { group: detail.egress_group })
  }
  if (requiredSettingMissing(detail)) return t('fivegpnEnableNeedsSettings')
  const flatLocation = findFlatLocationSettings(detail.settings ?? [])
  if (flatLocation) {
    const values = Object.fromEntries(
      (detail.settings ?? []).map((setting) => [setting.key, setting.value ?? null]),
    )
    if (invalidFlatLocationKeys(flatLocation, values).size) return t('fivegpnLocationInvalid')
  }
  return ''
})

const requestToggle = async (module: FiveGPNModuleSummary, event: Event) => {
  ;(event.target as HTMLInputElement).checked = module.enabled
  if (module.enabled) {
    await run(() => setExtensionEnabled(module.id, false))
    return
  }
  await openEnableReview(module.id)
}

const retryCertificate = async () => {
  const result = await run(retryInterceptionCertificate)
  if (!result.stale && !result.error) startInterceptionLifecyclePolling()
}

const openSettings = async (module: FiveGPNModuleSummary) => {
  if (editingModuleId.value === module.id) {
    closeSettings()
    return
  }
  const epoch = ++detailViewEpoch
  editingModuleId.value = module.id
  editingDetail.value = null
  editingRevision.value = ''
  detailError.value = ''
  settingsConflict.value = ''
  detailLoading.value = true
  const result = await fetchExtensionDetail(module.id)
  if (epoch !== detailViewEpoch || editingModuleId.value !== module.id) return
  detailLoading.value = false
  if (!result.detail) {
    detailError.value = result.error === 'conflict' ? t('fivegpnConflict') : result.error
    return
  }
  editingDetail.value = result.detail
  editingRevision.value = result.revision ?? ''
}

const closeSettings = () => {
  detailViewEpoch++
  editingModuleId.value = ''
  editingDetail.value = null
  editingRevision.value = ''
  detailLoading.value = false
  detailError.value = ''
  settingsConflict.value = ''
}

const saveSettings = async (id: string, values: Record<string, FiveGPNSettingValue>) => {
  settingsConflict.value = ''
  if (!editingRevision.value) return
  const result = await run(() => setExtensionSettings(id, values, editingRevision.value))
  if (result.stale) return
  if (result.error === 'conflict') {
    settingsConflict.value = t('fivegpnSettingsConflictPreserved')
    return
  }
  if (result.error) {
    detailError.value = result.error
    return
  }
  closeSettings()
}

const setEgress = (module: FiveGPNModuleSummary, event: Event) => {
  const group = (event.target as HTMLSelectElement).value.trim()
  if (!group) return
  return run(() => setExtensionEgress(module.id, group))
}

const setCaptureDNS = (module: FiveGPNModuleSummary, event: Event) =>
  run(() =>
    setExtensionCaptureDNS(
      module.id,
      (event.target as HTMLSelectElement).value as FiveGPNCaptureDNS,
    ),
  )

const moveModule = (index: number, delta: number) => {
  const order = orderedModules.value.map((m) => m.id)
  const expectedRevision = interceptionRevision.value
  const target = index + delta
  if (target < 0 || target >= order.length) return
  const moved = orderedModules.value[index]
  const neighbor = orderedModules.value[target]
  if (
    !window.confirm(
      t('fivegpnReorderConfirm', {
        moved: moved.name || moved.id,
        neighbor: neighbor.name || neighbor.id,
      }),
    )
  ) {
    return
  }
  const [id] = order.splice(index, 1)
  order.splice(target, 0, id)
  return run(() => setExecutionOrder(order, expectedRevision))
}

const remove = (module: FiveGPNModuleSummary) => {
  if (!window.confirm(t('fivegpnUninstallConfirm', { name: module.name || module.id }))) return
  return run(() => uninstallExtension(module.id))
}

const source = () =>
  importUrl.value.trim() ? { url: importUrl.value.trim() } : { content: importContent.value }

const reviewDifferenceKey = (change: FiveGPNReviewChange) => JSON.stringify(change)
const candidateChanges = computed(() =>
  extensionReviewChanges(null, candidate.value?.detail ?? null, candidate.value?.digest),
)
const reviewDetail = computed(() => {
  const detail =
    reviewMode.value === 'enable' ? authorizationDetail.value : (candidate.value?.detail ?? null)
  return detail && reviewContractMatches(detail.review_contract, FIVEGPN_REVIEW_CONTRACT)
    ? detail
    : null
})
const reviewExecutionPosition = computed(() => {
  const id = reviewDetail.value?.id
  const order = data.value?.execution_order ?? []
  if (!id) return '—'
  const index = order.indexOf(id)
  const position = index >= 0 ? index + 1 : order.length + 1
  const total = index >= 0 ? order.length : order.length + 1
  return `${position} / ${total}`
})
const reviewDigest = computed(() =>
  reviewMode.value === 'enable'
    ? (authorizationDetail.value?.snapshot_digest ?? '')
    : (candidate.value?.digest ?? ''),
)
const reviewDigestKind = computed<'snapshot' | 'manifest'>(() => 'snapshot')
const reviewDigestDifferenceKey = (digest: string) => `digest:${digest}`
const reviewDigestIsNew = computed(() =>
  reviewNewDifferenceKeys.value.includes(reviewDigestDifferenceKey(reviewDigest.value)),
)
const reviewEgressDifferenceKey = () => `egress:${reviewDetail.value?.egress_group ?? ''}`
const reviewCaptureDNSDifferenceKey = () => `capture-dns:${reviewDetail.value?.capture_dns ?? ''}`
const reviewPositionDifferenceKey = () => `execution-position:${reviewExecutionPosition.value}`
const reviewEgressIsNew = computed(() =>
  reviewNewDifferenceKeys.value.includes(reviewEgressDifferenceKey()),
)
const reviewBindingIsNew = computed(
  () =>
    reviewNewDifferenceKeys.value.includes(reviewCaptureDNSDifferenceKey()) ||
    reviewNewDifferenceKeys.value.includes(reviewPositionDifferenceKey()),
)
const reviewActionLabel = computed(() => {
  if (reviewMode.value === 'enable') return t('fivegpnAuthorizeAndEnable')
  return t('fivegpnInstall')
})

const resetReviewData = () => {
  candidate.value = null
  candidateRevision.value = ''
  reviewImportSource.value = null
  reviewDraft.value = {}
  reviewConflict.value = ''
  reviewResolvedMessage.value = ''
  reviewError.value = ''
  reviewNewDifferenceKeys.value = []
  reviewBaselineDifferenceKeys.value = []
  reviewLoading.value = false
  reviewSubmitting.value = false
  closeAuthorization()
}

const clearReview = () => {
  reviewHistoryRestorable.value = false
  pageInspectionEpoch++
  reviewActionEpoch++
  cancelInterceptionInspection()
  reviewActionController?.abort()
  reviewActionController = undefined
  if (reviewSubmitting.value) busy.value = false
  reviewOpen.value = false
  resetReviewData()
}

const closeReview = () => {
  const cancelledBeforeDetail = reviewLoading.value && !reviewDetail.value
  pageInspectionEpoch++
  reviewActionEpoch++
  cancelInterceptionInspection()
  reviewActionController?.abort()
  reviewActionController = undefined
  if (reviewSubmitting.value) busy.value = false
  reviewLoading.value = false
  reviewSubmitting.value = false
  if (cancelledBeforeDetail) reviewError.value = t('fivegpnReviewLoadCancelled')
  reviewOpen.value = false
}

const beginReview = (mode: 'install' | 'enable') => {
  pageInspectionEpoch++
  cancelInterceptionInspection()
  reviewActionController?.abort()
  resetReviewData()
  reviewHistoryRestorable.value = true
  reviewMode.value = mode
  reviewOpen.value = true
  reviewLoading.value = true
  return { epoch: pageInspectionEpoch, session: captureBackendSession() }
}

const inspectionIsStale = (context: {
  epoch: number
  session: ReturnType<typeof captureBackendSession>
}) =>
  context.epoch !== pageInspectionEpoch ||
  !backendSessionIsCurrent(context.session) ||
  !reviewOpen.value

const setDifferenceState = (changes: FiveGPNReviewChange[], reloading: boolean, digest = '') => {
  const keys = [
    ...changes.map(reviewDifferenceKey),
    ...(digest ? [reviewDigestDifferenceKey(digest)] : []),
    reviewEgressDifferenceKey(),
    reviewCaptureDNSDifferenceKey(),
    reviewPositionDifferenceKey(),
  ]
  reviewNewDifferenceKeys.value = reloading
    ? keys.filter((key) => !reviewBaselineDifferenceKeys.value.includes(key))
    : []
  reviewBaselineDifferenceKeys.value = keys
}

const loadInstallReview = async (reloading = false) => {
  const request = reviewImportSource.value
  if (!request) return
  const context = { epoch: ++pageInspectionEpoch, session: captureBackendSession() }
  reviewLoading.value = true
  reviewError.value = ''
  const result = await reviewExtension(request)
  if (inspectionIsStale(context)) return
  reviewLoading.value = false
  if (result.error || !result.candidate || !result.revision) {
    reviewError.value = result.error === 'conflict' ? t('fivegpnConflict') : result.error
    return
  }
  if (!reviewContractMatches(result.candidate.detail.review_contract, FIVEGPN_REVIEW_CONTRACT)) {
    candidate.value = null
    candidateRevision.value = ''
    reviewDraft.value = {}
    reviewNewDifferenceKeys.value = []
    reviewBaselineDifferenceKeys.value = []
    reviewError.value = t('fivegpnReviewContractChanged')
    return
  }
  if (result.candidate.installed) {
    reviewError.value = t('fivegpnMarketplaceUpdateOnly')
    return
  }
  candidate.value = result.candidate
  candidateRevision.value = result.revision
  reviewDraft.value = mergeReviewDraft(result.candidate.detail.settings ?? [], reviewDraft.value)
  setDifferenceState([], reloading, result.candidate.digest)
  if (reloading) reviewConflict.value = ''
}

const review = async () => {
  if (busy.value) return
  const request = source()
  beginReview('install')
  reviewImportSource.value = request
  await loadInstallReview()
}

const loadEnableReview = async (reloading = false) => {
  if (!authorizationModuleId.value) return
  const context = { epoch: ++pageInspectionEpoch, session: captureBackendSession() }
  reviewLoading.value = true
  reviewError.value = ''
  const result = await inspectExtensionDetail(authorizationModuleId.value)
  if (inspectionIsStale(context)) return
  reviewLoading.value = false
  if (!result.detail || !result.revision) {
    reviewError.value = result.error === 'conflict' ? t('fivegpnConflict') : result.error
    return
  }
  if (!reviewContractMatches(result.detail.review_contract, FIVEGPN_REVIEW_CONTRACT)) {
    authorizationDetail.value = null
    authorizationRevision.value = ''
    reviewDraft.value = {}
    reviewNewDifferenceKeys.value = []
    reviewBaselineDifferenceKeys.value = []
    reviewError.value = t('fivegpnReviewContractChanged')
    return
  }
  authorizationDetail.value = result.detail
  authorizationRevision.value = result.revision
  reviewDraft.value = mergeReviewDraft(result.detail.settings ?? [], reviewDraft.value)
  setDifferenceState([], reloading, result.detail.snapshot_digest)
  if (result.detail.enabled) {
    reviewConflict.value = ''
    reviewResolvedMessage.value = t('fivegpnReviewAlreadyEnabled')
    return
  }
  if (reloading) reviewConflict.value = ''
}

const openEnableReview = async (id: string) => {
  beginReview('enable')
  authorizationModuleId.value = id
  await loadEnableReview()
}

const retryReview = async (reloading = false) => {
  if (reviewMode.value === 'enable') {
    await loadEnableReview(reloading)
  } else {
    await loadInstallReview(reloading)
  }
}

const reloadReview = () => retryReview(true)

const confirmReview = async () => {
  if (busy.value || reviewConflict.value || reviewLoading.value || reviewSubmitting.value) return
  reviewError.value = ''
  reviewActionController?.abort()
  const actionController = new AbortController()
  reviewActionController = actionController
  reviewSubmitting.value = true

  let action: (() => Promise<string>) | undefined
  if (reviewMode.value === 'enable') {
    const detail = authorizationDetail.value
    if (
      !authorizationModuleId.value ||
      !authorizationRevision.value ||
      !detail ||
      authorizationBlockingReason.value
    ) {
      reviewSubmitting.value = false
      if (reviewActionController === actionController) reviewActionController = undefined
      return
    }
    action = () =>
      setExtensionEnabled(
        authorizationModuleId.value,
        true,
        authorizationRevision.value,
        detail.review_contract,
        actionController.signal,
      )
  } else {
    const reviewed = candidate.value
    const revision = candidateRevision.value
    const request = reviewImportSource.value
    if (
      !reviewed ||
      !revision ||
      !request ||
      !reviewContractMatches(reviewed.detail.review_contract, FIVEGPN_REVIEW_CONTRACT)
    ) {
      if (reviewed && !reviewContractMatches(reviewed.detail.review_contract, FIVEGPN_REVIEW_CONTRACT)) {
        candidate.value = null
        candidateRevision.value = ''
        reviewError.value = t('fivegpnReviewContractChanged')
      }
      reviewSubmitting.value = false
      if (reviewActionController === actionController) reviewActionController = undefined
      return
    }
    action = () => installReviewed(reviewed, request, revision, actionController.signal)
  }

  const result = await runReviewAction(action)
  if (reviewActionController === actionController) {
    reviewSubmitting.value = false
    reviewActionController = undefined
  }
  if (result.stale) return
  if (result.error === 'conflict') {
    reviewConflict.value = t('fivegpnReviewConflictPreserved')
    return
  }
  if (result.error) {
    reviewError.value = result.error
    return
  }

  const completedMode = reviewMode.value
  report('')
  reviewResolvedMessage.value = t('fivegpnSaved')
  reviewOpen.value = false
  if (completedMode === 'enable') startInterceptionLifecyclePolling()
  else {
    importUrl.value = ''
    importContent.value = ''
  }
}

let pageMounted = false

const loadPageData = async (session = captureBackendSession()) => {
  await refreshInterception()
  if (pageMounted && backendSessionIsCurrent(session)) startInterceptionLifecyclePolling()
}

onMounted(() => {
  pageMounted = true
  void loadPageData()
})

watch(activeBackendSession, async (session, previous) => {
  if (session?.epoch === previous?.epoch) return
  actionEpoch++
  pageInspectionEpoch++
  busy.value = false
  closeSettings()
  clearReview()
  stopInterceptionLifecyclePolling()
  if (!session) return
  await Promise.resolve()
  await loadPageData(session)
})

onUnmounted(() => {
  pageMounted = false
  clearReview()
  stopInterceptionLifecyclePolling()
})
</script>
