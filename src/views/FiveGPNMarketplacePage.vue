<template>
  <div
    class="relative size-full overflow-x-hidden"
    :style="padding"
  >
    <div class="flex flex-col gap-3 p-3">
      <div
        v-if="notice"
        class="alert alert-success"
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
      </section>

      <div
        v-if="catalogError"
        class="alert alert-error"
      >
        {{ catalogError }}
      </div>

      <!-- One index, compiled into the core. Its own metadata and fetched time are the
           only provenance an operator gets, because there is no local alias to name it
           by, so they are rendered rather than merely typed. A failed refresh keeps the
           last complete snapshot below and reports the failure beside it. -->
      <section
        v-if="catalog"
        class="base-container flex flex-col gap-3 p-3"
      >
        <div class="flex flex-wrap items-start gap-2">
          <div class="min-w-0">
            <h2 class="font-medium">{{ catalog.metadata?.name || catalog.url }}</h2>
            <p class="text-caption break-all opacity-60">{{ catalog.url }}</p>
            <p
              v-if="catalog.metadata?.description"
              class="text-caption opacity-70"
            >
              {{ catalog.metadata.description }}
            </p>
            <a
              v-if="catalogHomepage"
              :href="catalogHomepage"
              target="_blank"
              rel="noopener noreferrer"
              class="link text-caption block break-all opacity-70"
              >{{ catalogHomepage }}</a
            >
            <p
              v-if="catalogFetchedAt"
              class="text-caption opacity-60"
            >
              {{ $t('fivegpnCatalogFetchedAt', { time: catalogFetchedAt }) }}
            </p>
          </div>
          <span
            v-if="catalog.error"
            class="badge badge-error ml-auto h-auto text-left whitespace-normal"
            >{{ catalog.error }}</span
          >
          <span
            v-else
            class="badge badge-ghost ml-auto"
            >{{ catalogEntryCount }}</span
          >
        </div>

        <article
          v-for="entry in filteredEntries"
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
            :disabled="reviewing || catalogInstallState(entry) === 'current'"
            @click="openReview(entry.id, Boolean(entry.installed_version))"
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
        v-if="catalogStatus === 'ready' && filteredEntries.length === 0"
        class="base-container p-4 text-center text-sm opacity-60"
      >
        {{ $t('fivegpnMarketplaceNoResults') }}
      </p>
    </div>

    <FiveGPNExtensionReviewDialog
      v-model="reviewOpen"
      v-model:draft="reviewDraft"
      :mode="reviewMode"
      :detail="reviewDetail"
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
import {
  FIVEGPN_REVIEW_CONTRACT,
  type FiveGPNCandidate,
  type FiveGPNModuleDetail,
  type FiveGPNSettingValue,
} from '@/api/fivegpn'
import { catalogInstallState } from '@/assembly/fivegpn/catalog'
import {
  applyCatalogUpdate,
  cancelInterceptionInspection,
  catalog,
  catalogError,
  catalogStatus,
  installReviewed,
  interception,
  refreshCatalog,
  refreshInterception,
  reviewCatalogEntry,
} from '@/assembly/fivegpn/interception'
import FiveGPNExtensionReviewDialog from '@/components/fivegpn/FiveGPNExtensionReviewDialog.vue'
import { usePaddingForViews } from '@/composables/paddingViews'
import {
  extensionReviewChanges,
  mergeReviewDraft,
  reviewContractMatches,
  type FiveGPNReviewChange,
} from '@/helper/fivegpnExtensionReview'
import { projectMarketplace, type MarketplaceSort } from '@/helper/marketplaceView'
import { activeBackendSession, backendSessionIsCurrent, captureBackendSession } from '@/store/setup'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { debounce } from 'lodash'

const { t } = useI18n()
const { padding } = usePaddingForViews({ offsetTop: 12, offsetBottom: 8 })

const notice = ref('')
const marketplaceSearchInput = ref('')
const marketplaceSearch = ref('')
const marketplaceSort = ref<MarketplaceSort>('catalog')
const commitMarketplaceSearch = debounce((value: string) => {
  marketplaceSearch.value = value
}, 200)

watch(marketplaceSearchInput, (value) => commitMarketplaceSearch(value))

const filteredEntries = computed(() =>
  projectMarketplace(catalog.value, {
    query: marketplaceSearch.value,
    sort: marketplaceSort.value,
  }),
)
const catalogEntryCount = computed(() => (catalog.value?.entries ?? []).length)
/**
 * The index document is fetched from the network, so its self-reported homepage
 * is publisher-supplied text. Only an https URL is ever placed in an href.
 */
const catalogHomepage = computed(() => {
  const raw = catalog.value?.metadata?.homepage
  if (!raw) return ''
  try {
    return new URL(raw).protocol === 'https:' ? raw : ''
  } catch {
    return ''
  }
})
const catalogFetchedAt = computed(() => {
  const raw = catalog.value?.fetched_at
  if (!raw) return ''
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString()
})

/**
 * The page no longer writes marketplace state, so the only notice it raises is
 * the success of a reviewed install or update. Review failures and conflicts
 * are reported inside the dialog, where the decision was made.
 */
const reportSaved = () => {
  notice.value = t('fivegpnSaved')
}

const candidate = ref<FiveGPNCandidate | null>(null)
const previousDetail = ref<FiveGPNModuleDetail | null>(null)
const candidateRevision = ref('')
const reviewedURL = ref('')
const selection = ref('')
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

const reviewDetail = computed(() => {
  const detail = candidate.value?.detail
  return detail && reviewContractMatches(detail.review_contract, FIVEGPN_REVIEW_CONTRACT)
    ? detail
    : null
})
const candidateChanges = computed(() =>
  extensionReviewChanges(
    previousDetail.value,
    candidate.value?.detail ?? null,
    candidate.value?.digest,
  ),
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
  selection.value = ''
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
  const result = await reviewCatalogEntry(target)
  if (epoch !== inspectionEpoch || !backendSessionIsCurrent(session) || !reviewOpen.value) return
  reviewLoading.value = false
  if (result.error || !result.candidate || !result.revision || !result.url) {
    reviewError.value = result.error === 'conflict' ? t('fivegpnConflict') : result.error
    return
  }
  if (
    !reviewContractMatches(result.candidate.detail.review_contract, FIVEGPN_REVIEW_CONTRACT) ||
    (result.installedDetail &&
      !reviewContractMatches(result.installedDetail.review_contract, FIVEGPN_REVIEW_CONTRACT))
  ) {
    candidate.value = null
    previousDetail.value = null
    candidateRevision.value = ''
    reviewedURL.value = ''
    reviewDraft.value = {}
    reviewNewDifferenceKeys.value = []
    reviewBaselineDifferenceKeys.value = []
    reviewError.value = t('fivegpnReviewContractChanged')
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
const openReview = async (entry: string, updating: boolean) => {
  resetReview()
  reviewMode.value = updating ? 'update' : 'install'
  reviewHistoryRestorable.value = true
  reviewOpen.value = true
  selection.value = entry
  await loadReview()
}
const retryReview = () => loadReview(false)
const reloadReview = () => loadReview(true)
const confirmReview = async (values: Record<string, FiveGPNSettingValue>) => {
  const target = selection.value
  const reviewed = candidate.value
  const revision = candidateRevision.value
  if (
    !target ||
    !reviewed ||
    !revision ||
    !reviewedURL.value ||
    reviewSubmitting.value ||
    !reviewContractMatches(reviewed.detail.review_contract, FIVEGPN_REVIEW_CONTRACT)
  ) {
    if (
      reviewed &&
      !reviewContractMatches(reviewed.detail.review_contract, FIVEGPN_REVIEW_CONTRACT)
    ) {
      candidate.value = null
      previousDetail.value = null
      candidateRevision.value = ''
      reviewedURL.value = ''
      reviewError.value = t('fivegpnReviewContractChanged')
    }
    return
  }
  actionController?.abort()
  const controller = new AbortController()
  actionController = controller
  reviewSubmitting.value = true
  const error = previousDetail.value
    ? await applyCatalogUpdate(
        target,
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
  reportSaved()
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
  notice.value = ''
  commitMarketplaceSearch.cancel()
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
  commitMarketplaceSearch.cancel()
  clearReview()
})
</script>
