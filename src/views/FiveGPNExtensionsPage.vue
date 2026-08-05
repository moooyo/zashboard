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

        <!-- A SAN set that differs from the capture set required by enabled extensions is the only
             failure that appears as a client trust error with no gateway log entry. Make it more
             prominent than every other row. -->
        <div
          v-if="certificateGap"
          class="alert alert-error"
        >
          <span>{{
            $t('fivegpnCertificateGap', {
              hosts: (data.certificate.missing_hosts ?? []).join(', '),
            })
          }}</span>
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

        <!-- Review every effect the operator must see before enabling in one place rather than
             distributing it across several confirmations. -->
        <div
          v-if="candidate"
          class="base-container border-warning flex flex-col gap-2 border p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-base font-medium">
              {{ candidate.detail.name || candidate.detail.id }}
            </span>
            <span class="badge badge-sm">{{ candidate.detail.version }}</span>
            <span
              v-if="candidate.installedVersion"
              class="badge badge-info badge-sm"
            >
              {{ $t('fivegpnUpdateFrom', { from: candidate.installedVersion }) }}
            </span>
          </div>
          <p
            v-if="candidate.detail.description"
            class="text-sm opacity-80"
          >
            {{ candidate.detail.description }}
          </p>

          <div class="settings-grid">
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('fivegpnCaptureHosts') }}</span>
              <span class="font-mono text-xs">{{ candidate.detail.capture_hosts.join(', ') }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('fivegpnActions') }}</span>
              <span>{{ (candidate.detail.actions ?? []).length }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('fivegpnStorage') }}</span>
              <span>{{
                $t(candidate.detail.persistent_storage ? 'fivegpnEnabled' : 'fivegpnDisabled')
              }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('fivegpnRoutingRules') }}</span>
              <span>{{ (candidate.detail.routing_rules ?? []).length }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('fivegpnDigest') }}</span>
              <span class="font-mono text-xs">{{ candidate.digest.slice(0, 16) }}</span>
            </div>
          </div>

          <!-- This grant has no destination list. Presenting "reviewed targets" would describe a
               boundary that does not exist, so every UI must say "any host it can reach." -->
          <div
            v-if="candidate.detail.network"
            class="alert alert-warning py-2"
          >
            <span>{{ $t('fivegpnNetworkGrantWarning') }}</span>
          </div>

          <div class="flex gap-2">
            <button
              class="btn btn-primary btn-sm"
              :disabled="busy"
              @click="install"
            >
              {{
                $t(candidate.installed || catalogTarget ? 'fivegpnApplyUpdate' : 'fivegpnInstall')
              }}
            </button>
            <button
              class="btn btn-sm"
              @click="clearReview"
            >
              {{ $t('fivegpnCancel') }}
            </button>
          </div>
          <p class="text-xs opacity-70">{{ $t('fivegpnInstallLandsDisabled') }}</p>
        </div>

        <div
          v-if="reviewError"
          class="alert alert-error"
        >
          <span>{{ reviewError }}</span>
        </div>

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
                  @change="toggleModule(module)"
                />
                <span class="font-medium">{{ module.name || module.id }}</span>
                <span class="badge badge-ghost badge-sm">{{ module.version }}</span>
                <span
                  v-if="module.egress_group_required && !module.egress_group"
                  class="badge badge-error badge-sm"
                >
                  {{ $t('fivegpnUnboundEgress') }}
                </span>
                <div class="ml-auto flex gap-1">
                  <button
                    class="btn btn-ghost btn-xs"
                    :disabled="index === 0 || busy"
                    @click="moveModule(index, -1)"
                  >
                    ↑
                  </button>
                  <button
                    class="btn btn-ghost btn-xs"
                    :disabled="index === orderedModules.length - 1 || busy"
                    @click="moveModule(index, 1)"
                  >
                    ↓
                  </button>
                  <button
                    class="btn btn-ghost btn-xs"
                    :disabled="busy"
                    @click="checkUpdate(module.id)"
                  >
                    {{ $t('fivegpnCheckUpdate') }}
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
                    :value="module.egress_group ?? ''"
                    :disabled="busy"
                    @change="setEgress(module, $event)"
                  >
                    <option value="">{{ $t('fivegpnNoBinding') }}</option>
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
                <span class="font-mono opacity-60">{{ module.capture_hosts.join(', ') }}</span>
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
                  v-if="entry.installed_version === entry.version"
                  class="badge badge-success badge-sm"
                  >{{ $t('fivegpnInstalled') }}</span
                >
                <span
                  v-else-if="entry.installed_version"
                  class="badge badge-info badge-sm"
                  >{{ $t('fivegpnUpdateFrom', { from: entry.installed_version }) }}</span
                >
                <span
                  v-if="entry.capabilities?.network"
                  class="badge badge-warning badge-sm"
                  >{{ $t('fivegpnNetworkGrant') }}</span
                >
                <span class="flex-1 truncate text-xs opacity-70">{{ entry.description }}</span>
                <button
                  class="btn btn-xs"
                  :disabled="reviewing || busy"
                  @click="reviewEntry(source.id, entry.id)"
                >
                  {{ entry.installed_version ? $t('fivegpnReviewUpdate') : $t('fivegpnReview') }}
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
                :disabled="reviewing || (!importUrl && !importContent)"
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
import type { FiveGPNCandidate, FiveGPNModuleSummary } from '@/api/fivegpn'
import {
  applyCatalogUpdate,
  applyReviewedUpdate,
  catalogError,
  catalogSources,
  catalogStatus,
  checkExtensionUpdate,
  installReviewed,
  interception,
  interceptionError,
  interceptionStatus,
  engineLogError,
  engineLogExtension,
  engineLogFilter,
  engineLogLevel,
  engineLogs,
  refreshCatalog,
  refreshEngineLogs,
  refreshInterception,
  reviewCatalogEntry,
  reviewExtension,
  setCatalogSources,
  setExecutionOrder,
  setExtensionCaptureDNS,
  setExtensionEgress,
  setExtensionEnabled,
  uninstallExtension,
} from '@/assembly/fivegpn/interception'
import SegmentedControl, { type SegmentOption } from '@/components/common/SegmentedControl.vue'
import { usePaddingForViews } from '@/composables/paddingViews'
import { computed, ref, watch } from 'vue'
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
  const err = await setCatalogSources(sources)
  sourceBusy.value = false
  // Errors also go through the page's own notice, so a catalog write reports
  // where every other write on this page reports.
  report(err)
  if (err) {
    sourceError.value = err === 'conflict' ? t('fivegpnConflict') : err
    return false
  }
  // The source list changed, so the listing did too. The core does not refetch
  // on our behalf.
  await refreshCatalog(true)
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
const busy = ref(false)
const notice = ref('')
const noticeIsError = ref(false)

const importUrl = ref('')
const importContent = ref('')
const candidate = ref<FiveGPNCandidate | null>(null)
const updateTarget = ref('')
// Catalog coordinates. A non-null value means confirmation uses applyCatalogUpdate, which changes
// the extension's source.
const catalogTarget = ref<{ source: string; entry: string } | null>(null)
const reviewing = ref(false)
const reviewError = ref('')

const enabledCount = computed(() => (data.value?.modules ?? []).filter((m) => m.enabled).length)

const certificateGap = computed(
  () => data.value?.certificate.loaded === true && !data.value.certificate.covers_all_capture_hosts,
)

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
  busy.value = true
  report(await action())
  busy.value = false
}

const toggleModule = (module: FiveGPNModuleSummary) =>
  run(() => setExtensionEnabled(module.id, !module.enabled))

const setEgress = (module: FiveGPNModuleSummary, event: Event) =>
  run(() => setExtensionEgress(module.id, (event.target as HTMLSelectElement).value))

const setCaptureDNS = (module: FiveGPNModuleSummary, event: Event) =>
  run(() => setExtensionCaptureDNS(module.id, (event.target as HTMLSelectElement).value))

const moveModule = (index: number, delta: number) => {
  const order = orderedModules.value.map((m) => m.id)
  const target = index + delta
  if (target < 0 || target >= order.length) return
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

const review = async () => {
  reviewing.value = true
  reviewError.value = ''
  updateTarget.value = ''
  const result = await reviewExtension(source())
  candidate.value = result.candidate ?? null
  reviewError.value = result.error
  reviewing.value = false
}

const checkUpdate = async (id: string) => {
  reviewing.value = true
  reviewError.value = ''
  const result = await checkExtensionUpdate(id)
  candidate.value = result.candidate ?? null
  updateTarget.value = result.candidate ? id : ''
  reviewError.value = result.error
  reviewing.value = false
}

/**
 * Review catalog entries in the same candidate dialog.
 *
 * The server returns the manifest URL, which is placed into the import field so installation uses
 * the same source that review read and the operator can see it before confirmation. Reconstructing
 * a URL from the list could make the reviewed and installed resources differ in principle.
 *
 * If this ID is already installed, retain the entry coordinates. Confirmation then uses
 * applyCatalogUpdate to change the extension source to this entry's URL. That is what selecting the
 * row means, but because it changes a source, the confirmation button says Update rather than Install.
 */
const reviewEntry = async (sourceId: string, entryId: string) => {
  reviewing.value = true
  reviewError.value = ''
  updateTarget.value = ''
  catalogTarget.value = null
  const result = await reviewCatalogEntry(sourceId, entryId)
  candidate.value = result.candidate ?? null
  reviewError.value = result.error
  if (result.url) {
    importUrl.value = result.url
    importContent.value = ''
  }
  if (result.candidate?.installed) {
    catalogTarget.value = { source: sourceId, entry: entryId }
  }
  reviewing.value = false
}

// Cancel must also clear catalog coordinates, or the next Install would reuse the previous entry and
// follow the update path.
const clearReview = () => {
  candidate.value = null
  updateTarget.value = ''
  catalogTarget.value = null
}

const install = async () => {
  const reviewed = candidate.value
  if (!reviewed) return
  const target = updateTarget.value
  const fromCatalog = catalogTarget.value
  await run(() => {
    if (fromCatalog) return applyCatalogUpdate(fromCatalog.source, fromCatalog.entry, reviewed)
    if (target) return applyReviewedUpdate(target, reviewed)
    return installReviewed(reviewed, source())
  })
  candidate.value = null
  updateTarget.value = ''
  catalogTarget.value = null
  importUrl.value = ''
  importContent.value = ''
  refreshCatalog()
}

refreshInterception()
refreshCatalog()
</script>
