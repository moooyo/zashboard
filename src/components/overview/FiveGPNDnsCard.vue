<template>
  <div
    v-if="dnsSupported"
    class="base-container w-full p-4"
  >
    <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
      {{ $t('fivegpnDnsCard') }}
    </div>

    <!-- Keep the card visible until the first sample arrives. The original v-if also required
         stats, so the card was absent on the first frame and forever after a sampling failure.
         "Missing" and "no data" look identical on screen, making the card appear unimplemented. -->
    <div
      v-if="!stats"
      class="text-base-content/50 py-6 text-center text-sm"
    >
      {{ $t('fivegpnDnsCardLoading') }}
    </div>

    <template v-else>
      <!-- Top row: rate and hit ratio. Both answer "how is it now" and follow the same pattern
           as upload/download in ChartsCard: a large number plus a 60-second trend. -->
      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="bg-base-200/30 flex flex-col gap-1.5 rounded-xl p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('fivegpnQps') }}
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-3xl font-extralight tabular-nums">{{ qps.toFixed(1) }}</span>
            <span class="text-base-content/60 text-sm">/s</span>
          </div>
          <div class="mt-1 h-14">
            <MiniSparkline
              :data="qpsHistory"
              :min="1"
              :name="t('fivegpnQps')"
              :label-formatter="qpsLabel"
              :tooltip-formatter="qpsTooltip"
            />
          </div>
          <div class="text-base-content/50 text-xs">
            {{ $t('fivegpnQueriesTotal') }} {{ stats.total }}
          </div>
        </div>

        <div class="bg-base-200/30 flex flex-col gap-1.5 rounded-xl p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('fivegpnCacheHitRate') }}
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-3xl font-extralight tabular-nums">{{ hitRate }}</span>
            <span class="text-base-content/60 text-sm">%</span>
          </div>
          <div class="mt-1 flex h-14 items-end">
            <!-- The hit ratio is a proportion, not a time series. A fluctuating curve would imply
                 change, but this is cumulative since startup. A static progress bar is accurate. -->
            <progress
              class="progress progress-primary w-full"
              :value="lookups ? stats.cacheHits : 0"
              :max="lookups || 1"
            />
          </div>
          <div class="text-base-content/50 text-xs">
            {{ stats.cacheHits }} / {{ lookups }} · {{ $t('fivegpnCacheEntries') }}
            {{ stats.cacheEntries }}
          </div>
        </div>
      </div>

      <!-- Decision distribution. This is the card's most important section because it answers
           what the gateway classified traffic as, which is precisely what 5gpn does. -->
      <div class="bg-base-200/30 mt-3 flex flex-col gap-2 rounded-xl p-4">
        <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
          {{ $t('fivegpnDecisionMix') }}
        </div>
        <div
          v-if="decidedTotal === 0"
          class="text-base-content/50 py-2 text-xs"
        >
          {{ $t('fivegpnNoSamples') }}
        </div>
        <template v-else>
          <div class="bg-base-300/40 flex h-2.5 w-full overflow-hidden rounded-full">
            <div
              v-for="slice in decisions"
              :key="slice.key"
              class="h-full"
              :class="slice.bar"
              :style="{ width: `${(slice.value / decidedTotal) * 100}%` }"
            />
          </div>
          <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <div
              v-for="slice in decisions"
              :key="slice.key"
              class="flex items-center gap-1.5 text-xs"
            >
              <span
                class="h-2 w-2 rounded-full"
                :class="slice.bar"
              />
              <span class="text-base-content/60">{{ $t(slice.label) }}</span>
              <span class="tabular-nums">{{ slice.value }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Upstream health and latency. err matters more than p95: a completely failing group can
           look fast because it fails quickly. Show ok/total beside latency instead of only a curve. -->
      <div class="bg-base-200/30 mt-3 flex flex-col gap-2 rounded-xl p-4">
        <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
          {{ $t('fivegpnUpstreamHealth') }}
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="group in groups"
            :key="group.key"
            class="flex flex-col gap-1.5"
          >
            <div class="flex items-center gap-2">
              <span class="text-base-content/60 text-xs">{{ $t(group.label) }}</span>
              <span
                class="badge badge-sm"
                :class="group.stats.err > 0 ? 'badge-warning' : 'badge-ghost'"
              >
                {{ group.stats.ok }} / {{ group.stats.ok + group.stats.err }}
              </span>
            </div>
            <div class="flex items-baseline gap-1.5">
              <span
                v-if="group.stats.latencyCount === 0"
                class="text-base-content/50 text-sm"
                >{{ $t('fivegpnNoSamples') }}</span
              >
              <template v-else>
                <span class="text-3xl font-extralight tabular-nums">{{
                  group.stats.p50Ms.toFixed(1)
                }}</span>
                <span class="text-base-content/60 text-sm">ms</span>
              </template>
            </div>
            <div class="mt-1 h-14">
              <MiniSparkline
                :data="group.history"
                :min="1"
                :color="group.color"
                :name="t(group.label)"
                :label-formatter="msLabel"
                :tooltip-formatter="msTooltip"
              />
            </div>
            <div class="text-base-content/50 text-xs tabular-nums">
              <template v-if="group.stats.latencyCount === 0">&nbsp;</template>
              <template v-else>p95 {{ group.stats.p95Ms.toFixed(1) }}ms</template>
            </div>
          </div>
        </div>
        <!--
          "Which decision data is currently loaded?" is one question, not two. CN ranges are the
          core's built-in IP set, while subscriptions are operator-selected domain lists. Their
          sources differ, but readers care about the same thing: whether arbitration and rules
          have data to work with. Show them side by side.

          Zero CN ranges must be red because arbitration would classify the entire Chinese
          internet as foreign without another visible symptom. A failed subscription fetch must
          also be red, while its count remains the last successful value: the core preserves the
          old cache after failure, so that list is still active and reporting zero would be false.
        -->
        <div class="flex flex-wrap items-center gap-x-2 text-xs">
          <span class="text-base-content/60">{{ $t('fivegpnLoaded') }}</span>
          <span :class="stats.cnRanges === 0 ? 'text-error' : 'text-base-content/50'">
            {{ $t('fivegpnCnRanges') }} {{ stats.cnRanges }}
          </span>
          <template v-if="loadedLists.lists > 0">
            <span class="text-base-content/30">·</span>
            <span class="text-base-content/50">
              {{
                $t('fivegpnLoadedLists', { lists: loadedLists.lists, entries: loadedLists.entries })
              }}
            </span>
          </template>
          <template v-if="loadedLists.failed > 0">
            <span class="text-base-content/30">·</span>
            <span class="text-error">
              {{ $t('fivegpnLoadedListsFailed', { count: loadedLists.failed }) }}
            </span>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  chinaLatencyHistory,
  dnsStats,
  dnsSubscriptions,
  dnsSupported,
  qps,
  qpsHistory,
  startQpsSampling,
  stopQpsSampling,
  trustLatencyHistory,
} from '@/assembly/fivegpn/dns'
import MiniSparkline from '@/components/overview/MiniSparkline.vue'
import { getToolTipForParams } from '@/helper'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const stats = computed(() => dnsStats.value)

// Sample only while this card is mounted. Polling the control plane every second while the
// overview is off screen spends gateway resources on a chart nobody can see.
onMounted(startQpsSampling)
onBeforeUnmount(stopQpsSampling)

const lookups = computed(() => (stats.value?.cacheHits ?? 0) + (stats.value?.cacheMisses ?? 0))
const hitRate = computed(() =>
  lookups.value === 0 ? '0.0' : (((stats.value?.cacheHits ?? 0) / lookups.value) * 100).toFixed(1),
)

// List only mutually exclusive terminal decisions. chnrouteCn/chnrouteForeign are the two
// fallback arbitration results; block/forceDirect/forceProxy are the three rule-hit results.
// Together they account for exactly one destination per query.
const decisions = computed(() => {
  const s = stats.value
  return [
    { key: 'block', label: 'fivegpnIntentBlock', value: s?.block ?? 0, bar: 'bg-error' },
    { key: 'direct', label: 'fivegpnIntentDirect', value: s?.forceDirect ?? 0, bar: 'bg-success' },
    { key: 'proxy', label: 'fivegpnIntentProxy', value: s?.forceProxy ?? 0, bar: 'bg-primary' },
    { key: 'cn', label: 'fivegpnChnrouteCn', value: s?.chnrouteCn ?? 0, bar: 'bg-info' },
    {
      key: 'foreign',
      label: 'fivegpnChnrouteForeign',
      value: s?.chnrouteForeign ?? 0,
      bar: 'bg-secondary',
    },
  ].filter((d) => d.value > 0)
})

const decidedTotal = computed(() => decisions.value.reduce((n, d) => n + d.value, 0))

// Give the two groups different colors, just like upload/download in ChartsCard, so each curve
// is recognizable at a glance without reading its label.
const groups = computed(() => [
  {
    key: 'china',
    label: 'fivegpnChinaGroup',
    stats: stats.value!.china,
    history: chinaLatencyHistory.value,
    color: 'info' as const,
  },
  {
    key: 'trust',
    label: 'fivegpnTrustGroup',
    stats: stats.value!.trust,
    history: trustLatencyHistory.value,
    color: 'primary' as const,
  },
])

const qpsLabel = (value: number) => `${value.toFixed(1)}/s`
const msLabel = (value: number) => `${value.toFixed(0)}ms`

// Count only lists that were actually loaded. The core's status table gains entries only after a
// fetch, so a never-fetched subscription is absent here. This row reports what is loaded, not what
// is configured; the subscription-rules row in Settings reports the latter, including failures.
const loadedLists = computed(() => {
  const statuses = dnsSubscriptions.value
  return {
    lists: statuses.filter((s) => s.entries > 0).length,
    entries: statuses.reduce((n, s) => n + s.entries, 0),
    failed: statuses.filter((s) => Boolean(s.error)).length,
  }
})
// Reuse the ChartsCard helper instead of assembling strings here. It owns tooltip markers, colors,
// and number formatting; duplicating them would let this chart gradually diverge from the others.
const qpsTooltip = (params: ToolTipParams[]) =>
  params.map((item) => getToolTipForParams(item, { binary: false, suffix: '/s' })).join('')
const msTooltip = (params: ToolTipParams[]) =>
  params.map((item) => getToolTipForParams(item, { binary: false, suffix: 'ms' })).join('')
</script>
