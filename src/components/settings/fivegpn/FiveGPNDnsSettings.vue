<template>
  <CardState
    v-if="hasVisibleItems"
    :status="dnsStatus"
    :ready="Boolean(draft)"
    :loading-message="$t('fivegpnLoadingState')"
    :absent-message="$t('fivegpnDnsAbsent')"
    :error-message="dnsError"
    :retry-label="$t('fivegpnRetryState')"
    :retrying="dnsStatus === 'loading'"
    class="flex flex-col gap-3 text-sm"
    @retry="refreshDns"
  >
    <!-- Render from draft rather than status. Refreshing changes status to loading, and rendering
         from status would briefly blank the entire section while the draft may contain unsaved edits. -->
    <template v-if="draft">
      <div
        class="border-base-content/10 bg-base-100/95 sticky top-2 z-20 mb-3 rounded-box border p-3 shadow-lg backdrop-blur"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div
            class="min-w-0"
            role="status"
            aria-live="polite"
          >
            <div
              class="font-medium"
              :class="dnsWriteConflict ? 'text-warning' : saveStateIsError ? 'text-error' : ''"
            >
              {{ saveStateTitle }}
            </div>
            <div
              v-if="saveStateDetail"
              class="mt-1 break-words text-xs opacity-70"
            >
              {{ saveStateDetail }}
            </div>
          </div>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <button
              v-if="dnsWriteConflict"
              class="btn btn-warning btn-sm"
              :disabled="saving"
              @click="discardConflict"
            >
              {{ $t('fivegpnDiscardAndReload') }}
            </button>
            <template v-else>
              <button
                class="btn btn-sm"
                :disabled="saving || (!dirty && !writeFailure)"
                @click="discardDraft"
              >
                {{ $t('fivegpnDiscardChanges') }}
              </button>
              <button
                class="btn btn-primary btn-sm"
                :disabled="saving || !dirty"
                @click="saveDraft"
              >
                <span
                  v-if="saving"
                  class="loading loading-spinner loading-xs"
                ></span>
                {{ $t('fivegpnSaveChanges') }}
              </button>
            </template>
          </div>
        </div>
      </div>

      <fieldset
        class="contents"
        :disabled="saving"
      >
      <div class="settings-section-label">{{ $t('fivegpnDnsPolicy') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.fivegpnDnsFallback">
          <div class="setting-item-label">
            {{ $t('fivegpnFallback') }}
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t(FALLBACK_HINT[draft.policy.fallback]))"
            />
          </div>
          <select
            v-model="draft.policy.fallback"
            class="select select-sm w-32"
          >
            <option value="auto">{{ $t('fivegpnFallbackAuto') }}</option>
            <option value="direct">{{ $t('fivegpnFallbackDirect') }}</option>
            <option value="gateway">{{ $t('fivegpnFallbackGateway') }}</option>
          </select>
        </SettingItem>

        <!-- Rules form one ordered list, not one control per row. The full list is evaluated once,
             first match wins across intents, so relative order is part of the semantics. Separate
             setting rows would erase that ordering. Follow zashboard's list-valued setting pattern:
             show a count in one row and edit it in a dialog, just like source IP labels.

             This dialog contains only manually entered rules. A subscription is also a rule in the
             data model, but the row below owns it. Two entry points editing the same rule was the
             hardest behavior to explain in the previous version. -->
        <SettingItem :setting-key="k.fivegpnDnsRules">
          <div class="setting-item-label">
            {{ $t('fivegpnDnsRules') }}
            <template v-if="handRules.length"> ({{ handRules.length }}) </template>
          </div>
          <button
            class="btn btn-sm"
            @click="rulesDialog = true"
          >
            <PencilSquareIcon class="h-4 w-4" />
          </button>
        </SettingItem>

        <!-- A subscription is a kind=subscription rule in the data model, but it has its own row and
             dialog. Which lists are subscribed, how many entries were fetched, and whether fetching
             failed is a separate concern, not incidental information while editing another rule.
             The core evaluates all manual rules before subscriptions, so each list needs only its
             own ordering rather than a shared index across both lists. -->
        <SettingItem :setting-key="k.fivegpnDnsSubscriptions">
          <div class="setting-item-label">
            {{ $t('fivegpnDnsSubscriptions') }}
            <template v-if="subscriptionRules.length"> ({{ subscriptionRules.length }}) </template>
            <span
              v-if="failedSubscriptions > 0"
              class="badge badge-error badge-xs"
              >{{ failedSubscriptions }}</span
            >
          </div>
          <button
            class="btn btn-sm"
            @click="subsDialog = true"
          >
            <PencilSquareIcon class="h-4 w-4" />
          </button>
        </SettingItem>
      </div>

      <div class="settings-section-label">{{ $t('fivegpnDnsUpstreams') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.fivegpnDnsGateway">
          <div class="setting-item-label">
            {{ $t('fivegpnGateway') }}
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t('fivegpnGatewayHint'))"
            />
          </div>
          <input
            v-model="draft.gateway"
            class="input input-sm w-44"
            placeholder="203.0.113.10"
          />
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnDnsChina">
          <div class="setting-item-label">
            {{ $t('fivegpnChinaGroup') }}
            <template v-if="draft.upstreams.china?.length">
              ({{ draft.upstreams.china.length }})
            </template>
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t('fivegpnUpstreamGrammar'))"
            />
          </div>
          <button
            class="btn btn-sm"
            @click="chinaDialog = true"
          >
            <PencilSquareIcon class="h-4 w-4" />
          </button>
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnDnsTrust">
          <div class="setting-item-label">
            {{ $t('fivegpnTrustGroup') }}
            <template v-if="draft.upstreams.trust?.length">
              ({{ draft.upstreams.trust.length }})
            </template>
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t('fivegpnUpstreamGrammar'))"
            />
          </div>
          <button
            class="btn btn-sm"
            @click="trustDialog = true"
          >
            <PencilSquareIcon class="h-4 w-4" />
          </button>
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnDnsEcs">
          <div class="setting-item-label">
            {{ $t('fivegpnEcs') }}
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t('fivegpnEcsHint'))"
            />
          </div>
          <input
            v-model="draft.upstreams.ecs"
            class="input input-sm w-44"
            placeholder="112.96.32.0/24"
          />
        </SettingItem>
      </div>

      <div class="settings-section-label">{{ $t('fivegpnDnsDiagnose') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.fivegpnDnsResolve">
          <div class="setting-item-label">{{ $t('fivegpnResolveTest') }}</div>
          <button
            class="btn btn-sm"
            @click="probeDialog = true"
          >
            <MagnifyingGlassIcon class="h-4 w-4" />
          </button>
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnDnsFlush">
          <div class="setting-item-label">{{ $t('fivegpnDnsFlush') }}</div>
          <button
            class="btn btn-sm"
            @click="flushCache"
          >
            {{ $t('fivegpnFlushCache') }}
          </button>
        </SettingItem>
      </div>

      <!--
        The statistics section was removed because it was a textual copy of the overview charts:
        the same numbers appeared twice, and this version showed no trend. Query totals, cache
        hits/lookups/entries, and both upstream groups are already on the card. "Routed to gateway"
        was merely the sum of gateway and guided-to-gateway in the decision distribution, where the
        chart already separates the two causes. "Loaded CN ranges" was the only non-statistic: it is
        the foundation of arbitration, and zero would classify the entire Chinese internet as foreign.
        It therefore moved to the persistent card instead of sitting beside duplicated numbers here.
      -->
      </fieldset>

    </template>
  </CardState>

  <DialogWrapper
    v-model="rulesDialog"
    :title="$t('fivegpnDnsRules')"
  >
    <div
      v-if="draft"
      class="flex flex-col gap-2 text-sm"
    >
      <div
        v-for="(entry, position) in handRules"
        :key="entry.rule.id"
        class="border-base-content/10 rounded-box flex flex-wrap items-center gap-2 border p-2"
        :class="{ 'opacity-50': !entry.rule.enabled }"
      >
        <span class="w-6 text-center text-xs opacity-60">{{ position + 1 }}</span>
        <input
          v-model="entry.rule.enabled"
          type="checkbox"
          class="toggle toggle-sm"
        />
        <select
          v-model="entry.rule.intent"
          class="select select-xs w-24"
        >
          <option value="block">{{ $t('fivegpnIntentBlock') }}</option>
          <option value="direct">{{ $t('fivegpnIntentDirect') }}</option>
          <option value="proxy">{{ $t('fivegpnIntentProxy') }}</option>
        </select>
        <!-- There is no subscription option because subscriptions belong to their own row. Keeping
             one here would give the same rule two entry points, and this select could turn a manual
             rule into a subscription in place. The rule would then disappear from this list and
             appear in another dialog with no explanation of what happened. -->
        <select
          v-model="entry.rule.kind"
          class="select select-xs w-36"
        >
          <option value="domain">{{ $t('fivegpnKindDomain') }}</option>
          <option value="domain-suffix">{{ $t('fivegpnKindSuffix') }}</option>
          <option value="domain-keyword">{{ $t('fivegpnKindKeyword') }}</option>
        </select>
        <input
          v-model="entry.rule.value"
          class="input input-xs min-w-56 flex-1"
          :placeholder="$t('fivegpnRuleValue')"
        />
        <div class="ml-auto flex gap-1">
          <button
            class="btn btn-ghost btn-xs"
            :disabled="position === 0"
            @click="moveWithin(handRules, position, -1)"
          >
            ↑
          </button>
          <button
            class="btn btn-ghost btn-xs"
            :disabled="position === handRules.length - 1"
            @click="moveWithin(handRules, position, 1)"
          >
            ↓
          </button>
          <button
            class="btn btn-ghost btn-xs text-error"
            @click="removeRule(entry.rule.id)"
          >
            ✕
          </button>
        </div>
      </div>

      <button
        class="btn btn-sm w-fit"
        @click="addRule"
      >
        {{ $t('fivegpnAddRule') }}
      </button>
      <p class="text-xs opacity-70">{{ $t('fivegpnRulesHint') }}</p>
    </div>
  </DialogWrapper>

  <DialogWrapper
    v-model="subsDialog"
    :title="$t('fivegpnDnsSubscriptions')"
  >
    <div
      v-if="draft"
      class="flex flex-col gap-2 text-sm"
    >
      <div
        v-if="subscriptionRules.length === 0"
        class="text-base-content/50 py-2 text-xs"
      >
        {{ $t('fivegpnSubNone') }}
      </div>
      <div
        v-for="(entry, position) in subscriptionRules"
        :key="entry.rule.id"
        class="border-base-content/10 rounded-box flex flex-col gap-2 border p-2"
        :class="{ 'opacity-50': !entry.rule.enabled }"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="w-6 text-center text-xs opacity-60">{{ position + 1 }}</span>
          <input
            v-model="entry.rule.enabled"
            type="checkbox"
            class="toggle toggle-sm"
          />
          <select
            v-model="entry.rule.intent"
            class="select select-xs w-24"
          >
            <option value="block">{{ $t('fivegpnIntentBlock') }}</option>
            <option value="direct">{{ $t('fivegpnIntentDirect') }}</option>
            <option value="proxy">{{ $t('fivegpnIntentProxy') }}</option>
          </select>
          <select
            v-model="entry.rule.format"
            class="select select-xs w-28"
          >
            <option value="plain">plain</option>
            <option value="gfwlist">gfwlist</option>
            <option value="dnsmasq">dnsmasq</option>
            <option value="hosts">hosts</option>
            <option value="clash">clash</option>
          </select>
          <input
            v-model.number="entry.rule.intervalSeconds"
            type="number"
            class="input input-xs w-24"
            :placeholder="$t('fivegpnInterval')"
          />
          <!-- Subscription order also matters because two lists may cover the same name with
               different intents. The ordering controls moved here now that subscriptions are no
               longer visible in the rules dialog. -->
          <div class="ml-auto flex gap-1">
            <button
              class="btn btn-ghost btn-xs"
              :disabled="position === 0"
              @click="moveWithin(subscriptionRules, position, -1)"
            >
              ↑
            </button>
            <button
              class="btn btn-ghost btn-xs"
              :disabled="position === subscriptionRules.length - 1"
              @click="moveWithin(subscriptionRules, position, 1)"
            >
              ↓
            </button>
            <button
              class="btn btn-ghost btn-xs text-error"
              @click="removeSubscription(entry.rule.id)"
            >
              ✕
            </button>
          </div>
        </div>
        <input
          v-model="entry.rule.value"
          class="input input-xs w-full font-mono"
          placeholder="https://example.com/list.txt"
        />
        <div class="text-xs opacity-60">{{ subscriptionNote(entry.rule.id) }}</div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          class="btn btn-sm w-fit"
          @click="addSubscription"
        >
          {{ $t('fivegpnSubAdd') }}
        </button>
        <!-- The core seeds these two entries on a fresh gateway, but not when a document already
             exists. Defaults apply only to a missing document, which is why the extension catalog
             originally went blank immediately after release on every existing host. Provide an
             explicit button instead of silently rewriting operator policy during an upgrade. -->
        <button
          class="btn btn-sm w-fit"
          :disabled="defaultsPresent"
          @click="importDefaultSubscriptions"
        >
          {{ defaultsPresent ? $t('fivegpnSubDefaultsPresent') : $t('fivegpnSubImportDefaults') }}
        </button>
      </div>
      <p class="text-xs opacity-70">{{ $t('fivegpnSubHint') }}</p>
    </div>
  </DialogWrapper>

  <DialogWrapper
    v-model="chinaDialog"
    :title="$t('fivegpnChinaGroup')"
  >
    <div class="flex flex-col gap-2 text-sm">
      <textarea
        v-model="chinaText"
        class="textarea textarea-sm w-full font-mono"
        rows="6"
      />
      <p class="text-xs opacity-70">{{ $t('fivegpnUpstreamGrammar') }}</p>
    </div>
  </DialogWrapper>

  <DialogWrapper
    v-model="trustDialog"
    :title="$t('fivegpnTrustGroup')"
  >
    <div class="flex flex-col gap-2 text-sm">
      <textarea
        v-model="trustText"
        class="textarea textarea-sm w-full font-mono"
        rows="6"
      />
      <p class="text-xs opacity-70">{{ $t('fivegpnUpstreamGrammar') }}</p>
    </div>
  </DialogWrapper>

  <DialogWrapper
    v-model="probeDialog"
    :title="$t('fivegpnResolveTest')"
  >
    <div class="flex flex-col gap-3 text-sm">
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="probeName"
          class="input input-sm flex-1"
          placeholder="example.com"
          @keyup.enter="runProbe"
        />
        <button
          class="btn btn-sm btn-primary"
          :disabled="explaining || !probeName"
          @click="runProbe"
        >
          {{ $t('fivegpnResolveRun') }}
        </button>
      </div>

      <div
        v-if="explanationError"
        class="alert alert-error py-2"
      >
        <span>{{ explanationError }}</span>
      </div>

      <div
        v-if="explanation"
        class="settings-grid"
      >
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('fivegpnVerdict') }}</div>
          <span class="badge badge-sm">
            {{ explanation.verdict.verdict || '—' }} / {{ explanation.verdict.reason || '—' }}
          </span>
        </div>
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('fivegpnDecidedBy') }}</div>
          <span>{{ decidedBy }}</span>
        </div>
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('fivegpnClientAnswer') }}</div>
          <span class="font-mono text-xs">{{ (explanation.answers ?? []).join(', ') || '—' }}</span>
        </div>
        <!-- Client and origin answers necessarily differ for guided names. Showing only the client
             answer would make healthy DNS behavior look broken. -->
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('fivegpnOriginAnswer') }}</div>
          <span class="font-mono text-xs">{{ (explanation.origin ?? []).join(', ') || '—' }}</span>
        </div>
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('fivegpnUpstreamAdopted') }}</div>
          <span
            >{{ explanation.upstream || '—'
            }}{{ explanation.cacheHit ? ` (${$t('fivegpnCacheHit')})` : '' }}</span
          >
        </div>
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('fivegpnRcode') }}</div>
          <span>{{ explanation.rcode }}</span>
        </div>
      </div>
    </div>
  </DialogWrapper>
</template>

<script setup lang="ts">
import type { FiveGPNDnsDocument } from '@/api/fivegpn'
import {
  clearDnsWriteError,
  dnsDocument,
  dnsError,
  dnsRevision,
  dnsStatus,
  dnsSubscriptions,
  dnsWriteConflict,
  dnsWriteError,
  dnsWritesPending,
  discardDnsConflict,
  explain,
  explaining,
  explanation,
  explanationError,
  flushCache,
  refreshDns,
  saveDns,
  startDnsSubscriptionSampling,
  stopDnsSubscriptionSampling,
} from '@/assembly/fivegpn/dns'
import CardState from '@/components/ds/CardState.vue'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import { useHasAnyVisibleSetting } from '@/composables/settings'
import { useTooltip } from '@/helper/tooltip'
import { cloneWholeDocument, wholeDocumentChanged } from '@/helper/wholeDocumentDraft'
import { activeBackendSession } from '@/store/setup'
import { getAllKeysForCategory, FIVEGPN_DNS_ITEM_KEYS } from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import {
  MagnifyingGlassIcon,
  PencilSquareIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/vue/24/outline'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { showTip } = useTooltip()
const k = FIVEGPN_DNS_ITEM_KEYS
const hasVisibleItems = useHasAnyVisibleSetting(getAllKeysForCategory(SETTINGS_MENU_KEY.fivegpnDns))

const FALLBACK_HINT: Record<string, string> = {
  auto: 'fivegpnFallbackAutoHint',
  direct: 'fivegpnFallbackDirectHint',
  gateway: 'fivegpnFallbackGatewayHint',
}

const draft = ref<FiveGPNDnsDocument | null>(null)
const baseDocument = ref<FiveGPNDnsDocument | null>(null)
const draftRevision = ref('')
const notice = ref('')
const probeName = ref('')

const rulesDialog = ref(false)
const subsDialog = ref(false)
const chinaDialog = ref(false)
const trustDialog = ref(false)
const probeDialog = ref(false)

const reset = () => {
  baseDocument.value = dnsDocument.value ? cloneWholeDocument(dnsDocument.value) : null
  draft.value = dnsDocument.value ? cloneWholeDocument(dnsDocument.value) : null
  draftRevision.value = dnsRevision.value
  notice.value = ''
}

watch(
  [dnsDocument, dnsRevision],
  () => {
    // A successful earlier write in the same queue must not erase a later
    // local edit that is still in flight. The final success resets once the
    // queue drains; a conflict keeps its attempted draft visible.
    if (
      dnsWritesPending.value > 0 ||
      dnsWriteConflict.value ||
      dnsWriteError.value ||
      wholeDocumentChanged(baseDocument.value, draft.value)
    ) {
      return
    }
    reset()
  },
  { immediate: true },
)

watch(dnsWritesPending, (pending) => {
  if (pending === 0 && !dnsWriteConflict.value && !dnsWriteError.value) reset()
})

watch(
  dnsWriteConflict,
  (conflict) => {
    if (!conflict) return
    draft.value = cloneWholeDocument(conflict.draft)
    notice.value = ''
  },
  { immediate: true },
)

watch(activeBackendSession, (session, previous) => {
  if (session?.epoch === previous?.epoch) return
  reset()
  if (session) {
    void Promise.resolve().then(() => {
      if (activeBackendSession.value?.epoch === session.epoch) return refreshDns()
    })
  }
})

const dirty = computed(() => wholeDocumentChanged(baseDocument.value, draft.value))
const saving = computed(() => dnsWritesPending.value > 0)
const writeFailure = computed(() => {
  if (notice.value) return notice.value
  return dnsWriteError.value === 'conflict' ? '' : dnsWriteError.value
})
const saveStateIsError = computed(() => Boolean(writeFailure.value))
const saveStateTitle = computed(() => {
  if (dnsWriteConflict.value) return t('fivegpnDnsConflictPreserved')
  if (saving.value) return t('fivegpnDnsSaving')
  if (writeFailure.value) return t('fivegpnDnsSaveFailed')
  return dirty.value ? t('fivegpnUnsaved') : t('fivegpnSaved')
})
const saveStateDetail = computed(() => {
  if (writeFailure.value) return writeFailure.value
  if (dirty.value && !saving.value && !dnsWriteConflict.value) return t('fivegpnDnsDraftHint')
  return ''
})

const splitLines = (v: string) =>
  v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

const chinaText = computed({
  get: () => (draft.value?.upstreams.china ?? []).join('\n'),
  set: (v: string) => {
    if (draft.value) draft.value.upstreams.china = splitLines(v)
  },
})
const trustText = computed({
  get: () => (draft.value?.upstreams.trust ?? []).join('\n'),
  set: (v: string) => {
    if (draft.value) draft.value.upstreams.trust = splitLines(v)
  },
})

// Each dialog receives one group but edits the same array, so every entry carries its absolute index
// in the full list. Order is part of policy semantics and filtering must not discard it.
//
// This panel does not decide cross-group precedence. The core guarantees that manual rules precede
// subscriptions (Policy.ordered) and normalizes on every write and document open. The panel orders
// entries only within a group.
const groupedRules = (subscription: boolean) =>
  computed(() =>
    (draft.value?.policy.rules ?? [])
      .map((rule, index) => ({ rule, index }))
      .filter((entry) => (entry.rule.kind === 'subscription') === subscription),
  )

const handRules = groupedRules(false)
const subscriptionRules = groupedRules(true)

const failedSubscriptions = computed(
  () => dnsSubscriptions.value.filter((s) => Boolean(s.error)).length,
)

// Keep the same addresses and format as the core's DefaultSubscriptionRules. Two definitions of the
// same default will eventually diverge; this copy serves gateways that already have a document and
// therefore do not receive the seed.
const DEFAULT_SUBSCRIPTIONS = [
  {
    id: 'china-domains',
    url: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/ChinaMax/ChinaMax_Domain.yaml',
    intent: 'direct' as const,
    format: 'clash',
  },
  {
    id: 'gfwlist',
    url: 'https://raw.githubusercontent.com/Loyalsoldier/v2ray-rules-dat/release/gfw.txt',
    intent: 'proxy' as const,
    format: 'plain',
  },
]

const defaultsPresent = computed(() =>
  DEFAULT_SUBSCRIPTIONS.every((d) =>
    (draft.value?.policy.rules ?? []).some((r) => r.value === d.url),
  ),
)

const importDefaultSubscriptions = () => {
  if (!draft.value) return
  for (const preset of DEFAULT_SUBSCRIPTIONS) {
    // Deduplicate by URL, not ID. The operator may already have added the same list manually, and a
    // second entry would only make two rules fetch the same address.
    if (draft.value.policy.rules.some((r) => r.value === preset.url)) continue
    draft.value.policy.rules.push({
      id: preset.id,
      kind: 'subscription',
      value: preset.url,
      intent: preset.intent,
      enabled: true,
      format: preset.format,
      intervalSeconds: 86400,
    })
  }
}

const addSubscription = () => {
  if (!draft.value) return
  draft.value.policy.rules.push({
    id: `s-${Math.random().toString(36).slice(2, 10)}`,
    kind: 'subscription',
    value: '',
    intent: 'proxy',
    enabled: true,
    format: 'plain',
    intervalSeconds: 86400,
  })
}

const removeSubscription = (id: string) => {
  if (!draft.value) return
  draft.value.policy.rules = draft.value.policy.rules.filter((r) => r.id !== id)
}

// Move one position within a group. entries is a filtered group whose items retain their absolute
// indices in the full list. Swapping two absolute indices moves only those entries and leaves every
// other rule in place. Even when the two groups are interleaved in an older core document, the
// visible result within the group is exactly one step up or down.
const moveWithin = (entries: { index: number }[], position: number, delta: number) => {
  const rules = draft.value?.policy.rules
  const target = position + delta
  if (!rules || target < 0 || target >= entries.length) return
  const a = entries[position].index
  const b = entries[target].index
  ;[rules[a], rules[b]] = [rules[b], rules[a]]
}

const removeRule = (id: string) => {
  if (!draft.value) return
  draft.value.policy.rules = draft.value.policy.rules.filter((r) => r.id !== id)
}

// The client creates rule IDs because they also name subscription cache files; the server requires
// only that they are path-safe.
//
// A new rule remains local until the complete document is valid and the
// operator explicitly saves it.
const addRule = () => {
  if (!draft.value) return
  const rules = draft.value.policy.rules
  // Insert at the end of the manual group, not the full list. The core moves all manual rules before
  // subscriptions on write, so push would make the draft differ before and after saving. moveWithin
  // also assumes groups are contiguous; a manual rule after subscriptions would make it swap members
  // across the two groups.
  const firstSubscription = rules.findIndex((r) => r.kind === 'subscription')
  rules.splice(firstSubscription === -1 ? rules.length : firstSubscription, 0, {
    id: `r-${Math.random().toString(36).slice(2, 10)}`,
    kind: 'domain-suffix',
    value: '',
    intent: 'proxy',
    enabled: true,
  })
}

const saveDraft = async () => {
  if (!draft.value || !dirty.value || saving.value || dnsWriteConflict.value) return
  clearDnsWriteError()
  notice.value = ''
  const sessionEpoch = activeBackendSession.value?.epoch
  const error = await saveDns(draft.value, draftRevision.value)
  if (sessionEpoch !== activeBackendSession.value?.epoch) return
  notice.value = error === 'conflict' ? '' : error
}

const discardDraft = () => {
  if (!baseDocument.value || saving.value || dnsWriteConflict.value) return
  clearDnsWriteError()
  reset()
}

const discardConflict = async () => {
  await discardDnsConflict()
  reset()
}

const runProbe = () => explain(probeName.value)

const decidedBy = computed(() => {
  const e = explanation.value
  if (!e) return '—'
  if (e.capture) {
    const who = e.capture.extensionName || e.capture.extensionId
    return e.capture.ready
      ? t('fivegpnDecidedByExtension', { name: who, pattern: e.capture.pattern })
      : t('fivegpnDecidedByExtensionInert', { name: who })
  }
  if (e.rule) return t('fivegpnDecidedByRule', { kind: e.rule.kind, value: e.rule.value })
  return t('fivegpnDecidedByFallback', { fallback: e.fallback })
})

const subscriptionNote = (ruleId: string) => {
  const status = dnsSubscriptions.value.find((s) => s.ruleId === ruleId)
  if (!status) return t('fivegpnSubNotFetched')
  if (status.error) return t('fivegpnSubError', { entries: status.entries })
  return t('fivegpnSubEntries', { entries: status.entries })
}

onMounted(() => {
  startDnsSubscriptionSampling()
  void refreshDns()
})
onUnmounted(stopDnsSubscriptionSampling)
</script>
