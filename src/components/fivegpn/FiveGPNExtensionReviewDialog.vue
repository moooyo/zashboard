<template>
  <DialogWrapper
    v-model="open"
    :title="dialogTitle"
    box-class="fivegpn-review-dialog flex flex-col"
    body-class="min-h-0 flex-1 max-h-none! overflow-y-auto"
    footer-class="fivegpn-review-footer"
    mobile-sheet
    history-entry
    history-key="fivegpn-extension-review"
    :restore-from-history="historyRestorable"
    :close-disabled="submitting"
    no-padding
    @close="$emit('cancel')"
  >
    <div class="flex flex-col gap-3 p-3 md:p-4">
      <template v-if="loading && !detail">
        <div
          class="flex flex-col gap-2"
          aria-live="polite"
          :aria-label="$t('fivegpnReviewLoading')"
        >
          <div class="skeleton h-6 w-48" />
          <div class="skeleton h-4 w-28" />
          <div class="skeleton mt-1 h-24 w-full rounded-xl" />
          <div class="skeleton h-32 w-full rounded-xl" />
          <div class="skeleton h-24 w-full rounded-xl" />
        </div>
      </template>

      <template v-else-if="detail">
        <div class="flex min-w-0 items-start gap-2">
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-base font-bold">{{ detail.name || detail.id }}</h2>
            <p class="text-primary text-xs">
              <template v-if="mode === 'update' && installedVersion">
                {{ installedVersion }} → {{ detail.version }}
              </template>
              <template v-else>{{ detail.version }}</template>
            </p>
            <p
              v-if="reviewedSource || detail.source_url"
              class="mt-1 flex min-w-0 items-center gap-1 text-xs opacity-60"
            >
              <span class="shrink-0">{{ $t('fivegpnExtensionSource') }}:</span>
              <code
                class="scrollbar-hidden min-w-0 overflow-x-auto whitespace-nowrap"
                :title="reviewedSource || detail.source_url"
                tabindex="0"
              >
                {{ reviewedSource || detail.source_url }}
              </code>
            </p>
            <p
              v-if="reviewedSource && detail.source_url && reviewedSource !== detail.source_url"
              class="mt-1 flex min-w-0 items-center gap-1 text-xs opacity-60"
            >
              <span class="shrink-0">{{ $t('fivegpnResolvedExtensionSource') }}:</span>
              <code
                class="scrollbar-hidden min-w-0 overflow-x-auto whitespace-nowrap"
                :title="detail.source_url"
                tabindex="0"
              >
                {{ detail.source_url }}
              </code>
            </p>
          </div>
          <span class="badge badge-ghost badge-sm shrink-0">
            {{ statusLabel }}
          </span>
        </div>

        <div
          v-if="conflictMessage"
          class="alert border-error bg-error/10 text-base-content items-start border"
          role="alert"
        >
          <div class="flex flex-col gap-1">
            <span class="font-medium">{{ $t('fivegpnReviewExpiredTitle') }}</span>
            <span class="text-xs">{{ conflictMessage }}</span>
          </div>
        </div>

        <div
          v-if="errorMessage"
          class="alert border-error bg-error/10 text-base-content border"
          role="alert"
        >
          <span>{{ errorMessage }}</span>
        </div>

        <div
          v-if="resolvedMessage"
          class="alert border-info bg-info/10 text-base-content border"
          role="status"
        >
          <span>{{ resolvedMessage }}</span>
        </div>

        <section
          v-if="mode === 'update' && changes.length"
          class="bg-base-150 rounded-xl p-3"
          :aria-label="$t('fivegpnUpdateChanges')"
        >
          <h3 class="mb-1 text-sm font-medium">{{ $t('fivegpnUpdateChanges') }}</h3>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5">
            <span
              v-for="change in changes"
              :key="changeKey(change)"
              :class="newChangeKeys.has(changeKey(change)) && 'text-warning font-medium'"
            >
              <span aria-hidden="true">＋ </span>{{ changeLabel(change) }}
              <span
                v-if="newChangeKeys.has(changeKey(change))"
                class="badge badge-warning badge-xs ml-1"
              >
                {{ $t('fivegpnReviewNewDifference') }}
              </span>
            </span>
          </div>
        </section>

        <section
          v-else-if="mode === 'enable'"
          class="bg-base-150 rounded-xl p-3"
        >
          <h3 class="mb-1 text-sm font-medium">{{ $t('fivegpnEnableEffectTitle') }}</h3>
          <p class="text-xs leading-5">{{ $t('fivegpnEnableEffectDescription') }}</p>
          <p class="text-xs leading-5">{{ $t('fivegpnEnableCertificateDescription') }}</p>
        </section>

        <section
          v-else-if="mode === 'install'"
          class="bg-base-150 rounded-xl p-3 text-xs leading-5"
        >
          {{ $t('fivegpnInstallLandsDisabled') }}
        </section>

        <div class="settings-grid border-base-border border">
          <div class="setting-item min-w-0">
            <span class="setting-item-label">{{ $t('fivegpnCaptureHosts') }}</span>
            <code class="hidden max-w-[65%] min-w-0 text-right text-xs break-all md:block">
              {{ detail.capture_hosts.join(' · ') }}
            </code>
            <details class="max-w-[65%] min-w-0 text-right md:hidden">
              <summary class="cursor-pointer text-xs">{{ mobileCaptureHostSummary }}</summary>
              <code class="mt-1 block text-xs break-all">
                {{ detail.capture_hosts.join(' · ') }}
              </code>
            </details>
          </div>
          <div class="setting-item min-w-0">
            <span class="setting-item-label">
              {{ $t('fivegpnStorage') }} / {{ $t('fivegpnActions') }}
            </span>
            <span class="text-xs">
              {{ $t(detail.persistent_storage ? 'fivegpnEnabled' : 'fivegpnDisabled') }} /
              {{ detail.actions?.length ?? 0 }}
            </span>
          </div>
          <div class="setting-item min-w-0">
            <span class="setting-item-label">
              {{ $t('fivegpnCaptureDns') }} / {{ $t('fivegpnExecutionOrder') }}
              <span
                v-if="bindingIsNew"
                class="badge badge-warning badge-xs ml-1"
              >
                {{ $t('fivegpnReviewNewDifference') }}
              </span>
            </span>
            <code class="text-right text-xs">
              {{ detail.capture_dns }} · {{ executionPosition }}
            </code>
          </div>
          <div class="setting-item min-w-0 items-start py-2">
            <span class="setting-item-label flex items-center gap-1">
              {{ $t('fivegpnEgressGroup') }} / {{ digestLabel }}
              <span
                v-if="digestIsNew || egressIsNew"
                class="badge badge-warning badge-xs"
              >
                {{ $t('fivegpnReviewNewDifference') }}
              </span>
            </span>
            <span class="flex max-w-[65%] min-w-0 items-start gap-2 text-right text-xs">
              <code class="shrink-0">{{ detail.egress_group }}</code>
              <span aria-hidden="true">/</span>
              <code
                class="scrollbar-hidden min-w-0 overflow-x-auto whitespace-nowrap"
                :title="digest"
                tabindex="0"
              >
                {{ digest || '—' }}
              </code>
            </span>
          </div>
        </div>

        <section class="flex flex-col gap-1">
          <h3 class="text-sm font-medium">{{ $t('fivegpnExactRoutingRules') }}</h3>
          <p
            v-if="!detail.routing_rules?.length"
            class="text-xs opacity-60"
          >
            {{ $t('fivegpnNoRoutingRules') }}
          </p>
          <div
            v-for="(rule, index) in detail.routing_rules ?? []"
            :key="index"
            class="bg-base-150 block rounded-md px-2 py-2 text-xs break-all"
          >
            <code class="hidden md:inline">{{ JSON.stringify(rule) }}</code>
            <details class="md:hidden">
              <summary class="cursor-pointer font-mono">
                {{ compactReviewRoutingRule(rule) }}
              </summary>
              <code class="mt-2 block opacity-70">{{ JSON.stringify(rule) }}</code>
            </details>
          </div>
        </section>

        <div
          v-if="detail.network"
          class="alert border-warning bg-warning/10 text-base-content items-start border"
        >
          <div class="flex flex-col gap-1">
            <span class="font-medium">{{ $t('fivegpnUnrestrictedNetworkGrant') }}</span>
            <span class="text-xs leading-5">{{ $t('fivegpnNetworkGrantWarning') }}</span>
          </div>
        </div>

        <section
          v-if="detail.actions?.length"
          class="flex flex-col gap-1"
        >
          <h3 class="text-sm font-medium">{{ $t('fivegpnExactActions') }}</h3>
          <div
            v-for="action in detail.actions"
            :key="action.id"
            class="bg-base-150 rounded-md px-2 py-2 text-xs break-all"
          >
            <code class="hidden md:inline">{{ JSON.stringify(action) }}</code>
            <details class="md:hidden">
              <summary class="cursor-pointer font-mono">
                {{ action.id }} · {{ action.phase }}
              </summary>
              <code class="mt-2 block opacity-70">{{ JSON.stringify(action) }}</code>
            </details>
          </div>
        </section>

        <section
          v-if="detail.upstream_mappings?.length"
          class="flex flex-col gap-1"
        >
          <h3 class="text-sm font-medium">{{ $t('fivegpnUpstreamMappings') }}</h3>
          <div
            v-for="mapping in detail.upstream_mappings"
            :key="`${mapping.pattern}:${mapping.target}:${mapping.resolver}`"
            class="bg-base-150 rounded-md px-2 py-2 text-xs break-all"
          >
            <code class="hidden md:inline">{{ JSON.stringify(mapping) }}</code>
            <details class="md:hidden">
              <summary class="cursor-pointer font-mono">
                {{ mapping.pattern }} → {{ mapping.resolver ? 'resolver:' : ''
                }}{{ mapping.target }}
              </summary>
              <code class="mt-2 block opacity-70">{{ JSON.stringify(mapping) }}</code>
            </details>
          </div>
        </section>

        <section
          v-if="detail.settings?.length"
          class="flex flex-col gap-2"
        >
          <h3 class="text-sm font-medium">{{ $t('fivegpnExtensionConfiguration') }}</h3>
          <FiveGPNExtensionSettingsEditor
            v-if="mode === 'update'"
            :settings="detail.settings"
            :id-prefix="`review-${detail.id}`"
            :busy="submitting"
            :disabled="Boolean(conflictMessage || resolvedMessage)"
            :initial-values="draft"
            :form-id="settingsFormId"
            :submit-label="actionLabel"
            hide-actions
            @draft="draft = $event"
            @save="$emit('confirm', $event)"
          />
          <div
            v-else
            class="settings-grid border-base-border border"
          >
            <div
              v-for="setting in detail.settings"
              :key="setting.key"
              class="setting-item min-w-0"
            >
              <span class="setting-item-label min-w-0">
                <span class="block truncate">{{ setting.label || setting.key }}</span>
                <code class="block truncate text-xs opacity-50">{{ setting.key }}</code>
              </span>
              <code class="max-w-[60%] text-right text-xs break-all">
                {{ formatSettingValue(reviewSettingValue(setting)) }}
              </code>
            </div>
          </div>
        </section>

        <div
          v-if="blockingReason"
          class="alert border-error bg-error/10 text-base-content border"
        >
          <span>{{ blockingReason }}</span>
        </div>
      </template>

      <div
        v-else-if="errorMessage"
        class="alert border-error bg-error/10 text-base-content border"
        role="alert"
      >
        <span>{{ errorMessage }}</span>
      </div>
    </div>

    <template #footer>
      <div class="fivegpn-review-actions flex min-h-16 flex-wrap justify-end gap-2 p-3 md:p-4">
        <button
          class="btn btn-sm"
          type="button"
          :disabled="submitting"
          @click="cancel"
        >
          {{ $t(resolvedMessage ? 'close' : 'fivegpnCancel') }}
        </button>
        <button
          v-if="!resolvedMessage && conflictMessage"
          class="btn btn-primary btn-sm h-auto min-h-8 max-w-full py-2 text-center whitespace-normal"
          type="button"
          :disabled="loading || submitting"
          @click="$emit('reload')"
        >
          <span
            v-if="loading"
            class="loading loading-spinner loading-xs"
          />
          {{ $t('fivegpnReloadAndReview') }}
        </button>
        <button
          v-else-if="!resolvedMessage && errorMessage && !detail"
          class="btn btn-primary btn-sm"
          type="button"
          :disabled="loading"
          @click="$emit('retry')"
        >
          {{ $t('fivegpnRetryReview') }}
        </button>
        <button
          v-else-if="!resolvedMessage"
          class="btn btn-primary btn-sm"
          :type="hasEditableSettings ? 'submit' : 'button'"
          :form="hasEditableSettings ? settingsFormId : undefined"
          :disabled="loading || submitting || !detail || Boolean(blockingReason)"
          @click="!hasEditableSettings && $emit('confirm', draft)"
        >
          <span
            v-if="loading || submitting"
            class="loading loading-spinner loading-xs"
          />
          {{ actionLabel }}
        </button>
      </div>
    </template>
  </DialogWrapper>
</template>

<script setup lang="ts">
import type { FiveGPNModuleDetail, FiveGPNModuleSetting, FiveGPNSettingValue } from '@/api/fivegpn'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import { useViewportHeight } from '@/composables/useViewportHeight'
import { compactReviewRoutingRule, type FiveGPNReviewChange } from '@/helper/fivegpnExtensionReview'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FiveGPNExtensionSettingsEditor from './FiveGPNExtensionSettingsEditor.vue'

const open = defineModel<boolean>({ required: true })
const draft = defineModel<Record<string, FiveGPNSettingValue>>('draft', {
  default: () => ({}),
})
const props = defineProps<{
  mode: 'install' | 'update' | 'enable'
  detail: FiveGPNModuleDetail | null
  digest: string
  digestKind: 'snapshot' | 'manifest'
  digestIsNew?: boolean
  egressIsNew?: boolean
  bindingIsNew?: boolean
  installedVersion?: string
  reviewedSource?: string
  executionPosition: string
  historyRestorable?: boolean
  changes: FiveGPNReviewChange[]
  newDifferenceKeys?: string[]
  loading?: boolean
  submitting?: boolean
  conflictMessage?: string
  errorMessage?: string
  resolvedMessage?: string
  blockingReason?: string
  actionLabel: string
}>()

const emit = defineEmits<{
  cancel: []
  reload: []
  retry: []
  confirm: [values: Record<string, FiveGPNSettingValue>]
}>()

const { t } = useI18n()
useViewportHeight(open)
const settingsFormId = 'fivegpn-extension-review-settings'
const hasEditableSettings = computed(
  () => props.mode === 'update' && Boolean(props.detail?.settings?.length),
)
const dialogTitle = computed(() => {
  if (props.conflictMessage) return t('fivegpnReviewRequired')
  if (props.mode === 'enable') return t('fivegpnEnableReview')
  if (props.mode === 'update') return t('fivegpnReviewUpdateTitle')
  return t('fivegpnReviewInstallTitle')
})
const statusLabel = computed(() => {
  if (props.resolvedMessage) return t('fivegpnSaved')
  if (props.mode === 'update' && props.installedVersion) {
    return t('fivegpnInstalledVersion', { version: props.installedVersion })
  }
  if (props.mode === 'enable') {
    return t(props.detail?.enabled ? 'fivegpnEnabled' : 'fivegpnDisabled')
  }
  return t('fivegpnNewExtension')
})
const digestLabel = computed(() =>
  t(props.digestKind === 'snapshot' ? 'fivegpnDigest' : 'fivegpnManifestDigest'),
)
const newChangeKeys = computed(() => new Set(props.newDifferenceKeys ?? []))
const addedCaptureHostCount = computed(() => {
  const change = props.changes.find((item) => item.id === 'hosts-added')
  return change ? change.hosts.split(',').filter(Boolean).length : 0
})
const mobileCaptureHostSummary = computed(() => {
  const count = props.detail?.capture_hosts.length ?? 0
  return addedCaptureHostCount.value ? `${count} (+${addedCaptureHostCount.value})` : String(count)
})

const changeKey = (change: FiveGPNReviewChange) => JSON.stringify(change)
const changeLabel = (change: FiveGPNReviewChange) => {
  switch (change.id) {
    case 'source':
      return t('fivegpnDiffSource', { before: change.before || '—', after: change.after || '—' })
    case 'hosts-added':
      return t('fivegpnDiffHostsAdded', { hosts: change.hosts })
    case 'hosts-removed':
      return t('fivegpnDiffHostsRemoved', { hosts: change.hosts })
    case 'routing-rules':
      return t('fivegpnDiffRoutingRules', { before: change.before, after: change.after })
    case 'actions':
      return t('fivegpnDiffActions', { before: change.before, after: change.after })
    case 'upstream-mappings':
      return t('fivegpnDiffUpstreamMappings', { before: change.before, after: change.after })
    case 'network-grant':
      return t('fivegpnDiffNetworkGrant')
    case 'storage':
      return t('fivegpnDiffStorage')
    case 'egress-requirement':
      return t('fivegpnDiffEgressRequirement')
    case 'settings-added':
      return t('fivegpnDiffSettingsAdded', { settings: change.settings })
    case 'settings-removed':
      return t('fivegpnDiffSettingsRemoved', { settings: change.settings })
    case 'settings-changed':
      return t('fivegpnDiffSettingsChanged', { settings: change.settings })
    case 'code-only':
      return t('fivegpnDiffCodeOnly')
  }
}

const formatSettingValue = (value: FiveGPNSettingValue | undefined) => {
  if (value === undefined || value === null || value === '') return t('fivegpnSettingUnset')
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

const reviewSettingValue = (setting: FiveGPNModuleSetting) =>
  setting.value !== undefined ? setting.value : setting.default

const cancel = () => {
  open.value = false
  emit('cancel')
}
</script>

<style scoped>
:global(.fivegpn-review-dialog) {
  width: min(var(--fivegpn-review-dialog-width), calc(100vw - 2rem));
  height: min(var(--fivegpn-review-dialog-height), calc(100dvh - 4.5rem));
  max-width: var(--fivegpn-review-dialog-width);
  max-height: calc(100dvh - 4.5rem);
}

.fivegpn-review-actions {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}

@media (width < 48rem) {
  :global(.fivegpn-review-dialog) {
    --fivegpn-review-sheet-top: max(
      var(--fivegpn-review-sheet-offset),
      env(safe-area-inset-top, 0px)
    );
    width: calc(100% - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
    height: calc(var(--app-height, 100dvh) - var(--fivegpn-review-sheet-top));
    margin-right: env(safe-area-inset-right, 0px);
    margin-left: env(safe-area-inset-left, 0px);
    max-width: none;
    max-height: calc(var(--app-height, 100dvh) - var(--fivegpn-review-sheet-top));
  }
}
</style>
