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

        <!-- Use top tabs instead of a stack of cards. Installation from a manifest URL was the last
             card, reachable only after scrolling through the entire marketplace and installed list.
             It is one of this page's primary actions and should not be last. SegmentedControl is
             zashboard's own tab control, including count badges, as used on Tools and Connections. -->
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
                  :disabled="busy || sourceBusy"
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
        <template v-else-if="tab === 'market'">
          <!-- The catalog is only a manifest index. Review still follows review, digest confirmation,
               then installation; the digest comes from refetching the manifest rather than trusting
               the catalog. There is therefore no one-click installation here. -->
          <div class="base-container flex flex-col gap-2 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium">{{ $t('fivegpnCatalog') }}</span>
              <button
                class="btn btn-xs"
                :disabled="catalogStatus === 'loading'"
                @click="refreshCatalog(true)"
              >
                {{ $t('fivegpnCatalogRefresh') }}
              </button>
              <span
                v-if="catalogStatus === 'loading'"
                class="loading loading-spinner loading-xs"
              />
              <span class="text-xs opacity-70">
                {{ catalogSources.length }} / {{ CATALOG_SOURCE_LIMIT }}
              </span>
            </div>

            <!-- Source management. Catalog entries grant no permissions, so adding a source only adds
                 an index. Installation still requires review, digest verification, and confirmation.
                 Validation mirrors the core to explain rejection immediately, not to replace core
                 enforcement: the core still decides whether a submission is accepted. -->
            <div class="border-base-300 flex flex-col gap-2 border-t pt-2">
              <div class="flex flex-wrap items-end gap-2">
                <label class="flex flex-col gap-1">
                  <span class="text-xs opacity-70">{{ $t('fivegpnCatalogSourceId') }}</span>
                  <input
                    v-model="newSourceId"
                    class="input input-sm input-bordered w-48"
                    :placeholder="'io.example.catalog'"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-xs opacity-70">{{ $t('fivegpnCatalogSourceUrl') }}</span>
                  <input
                    v-model="newSourceUrl"
                    class="input input-sm input-bordered w-80"
                    :placeholder="'https://example.com/index.json'"
                  />
                </label>
                <label class="flex flex-col gap-1">
                  <span class="text-xs opacity-70">{{ $t('fivegpnCatalogSourceName') }}</span>
                  <input
                    v-model="newSourceName"
                    class="input input-sm input-bordered w-48"
                  />
                </label>
                <button
                  class="btn btn-sm btn-primary"
                  :disabled="!canAddSource || sourceBusy"
                  @click="addCatalogSource"
                >
                  {{ $t('fivegpnCatalogSourceAdd') }}
                </button>
              </div>
              <div
                v-if="sourceError"
                class="alert alert-error py-2"
              >
                <span>{{ sourceError }}</span>
              </div>
            </div>

            <div
              v-if="catalogError"
              class="alert alert-error py-2"
            >
              <span>{{ catalogError }}</span>
            </div>

            <div
              v-for="source in catalogSources"
              :key="source.id"
              class="flex flex-col gap-2"
            >
              <div class="flex flex-wrap items-center gap-2 text-xs opacity-70">
                <span>{{ source.metadata?.name || source.name || source.id }}</span>
                <span
                  v-if="!source.enabled"
                  class="badge badge-ghost badge-xs"
                  >{{ $t('fivegpnDisabled') }}</span
                >
                <span
                  v-else-if="source.error"
                  class="badge badge-error badge-xs"
                  >{{ source.error }}</span
                >
                <span v-else>{{ (source.entries ?? []).length }}</span>
                <button
                  class="btn btn-ghost btn-xs"
                  :disabled="sourceBusy"
                  @click="toggleCatalogSource(source.id)"
                >
                  {{
                    source.enabled
                      ? $t('fivegpnCatalogSourceDisable')
                      : $t('fivegpnCatalogSourceEnable')
                  }}
                </button>
                <button
                  class="btn btn-ghost btn-xs text-error"
                  :disabled="sourceBusy"
                  @click="removeCatalogSource(source.id)"
                >
                  {{ $t('fivegpnCatalogSourceRemove') }}
                </button>
              </div>

              <div
                v-for="entry in source.entries"
                :key="entry.id"
                class="flex flex-wrap items-center gap-2 pl-2 text-sm"
              >
                <span class="font-medium">{{ entry.name || entry.id }}</span>
                <span class="badge badge-ghost badge-sm">{{ entry.version }}</span>
                <span
                  v-if="catalogInstallState(entry) === 'current'"
                  class="badge badge-success badge-sm"
                  >{{ $t('fivegpnInstalled') }}</span
                >
                <span
                  v-else-if="entry.installed_version && entry.installed_version !== entry.version"
                  class="badge badge-info badge-sm"
                  >{{ $t('fivegpnUpdateFrom', { from: entry.installed_version }) }}</span
                >
                <span
                  v-else-if="entry.installed_version"
                  class="badge badge-info badge-sm"
                  >{{ $t('fivegpnUpdateAvailable') }}</span
                >
                <span
                  v-if="entry.capabilities?.network"
                  class="badge badge-warning badge-sm"
                  >{{ $t('fivegpnNetworkGrant') }}</span
                >
                <span class="flex-1 truncate text-xs opacity-70">{{ entry.description }}</span>
                <button
                  class="btn btn-xs"
                  :disabled="
                    reviewing || busy || sourceBusy || catalogInstallState(entry) === 'current'
                  "
                  @click="reviewEntry(source.id, entry.id, Boolean(entry.installed_version))"
                >
                  {{
                    catalogInstallState(entry) === 'current'
                      ? $t('fivegpnUpToDate')
                      : entry.installed_version
                        ? $t('fivegpnReviewUpdate')
                        : $t('fivegpnReview')
                  }}
                </button>
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
                :disabled="reviewing || busy || sourceBusy || (!importUrl && !importContent)"
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

        <template v-else-if="tab === 'logs'">
          <!-- Follow the DNS query log pattern: one read with manual refresh. Logs are consulted after
               a problem; automatic polling only loads the control plane while nobody is looking. -->
          <div class="base-container flex flex-col gap-2 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <input
                v-model="engineLogFilter"
                class="input input-sm w-56"
                :placeholder="$t('fivegpnLogSearch')"
                @keyup.enter="refreshEngineLogs"
              />
              <select
                v-model="engineLogExtension"
                class="select select-sm w-48"
                @change="refreshEngineLogs"
              >
                <option value="">{{ $t('fivegpnLogAllExtensions') }}</option>
                <option
                  v-for="module in data.modules ?? []"
                  :key="module.id"
                  :value="module.id"
                >
                  {{ module.name || module.id }}
                </option>
              </select>
              <select
                v-model="engineLogLevel"
                class="select select-sm w-28"
                @change="refreshEngineLogs"
              >
                <option value="">{{ $t('fivegpnLogAllLevels') }}</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
              <button
                class="btn btn-sm"
                @click="refreshEngineLogs"
              >
                {{ $t('fivegpnInterceptionRefresh') }}
              </button>
              <span class="text-xs opacity-70">{{ $t('fivegpnLogWindow') }}</span>
            </div>

            <div
              v-if="engineLogError"
              class="alert alert-error py-2"
            >
              <span>{{ engineLogError }}</span>
            </div>

            <div
              v-else-if="engineLogs.length === 0"
              class="text-base-content/50 py-4 text-center text-sm"
            >
              {{ $t('fivegpnLogEmpty') }}
            </div>

            <div
              v-else
              class="overflow-x-auto"
            >
              <table class="table-xs table">
                <thead>
                  <tr>
                    <th>{{ $t('fivegpnLogTime') }}</th>
                    <th>{{ $t('fivegpnLogLevel') }}</th>
                    <th>{{ $t('fivegpnLogExtension') }}</th>
                    <th>{{ $t('fivegpnLogAction') }}</th>
                    <th>{{ $t('fivegpnLogMessage') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(entry, index) in engineLogs"
                    :key="index"
                  >
                    <td class="whitespace-nowrap opacity-70">{{ logTime(entry.time) }}</td>
                    <td>
                      <span
                        class="badge badge-xs"
                        :class="levelClass(entry.level)"
                      >
                        {{ entry.level }}
                      </span>
                    </td>
                    <td class="font-mono text-xs">{{ entry.extension || '—' }}</td>
                    <td class="text-xs opacity-70">
                      {{ entry.action || '—'
                      }}<template v-if="entry.phase"> · {{ entry.phase }}</template>
                    </td>
                    <td class="font-mono text-xs break-all">{{ entry.message }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  FiveGPNCandidate,
  FiveGPNModuleDetail,
  FiveGPNModuleSummary,
  FiveGPNSettingValue,
} from '@/api/fivegpn'
import {
  applyCatalogUpdate,
  cancelInterceptionInspection,
  catalogError,
  catalogRevision,
  catalogSources,
  catalogStatus,
  installReviewed,
  interception,
  interceptionError,
  interceptionStatus,
  engineLogError,
  engineLogExtension,
  engineLogFilter,
  engineLogLevel,
  engineLogs,
  fetchExtensionDetail,
  inspectExtensionDetail,
  refreshCatalog,
  refreshEngineLogs,
  refreshInterception,
  retryInterceptionCertificate,
  reviewCatalogEntry,
  reviewExtension,
  setCatalogSources,
  setExecutionOrder,
  setExtensionCaptureDNS,
  setExtensionEgress,
  setExtensionEnabled,
  setExtensionSettings,
  startInterceptionLifecyclePolling,
  stopInterceptionLifecyclePolling,
  uninstallExtension,
} from '@/assembly/fivegpn/interception'
import { catalogInstallState } from '@/assembly/fivegpn/catalog'
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
  type FiveGPNReviewChange,
} from '@/helper/fivegpnExtensionReview'
import { activeUuid } from '@/store/setup'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { padding } = usePaddingForViews({ offsetTop: 12, offsetBottom: 8 })

// Installed comes first because it describes what this gateway is doing now; Marketplace and Install
// both add things to it.
const tab = ref<'installed' | 'market' | 'install' | 'logs'>('installed')
const tabOptions = computed<SegmentOption[]>(() => [
  {
    value: 'installed',
    label: t('fivegpnInstalledTab'),
    count: (data.value?.modules ?? []).length,
  },
  { value: 'market', label: t('fivegpnCatalog'), count: catalogEntryCount.value },
  { value: 'install', label: t('fivegpnImportTab') },
  { value: 'logs', label: t('fivegpnLogsTab') },
])

// Total installable marketplace entries across all sources. Disabled sources are not fetched and
// therefore are not counted.
const logTime = (iso: string) => new Date(iso).toLocaleTimeString()

const levelClass = (level: string) =>
  level === 'error' ? 'badge-error' : level === 'warn' ? 'badge-warning' : 'badge-ghost'

// Fetch once when switching to the Logs tab. Requiring a second click after showing an empty table
// makes the operator perform work the UI already knows it should do.
watch(tab, (next) => {
  if (next === 'logs') void refreshEngineLogs()
})

const catalogEntryCount = computed(() =>
  catalogSources.value.reduce((n, s) => n + (s.entries ?? []).length, 0),
)

/**
 * Add, remove, enable, and disable catalog sources.
 *
 * The document has always supported 16 sources, the core has always exposed
 * PUT /5gpn/interception/catalog/sources, and the frontend has always listed every source. Only the
 * add entry point was missing, forcing operators to add a second source with curl. This fills that gap.
 *
 * Writes replace the full collection rather than applying deltas. The core contract says "these are
 * all sources" and uses revision for optimistic concurrency, so every operation derives a new list
 * from the current one.
 */
const CATALOG_SOURCE_LIMIT = 16
// Match the core's nativeExtensionIDPattern shape, with the separate validModuleID length limit of 3..40.
const SOURCE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{1,126}[a-z0-9])$/

const newSourceId = ref('')
const newSourceUrl = ref('')
const newSourceName = ref('')
const sourceError = ref('')
const sourceBusy = ref(false)
const validSourceId = (id: string) =>
  id.length >= 3 && id.length <= 40 && SOURCE_ID_PATTERN.test(id)

/** Mirror checkResourceURL's four core rules: HTTPS, a host, no userinfo, and no fragment. */
const validSourceUrl = (raw: string) => {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password && !u.hash
}

const canAddSource = computed(
  () =>
    catalogSources.value.length < CATALOG_SOURCE_LIMIT &&
    validSourceId(newSourceId.value.trim()) &&
    validSourceUrl(newSourceUrl.value.trim()),
)

/** Writable copies of current sources; view types include entries/metadata that writes must omit. */
const currentSources = () =>
  catalogSources.value.map((s) => ({
    id: s.id,
    name: s.name ?? '',
    url: s.url,
    enabled: s.enabled,
  }))

const writeSources = async (sources: ReturnType<typeof currentSources>) => {
  sourceBusy.value = true
  sourceError.value = ''
  // write() RETURNS an error string and never throws -- '' is success. A
  // try/catch here would catch nothing and treat every rejected write as a
  // success, which is the failure mode this page exists to avoid.
  const baselineRevision = catalogRevision.value
  if (!baselineRevision) {
    sourceBusy.value = false
    sourceError.value = t('fivegpnCatalogUnavailable')
    return false
  }
  const err = await setCatalogSources(sources, baselineRevision)
  // Errors also go through the page's own notice, so a catalog write reports
  // where every other write on this page reports.
  report(err)
  if (err) {
    sourceError.value = err === 'conflict' ? t('fivegpnConflict') : err
    if (err === 'conflict') await refreshCatalog()
    sourceBusy.value = false
    return false
  }
  // The source list changed, so the listing did too. The core does not refetch
  // on our behalf.
  await refreshCatalog(true)
  sourceBusy.value = false
  return true
}

const addCatalogSource = async () => {
  const id = newSourceId.value.trim()
  const url = newSourceUrl.value.trim()
  const name = newSourceName.value.trim()
  const sources = currentSources()
  // The core rejects duplicates, but explaining one immediately is clearer than waiting for a 400.
  if (sources.some((s) => s.id === id)) {
    sourceError.value = t('fivegpnCatalogSourceDuplicateId', { id })
    return
  }
  if (sources.some((s) => s.url === url)) {
    sourceError.value = t('fivegpnCatalogSourceDuplicateUrl', { url })
    return
  }
  sources.push({ id, name, url, enabled: true })
  if (await writeSources(sources)) {
    newSourceId.value = ''
    newSourceUrl.value = ''
    newSourceName.value = ''
  }
}

const removeCatalogSource = async (id: string) => {
  await writeSources(currentSources().filter((s) => s.id !== id))
}

const toggleCatalogSource = async (id: string) => {
  await writeSources(currentSources().map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)))
}

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
// Catalog coordinates. A non-null value means confirmation uses applyCatalogUpdate, which changes
// the extension's source.
const catalogTarget = ref<{ source: string; entry: string } | null>(null)
const reviewCatalogSelection = ref<{ source: string; entry: string } | null>(null)
const reviewOpen = ref(false)
const reviewHistoryRestorable = ref(true)
const reviewMode = ref<'install' | 'update' | 'enable'>('install')
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
const updatePreviousDetail = ref<FiveGPNModuleDetail | null>(null)

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
  const uuid = activeUuid.value
  busy.value = true
  const error = await action()
  if (epoch !== actionEpoch || uuid !== activeUuid.value) return { error: '', stale: true }
  report(error)
  busy.value = false
  return { error, stale: false }
}

const runReviewAction = async (action: () => Promise<string>) => {
  const epoch = ++reviewActionEpoch
  const uuid = activeUuid.value
  busy.value = true
  const error = await action()
  if (epoch !== reviewActionEpoch || uuid !== activeUuid.value) return { error: '', stale: true }
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
  run(() => setExtensionCaptureDNS(module.id, (event.target as HTMLSelectElement).value))

const moveModule = (index: number, delta: number) => {
  const order = orderedModules.value.map((m) => m.id)
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
  return run(() => setExecutionOrder(order))
}

const remove = (module: FiveGPNModuleSummary) => {
  if (!window.confirm(t('fivegpnUninstallConfirm', { name: module.name || module.id }))) return
  return run(() => uninstallExtension(module.id))
}

const source = () =>
  importUrl.value.trim() ? { url: importUrl.value.trim() } : { content: importContent.value }

const reviewDifferenceKey = (change: FiveGPNReviewChange) => JSON.stringify(change)
const candidateChanges = computed(() =>
  extensionReviewChanges(
    updatePreviousDetail.value,
    candidate.value?.detail ?? null,
    candidate.value?.digest,
  ),
)
const reviewDetail = computed(() =>
  reviewMode.value === 'enable' ? authorizationDetail.value : (candidate.value?.detail ?? null),
)
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
const updateModule = computed(() =>
  (data.value?.modules ?? []).find((module) => module.id === candidate.value?.detail.id),
)
const reviewActionLabel = computed(() => {
  if (reviewMode.value === 'enable') return t('fivegpnAuthorizeAndEnable')
  if (reviewMode.value === 'update') {
    return updateModule.value?.enabled ? t('fivegpnUpdateAndKeepEnabled') : t('fivegpnApplyUpdate')
  }
  return t('fivegpnInstall')
})

const resetReviewData = () => {
  candidate.value = null
  candidateRevision.value = ''
  catalogTarget.value = null
  reviewCatalogSelection.value = null
  reviewImportSource.value = null
  updatePreviousDetail.value = null
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

const beginReview = (mode: 'install' | 'update' | 'enable') => {
  pageInspectionEpoch++
  cancelInterceptionInspection()
  reviewActionController?.abort()
  resetReviewData()
  reviewHistoryRestorable.value = true
  reviewMode.value = mode
  reviewOpen.value = true
  reviewLoading.value = true
  return { epoch: pageInspectionEpoch, uuid: activeUuid.value }
}

const inspectionIsStale = (context: { epoch: number; uuid: string }) =>
  context.epoch !== pageInspectionEpoch || context.uuid !== activeUuid.value || !reviewOpen.value

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
  const context = { epoch: ++pageInspectionEpoch, uuid: activeUuid.value }
  reviewLoading.value = true
  reviewError.value = ''
  const result = await reviewExtension(request)
  if (inspectionIsStale(context)) return
  reviewLoading.value = false
  if (result.error || !result.candidate || !result.revision) {
    reviewError.value = result.error === 'conflict' ? t('fivegpnConflict') : result.error
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
  if (busy.value || sourceBusy.value) return
  const request = source()
  beginReview('install')
  reviewImportSource.value = request
  await loadInstallReview()
}

const loadCatalogReview = async (reloading = false) => {
  const selection = reviewCatalogSelection.value
  if (!selection) return
  const previousDraft = { ...reviewDraft.value }
  const context = { epoch: ++pageInspectionEpoch, uuid: activeUuid.value }
  reviewLoading.value = true
  reviewError.value = ''
  const result = await reviewCatalogEntry(selection.source, selection.entry)
  if (inspectionIsStale(context)) return
  if (result.error || !result.candidate || !result.revision) {
    reviewLoading.value = false
    reviewError.value = result.error === 'conflict' ? t('fivegpnConflict') : result.error
    return
  }

  let previousDetail: FiveGPNModuleDetail | null = null
  if (result.candidate.installed) {
    if (!result.installedDetail) {
      reviewLoading.value = false
      reviewError.value = t('fivegpnConflict')
      return
    }
    previousDetail = result.installedDetail
  }

  candidate.value = result.candidate
  candidateRevision.value = result.revision
  updatePreviousDetail.value = previousDetail
  reviewMode.value = previousDetail ? 'update' : 'install'
  catalogTarget.value = previousDetail ? selection : null
  if (result.url) reviewImportSource.value = { url: result.url }
  reviewDraft.value = mergeReviewDraft(result.candidate.detail.settings ?? [], previousDraft)
  setDifferenceState(
    extensionReviewChanges(previousDetail, result.candidate.detail, result.candidate.digest),
    reloading,
    result.candidate.digest,
  )
  if (result.candidate.installed === result.candidate.digest) {
    reviewConflict.value = ''
    reviewResolvedMessage.value = t('fivegpnReviewAlreadyCurrent')
    reviewLoading.value = false
    await refreshCatalog()
    return
  }
  if (reloading) reviewConflict.value = ''
  reviewLoading.value = false
}

const reviewEntry = async (sourceId: string, entryId: string, isUpdate = false) => {
  if (busy.value || sourceBusy.value) return
  beginReview(isUpdate ? 'update' : 'install')
  reviewCatalogSelection.value = { source: sourceId, entry: entryId }
  await loadCatalogReview()
}

const loadEnableReview = async (reloading = false) => {
  if (!authorizationModuleId.value) return
  const context = { epoch: ++pageInspectionEpoch, uuid: activeUuid.value }
  reviewLoading.value = true
  reviewError.value = ''
  const result = await inspectExtensionDetail(authorizationModuleId.value)
  if (inspectionIsStale(context)) return
  reviewLoading.value = false
  if (!result.detail || !result.revision) {
    reviewError.value = result.error === 'conflict' ? t('fivegpnConflict') : result.error
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
  } else if (reviewCatalogSelection.value) {
    await loadCatalogReview(reloading)
  } else {
    await loadInstallReview(reloading)
  }
}

const reloadReview = () => retryReview(true)

const confirmReview = async (values: Record<string, FiveGPNSettingValue> = reviewDraft.value) => {
  if (
    busy.value ||
    sourceBusy.value ||
    reviewConflict.value ||
    reviewLoading.value ||
    reviewSubmitting.value
  )
    return
  reviewError.value = ''
  reviewActionController?.abort()
  const actionController = new AbortController()
  reviewActionController = actionController
  reviewSubmitting.value = true

  let action: (() => Promise<string>) | undefined
  if (reviewMode.value === 'enable') {
    if (
      !authorizationModuleId.value ||
      !authorizationRevision.value ||
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
        actionController.signal,
      )
  } else {
    const reviewed = candidate.value
    const revision = candidateRevision.value
    const request = reviewImportSource.value
    if (!reviewed || !revision || !request) {
      reviewSubmitting.value = false
      if (reviewActionController === actionController) reviewActionController = undefined
      return
    }
    const fromCatalog = catalogTarget.value
    action = () =>
      fromCatalog
        ? applyCatalogUpdate(
            fromCatalog.source,
            fromCatalog.entry,
            reviewed,
            revision,
            values,
            actionController.signal,
          )
        : installReviewed(reviewed, request, revision, actionController.signal)
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
    await refreshCatalog()
  }
}

let pageMounted = false

const loadPageData = async (uuid = activeUuid.value) => {
  const catalogLoad = refreshCatalog()
  await refreshInterception()
  if (pageMounted && uuid === activeUuid.value) startInterceptionLifecyclePolling()
  await catalogLoad
}

onMounted(() => {
  pageMounted = true
  void loadPageData()
})

watch(activeUuid, async (uuid, previous) => {
  if (uuid === previous) return
  actionEpoch++
  pageInspectionEpoch++
  busy.value = false
  closeSettings()
  clearReview()
  stopInterceptionLifecyclePolling()
  if (!uuid) return
  await Promise.resolve()
  await loadPageData(uuid)
})

onUnmounted(() => {
  pageMounted = false
  clearReview()
  stopInterceptionLifecyclePolling()
})
</script>
