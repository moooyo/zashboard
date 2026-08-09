<template>
  <div
    class="relative size-full overflow-x-hidden"
    :style="padding"
  >
    <div class="flex flex-col gap-3 p-3">
      <div
        v-if="notice"
        class="alert"
        :class="noticeIsError ? 'alert-error' : 'alert-success'"
      >
        {{ notice }}
      </div>

      <section class="base-container flex flex-col gap-3 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <div>
            <h1 class="text-lg font-semibold">{{ $t('fivegpnMarketplace') }}</h1>
            <p class="text-caption opacity-70">{{ $t('fivegpnMarketplaceHint') }}</p>
          </div>
          <button
            class="btn btn-sm ml-auto"
            :disabled="catalogStatus === 'loading'"
            @click="refreshCatalog(true)"
          >
            {{ $t('fivegpnCatalogRefresh') }}
          </button>
          <span
            v-if="catalogStatus === 'loading'"
            class="loading loading-spinner loading-sm"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            class="btn btn-xs"
            :class="!sourceFilter ? 'btn-neutral' : 'btn-ghost'"
            @click="sourceFilter = ''"
          >
            {{ $t('fivegpnMarketplaceAllSources') }}
          </button>
          <button
            v-for="source in catalogSources"
            :key="source.id"
            class="btn btn-xs"
            :class="sourceFilter === source.id ? 'btn-neutral' : 'btn-ghost'"
            @click="sourceFilter = source.id"
          >
            {{ source.name || source.id }}
            <span
              v-if="source.name"
              class="opacity-60"
              >· {{ source.id }}</span
            >
          </button>
        </div>

        <div class="flex flex-col gap-2 md:flex-row">
          <input
            v-model="marketplaceSearchInput"
            class="input input-sm min-w-0 flex-1"
            :placeholder="$t('fivegpnMarketplaceSearch')"
          />
          <select
            v-model="marketplaceSort"
            class="select select-sm w-full md:w-48"
            :aria-label="$t('fivegpnMarketplaceSort')"
          >
            <option value="catalog">{{ $t('fivegpnMarketplaceSortCatalog') }}</option>
            <option value="name">{{ $t('fivegpnMarketplaceSortName') }}</option>
            <option value="id">{{ $t('fivegpnMarketplaceSortId') }}</option>
            <option value="version">{{ $t('fivegpnMarketplaceSortVersion') }}</option>
          </select>
        </div>

        <div class="border-base-300 flex flex-col gap-2 border-t pt-3">
          <div class="flex flex-wrap items-end gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-caption opacity-70">{{ $t('fivegpnCatalogSourceId') }}</span>
              <input
                v-model="newSourceId"
                class="input input-sm input-bordered w-48"
                placeholder="io.example.catalog"
              />
            </label>
            <label class="flex min-w-64 flex-1 flex-col gap-1">
              <span class="text-caption opacity-70">{{ $t('fivegpnCatalogSourceUrl') }}</span>
              <input
                v-model="newSourceUrl"
                class="input input-sm input-bordered w-full"
                placeholder="https://example.com/index.json"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-caption opacity-70">{{ $t('fivegpnCatalogSourceName') }}</span>
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
            {{ sourceError }}
          </div>
        </div>
      </section>

      <div
        v-if="catalogError"
        class="alert alert-error"
      >
        {{ catalogError }}
      </div>

      <section
        v-for="source in filteredSources"
        :key="source.id"
        class="base-container flex flex-col gap-3 p-3"
      >
        <div class="flex flex-wrap items-center gap-2">
          <div>
            <h2 class="font-medium">{{ source.name || source.id }}</h2>
            <p
              v-if="source.name"
              class="text-caption opacity-60"
            >
              {{ source.id }}
            </p>
            <p
              v-if="source.metadata?.name && source.metadata.name !== source.name"
              class="text-caption opacity-60"
            >
              {{ $t('fivegpnCatalogReportedName') }}: {{ source.metadata.name }}
            </p>
          </div>
          <span
            v-if="!source.enabled"
            class="badge badge-ghost"
            >{{ $t('fivegpnDisabled') }}</span
          >
          <span
            v-else-if="source.error"
            class="badge badge-error"
            >{{ source.error }}</span
          >
          <span
            v-else
            class="badge badge-ghost"
            >{{ (source.entries ?? []).length }}</span
          >
          <div class="ml-auto flex gap-2">
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
        </div>

        <article
          v-for="entry in source.entries"
          :key="entry.id"
          class="border-base-300 flex flex-col gap-2 border-t pt-3 md:flex-row md:items-center"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ entry.name || entry.id }}</span>
              <span class="badge badge-ghost badge-sm">{{ entry.version }}</span>
              <span
                v-if="catalogInstallState(entry) === 'current'"
                class="badge badge-success badge-sm"
                >{{ $t('fivegpnInstalled') }}</span
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
            </div>
            <p class="mt-1 text-sm opacity-70">{{ entry.description }}</p>
          </div>
          <button
            class="btn btn-sm"
            :disabled="reviewing || sourceBusy || catalogInstallState(entry) === 'current'"
            @click="openReview(source.id, entry.id, Boolean(entry.installed_version))"
          >
            {{
              catalogInstallState(entry) === 'current'
                ? $t('fivegpnUpToDate')
                : entry.installed_version
                  ? $t('fivegpnReviewUpdate')
                  : $t('fivegpnReview')
            }}
          </button>
        </article>
      </section>

      <p
        v-if="catalogStatus === 'ready' && filteredEntryCount === 0"
        class="base-container p-4 text-center text-sm opacity-60"
      >
        {{ $t('fivegpnMarketplaceNoResults') }}
      </p>
    </div>

    <FiveGPNExtensionReviewDialog
      v-model="reviewOpen"
      v-model:draft="reviewDraft"
      :mode="reviewMode"
      :detail="candidate?.detail ?? null"
      :digest="candidate?.digest ?? ''"
      digest-kind="snapshot"
      :installed-version="candidate?.installedVersion"
      :reviewed-source="reviewedURL"
      :execution-position="reviewExecutionPosition"
      :history-restorable="reviewHistoryRestorable"
      :changes="candidateChanges"
      :new-difference-keys="reviewNewDifferenceKeys"
      :loading="reviewLoading"
      :submitting="reviewSubmitting"
      :conflict-message="reviewConflict"
      :error-message="reviewError"
      :resolved-message="reviewResolvedMessage"
      :action-label="reviewActionLabel"
      @cancel="closeReview"
      @reload="reloadReview"
      @retry="retryReview"
      @confirm="confirmReview"
    />
  </div>
</template>

<script setup lang="ts">
import type {
  FiveGPNCandidate,
  FiveGPNModuleDetail,
  FiveGPNSettingValue,
} from '@/api/fivegpn'
import { catalogInstallState } from '@/assembly/fivegpn/catalog'
import {
  applyCatalogUpdate,
  cancelInterceptionInspection,
  catalogError,
  catalogRevision,
  catalogSources,
  catalogStatus,
  installReviewed,
  interception,
  refreshCatalog,
  refreshInterception,
  reviewCatalogEntry,
  setCatalogSources,
} from '@/assembly/fivegpn/interception'
import FiveGPNExtensionReviewDialog from '@/components/fivegpn/FiveGPNExtensionReviewDialog.vue'
import { usePaddingForViews } from '@/composables/paddingViews'
import {
  extensionReviewChanges,
  mergeReviewDraft,
  type FiveGPNReviewChange,
} from '@/helper/fivegpnExtensionReview'
import { projectMarketplace, type MarketplaceSort } from '@/helper/marketplaceView'
import {
  activeBackendSession,
  backendSessionIsCurrent,
  captureBackendSession,
} from '@/store/setup'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { debounce } from 'lodash'

const { t } = useI18n()
const { padding } = usePaddingForViews({ offsetTop: 12, offsetBottom: 8 })
const CATALOG_SOURCE_LIMIT = 16
const SOURCE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{1,126}[a-z0-9])$/

const notice = ref('')
const noticeIsError = ref(false)
const newSourceId = ref('')
const newSourceUrl = ref('')
const newSourceName = ref('')
const sourceError = ref('')
const sourceBusy = ref(false)
let sourceActionEpoch = 0
const sourceFilter = ref('')
const marketplaceSearchInput = ref('')
const marketplaceSearch = ref('')
const marketplaceSort = ref<MarketplaceSort>('catalog')
const commitMarketplaceSearch = debounce((value: string) => {
  marketplaceSearch.value = value
}, 200)

watch(marketplaceSearchInput, (value) => commitMarketplaceSearch(value))
watch(catalogSources, (sources) => {
  if (sourceFilter.value && !sources.some((source) => source.id === sourceFilter.value)) {
    sourceFilter.value = ''
  }
})

const filteredSources = computed(() =>
  projectMarketplace(catalogSources.value, {
    sourceID: sourceFilter.value,
    query: marketplaceSearch.value,
    sort: marketplaceSort.value,
  }),
)
const filteredEntryCount = computed(() =>
  filteredSources.value.reduce((count, source) => count + source.entries.length, 0),
)

const validSourceId = (id: string) =>
  id.length >= 3 && id.length <= 40 && SOURCE_ID_PATTERN.test(id)
const validSourceUrl = (raw: string) => {
  try {
    const url = new URL(raw)
    return (
      url.protocol === 'https:' &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash
    )
  } catch {
    return false
  }
}
const canAddSource = computed(
  () =>
    catalogSources.value.length < CATALOG_SOURCE_LIMIT &&
    validSourceId(newSourceId.value.trim()) &&
    validSourceUrl(newSourceUrl.value.trim()),
)
const currentSources = () =>
  catalogSources.value.map((source) => ({
    id: source.id,
    name: source.name ?? '',
    url: source.url,
    enabled: source.enabled,
  }))
const report = (error: string) => {
  noticeIsError.value = Boolean(error)
  notice.value = error === 'conflict' ? t('fivegpnConflict') : error || t('fivegpnSaved')
}
const writeSources = async (sources: ReturnType<typeof currentSources>) => {
  const action = ++sourceActionEpoch
  const session = captureBackendSession()
  if (!session) {
    sourceError.value = 'no backend'
    return false
  }
  const stale = () => action !== sourceActionEpoch || !backendSessionIsCurrent(session)
  const revision = catalogRevision.value
  if (!revision) {
    sourceError.value = t('fivegpnCatalogUnavailable')
    return false
  }
  sourceBusy.value = true
  sourceError.value = ''
  const error = await setCatalogSources(sources, revision)
  if (stale()) return false
  report(error)
  if (error) {
    sourceError.value = error === 'conflict' ? t('fivegpnConflict') : error
    if (error === 'conflict') {
      await refreshCatalog()
      if (stale()) return false
    }
    sourceBusy.value = false
    return false
  }
  await refreshCatalog(true)
  if (stale()) return false
  sourceBusy.value = false
  return true
}
const addCatalogSource = async () => {
  const id = newSourceId.value.trim()
  const url = newSourceUrl.value.trim()
  const name = newSourceName.value.trim()
  const sources = currentSources()
  if (sources.some((source) => source.id === id)) {
    sourceError.value = t('fivegpnCatalogSourceDuplicateId', { id })
    return
  }
  if (sources.some((source) => source.url === url)) {
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
const removeCatalogSource = (id: string) =>
  writeSources(currentSources().filter((source) => source.id !== id))
const toggleCatalogSource = (id: string) =>
  writeSources(
    currentSources().map((source) =>
      source.id === id ? { ...source, enabled: !source.enabled } : source,
    ),
  )

const candidate = ref<FiveGPNCandidate | null>(null)
const previousDetail = ref<FiveGPNModuleDetail | null>(null)
const candidateRevision = ref('')
const reviewedURL = ref('')
const selection = ref<{ source: string; entry: string } | null>(null)
const reviewOpen = ref(false)
const reviewHistoryRestorable = ref(true)
const reviewMode = ref<'install' | 'update'>('install')
const reviewLoading = ref(false)
const reviewSubmitting = ref(false)
const reviewing = computed(() => reviewLoading.value || reviewSubmitting.value)
const reviewDraft = ref<Record<string, FiveGPNSettingValue>>({})
const reviewError = ref('')
const reviewConflict = ref('')
const reviewResolvedMessage = ref('')
const reviewNewDifferenceKeys = ref<string[]>([])
const reviewBaselineDifferenceKeys = ref<string[]>([])
let inspectionEpoch = 0
let actionController: AbortController | undefined

const candidateChanges = computed(() =>
  extensionReviewChanges(previousDetail.value, candidate.value?.detail ?? null, candidate.value?.digest),
)
const reviewExecutionPosition = computed(() => {
  const id = candidate.value?.detail.id
  const order = interception.value?.execution_order ?? []
  if (!id) return '—'
  const index = order.indexOf(id)
  return `${index >= 0 ? index + 1 : order.length + 1} / ${index >= 0 ? order.length : order.length + 1}`
})
const reviewActionLabel = computed(() =>
  reviewMode.value === 'update'
    ? previousDetail.value?.enabled
      ? t('fivegpnUpdateAndKeepEnabled')
      : t('fivegpnApplyUpdate')
    : t('fivegpnInstall'),
)
const differenceKey = (change: FiveGPNReviewChange) => JSON.stringify(change)
const digestKey = (digest: string) => `digest:${digest}`
const setDifferenceState = (reloading: boolean) => {
  const changes = candidateChanges.value
  const keys = [
    ...changes.map(differenceKey),
    ...(candidate.value?.digest ? [digestKey(candidate.value.digest)] : []),
  ]
  reviewNewDifferenceKeys.value = reloading
    ? keys.filter((key) => !reviewBaselineDifferenceKeys.value.includes(key))
    : []
  reviewBaselineDifferenceKeys.value = keys
}
const resetReview = () => {
  candidate.value = null
  previousDetail.value = null
  candidateRevision.value = ''
  reviewedURL.value = ''
  selection.value = null
  reviewDraft.value = {}
  reviewError.value = ''
  reviewConflict.value = ''
  reviewResolvedMessage.value = ''
  reviewNewDifferenceKeys.value = []
  reviewBaselineDifferenceKeys.value = []
  reviewLoading.value = false
  reviewSubmitting.value = false
}
const closeReview = () => {
  inspectionEpoch += 1
  cancelInterceptionInspection()
  actionController?.abort()
  actionController = undefined
  reviewOpen.value = false
  reviewLoading.value = false
  reviewSubmitting.value = false
}
const clearReview = () => {
  reviewHistoryRestorable.value = false
  closeReview()
  resetReview()
}
const loadReview = async (reloading = false) => {
  const target = selection.value
  if (!target) return
  const epoch = ++inspectionEpoch
  const session = captureBackendSession()
  const oldDraft = { ...reviewDraft.value }
  reviewLoading.value = true
  reviewError.value = ''
  const result = await reviewCatalogEntry(target.source, target.entry)
  if (epoch !== inspectionEpoch || !backendSessionIsCurrent(session) || !reviewOpen.value) return
  reviewLoading.value = false
  if (result.error || !result.candidate || !result.revision || !result.url) {
    reviewError.value = result.error === 'conflict' ? t('fivegpnConflict') : result.error
    return
  }
  candidate.value = result.candidate
  previousDetail.value = result.installedDetail ?? null
  candidateRevision.value = result.revision
  reviewedURL.value = result.url
  reviewMode.value = result.installedDetail ? 'update' : 'install'
  reviewDraft.value = mergeReviewDraft(result.candidate.detail.settings ?? [], oldDraft)
  setDifferenceState(reloading)
  if (result.candidate.installed === result.candidate.digest) {
    reviewResolvedMessage.value = t('fivegpnReviewAlreadyCurrent')
    await refreshCatalog()
  } else if (reloading) {
    reviewConflict.value = ''
  }
}
const openReview = async (source: string, entry: string, updating: boolean) => {
  resetReview()
  reviewMode.value = updating ? 'update' : 'install'
  reviewHistoryRestorable.value = true
  reviewOpen.value = true
  selection.value = { source, entry }
  await loadReview()
}
const retryReview = () => loadReview(false)
const reloadReview = () => loadReview(true)
const confirmReview = async (values: Record<string, FiveGPNSettingValue>) => {
  const target = selection.value
  const reviewed = candidate.value
  const revision = candidateRevision.value
  if (!target || !reviewed || !revision || !reviewedURL.value || reviewSubmitting.value) return
  actionController?.abort()
  const controller = new AbortController()
  actionController = controller
  reviewSubmitting.value = true
  const error = previousDetail.value
    ? await applyCatalogUpdate(
        target.source,
        target.entry,
        reviewed,
        reviewedURL.value,
        revision,
        values,
        controller.signal,
      )
    : await installReviewed(reviewed, { url: reviewedURL.value }, revision, controller.signal)
  if (actionController !== controller) return
  actionController = undefined
  reviewSubmitting.value = false
  if (error === 'conflict') {
    reviewConflict.value = t('fivegpnReviewConflictPreserved')
    return
  }
  if (error) {
    reviewError.value = error
    return
  }
  report('')
  reviewResolvedMessage.value = t('fivegpnSaved')
  reviewOpen.value = false
  await refreshCatalog()
}

const loadPage = async () => {
  await refreshInterception()
  await refreshCatalog()
}
onMounted(() => void loadPage())
watch(activeBackendSession, (session, previous) => {
  if (session?.epoch === previous?.epoch) return
  sourceActionEpoch += 1
  sourceBusy.value = false
  sourceError.value = ''
  notice.value = ''
  newSourceId.value = ''
  newSourceUrl.value = ''
  newSourceName.value = ''
  commitMarketplaceSearch.cancel()
  sourceFilter.value = ''
  marketplaceSearchInput.value = ''
  marketplaceSearch.value = ''
  marketplaceSort.value = 'catalog'
  clearReview()
  if (session) {
    void Promise.resolve().then(() => {
      if (backendSessionIsCurrent(session)) return loadPage()
    })
  }
})
onUnmounted(() => {
  sourceActionEpoch += 1
  sourceBusy.value = false
  commitMarketplaceSearch.cancel()
  clearReview()
})
</script>
