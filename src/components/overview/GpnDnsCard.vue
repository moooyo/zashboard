<template>
  <div
    v-if="dnsSupported"
    class="base-container w-full p-4"
  >
    <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
      {{ $t('gpnDnsCard') }}
    </div>

    <!-- 卡片在拿到第一次采样之前不能整个消失。原本 v-if 同时要求 stats,于是它
         在首帧不存在、采样失败时永远不存在 —— 而"不存在"和"没有数据"在屏幕上
         是同一个样子,操作者只会以为这张卡没做出来。 -->
    <div
      v-if="!stats"
      class="text-base-content/50 py-6 text-center text-sm"
    >
      {{ $t('gpnDnsCardLoading') }}
    </div>

    <template v-else>
      <!-- 上排:速率与命中率。两者都是「现在怎么样」,和 ChartsCard 的上下行同一种
         读法 —— 一个大数字加一条 60 秒的曲线。 -->
      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="bg-base-200/30 flex flex-col gap-1.5 rounded-xl p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('gpnQps') }}
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-3xl font-extralight tabular-nums">{{ qps.toFixed(1) }}</span>
            <span class="text-base-content/60 text-sm">/s</span>
          </div>
          <div class="mt-1 h-14">
            <MiniSparkline
              :data="qpsHistory"
              :min="1"
              :name="t('gpnQps')"
              :label-formatter="qpsLabel"
              :tooltip-formatter="qpsTooltip"
            />
          </div>
          <div class="text-base-content/50 text-xs">
            {{ $t('gpnQueriesTotal') }} {{ stats.total }}
          </div>
        </div>

        <div class="bg-base-200/30 flex flex-col gap-1.5 rounded-xl p-4">
          <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
            {{ $t('gpnCacheHitRate') }}
          </div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-3xl font-extralight tabular-nums">{{ hitRate }}</span>
            <span class="text-base-content/60 text-sm">%</span>
          </div>
          <div class="mt-1 flex h-14 items-end">
            <!-- 命中率是一个比例,不是时间序列:一条随机起伏的曲线会暗示它在变化,
               而它其实是自启动以来的累计比。用一条静态的进度条说实话。 -->
            <progress
              class="progress progress-primary w-full"
              :value="lookups ? stats.cacheHits : 0"
              :max="lookups || 1"
            />
          </div>
          <div class="text-base-content/50 text-xs">
            {{ stats.cacheHits }} / {{ lookups }} · {{ $t('gpnCacheEntries') }}
            {{ stats.cacheEntries }}
          </div>
        </div>
      </div>

      <!-- 决策分布。这是这张卡最重要的一块:它回答「网关到底把流量判成了什么」,
         而那正是 5gpn 唯一在做的事。 -->
      <div class="bg-base-200/30 mt-3 flex flex-col gap-2 rounded-xl p-4">
        <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
          {{ $t('gpnDecisionMix') }}
        </div>
        <div
          v-if="decidedTotal === 0"
          class="text-base-content/50 py-2 text-xs"
        >
          {{ $t('gpnNoSamples') }}
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

      <!-- 上游健康与延迟。err 比 p95 更重要:一个全错的组延迟会很好看,因为失败得快。
         所以每一格里 ok/total 和延迟并排,而不是只画一条漂亮的线。 -->
      <div class="bg-base-200/30 mt-3 flex flex-col gap-2 rounded-xl p-4">
        <div class="text-base-content/60 text-xs font-semibold tracking-wider uppercase">
          {{ $t('gpnUpstreamHealth') }}
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
                >{{ $t('gpnNoSamples') }}</span
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
        <!-- 解析成空的 CN 集会把整个国内互联网判成境外,而从外面看不出来。所以这个
           数字常驻:它是仲裁的地基,不是一个统计量。 -->
        <div
          class="text-xs"
          :class="stats.cnRanges === 0 ? 'text-error' : 'text-base-content/50'"
        >
          {{ $t('gpnCnRanges') }} {{ stats.cnRanges }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  chinaLatencyHistory,
  dnsStats,
  dnsSupported,
  qps,
  qpsHistory,
  startQpsSampling,
  stopQpsSampling,
  trustLatencyHistory,
} from '@/assembly/gpn/dns'
import MiniSparkline from '@/components/overview/MiniSparkline.vue'
import { getToolTipForParams } from '@/helper'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const stats = computed(() => dnsStats.value)

// 采样只在这张卡挂载期间跑。概览不在屏幕上时每秒拉一次控制面,是拿网关的开销
// 换一张没人看的图。
onMounted(startQpsSampling)
onBeforeUnmount(stopQpsSampling)

const lookups = computed(() => (stats.value?.cacheHits ?? 0) + (stats.value?.cacheMisses ?? 0))
const hitRate = computed(() =>
  lookups.value === 0 ? '0.0' : (((stats.value?.cacheHits ?? 0) / lookups.value) * 100).toFixed(1),
)

// 只列互斥的终局判定。chnrouteCn/chnrouteForeign 是 fallback 仲裁的两个结果,
// block/forceDirect/forceProxy 是规则命中的三个结果,合起来正好是一次查询的去向。
const decisions = computed(() => {
  const s = stats.value
  return [
    { key: 'block', label: 'gpnIntentBlock', value: s?.block ?? 0, bar: 'bg-error' },
    { key: 'direct', label: 'gpnIntentDirect', value: s?.forceDirect ?? 0, bar: 'bg-success' },
    { key: 'proxy', label: 'gpnIntentProxy', value: s?.forceProxy ?? 0, bar: 'bg-primary' },
    { key: 'cn', label: 'gpnChnrouteCn', value: s?.chnrouteCn ?? 0, bar: 'bg-info' },
    {
      key: 'foreign',
      label: 'gpnChnrouteForeign',
      value: s?.chnrouteForeign ?? 0,
      bar: 'bg-secondary',
    },
  ].filter((d) => d.value > 0)
})

const decidedTotal = computed(() => decisions.value.reduce((n, d) => n + d.value, 0))

// 两组用不同的颜色,和 ChartsCard 的上行/下行同一种区分方式 —— 一眼看出哪条线是谁,
// 不用去读标签。
const groups = computed(() => [
  {
    key: 'china',
    label: 'gpnChinaGroup',
    stats: stats.value!.china,
    history: chinaLatencyHistory.value,
    color: 'info' as const,
  },
  {
    key: 'trust',
    label: 'gpnTrustGroup',
    stats: stats.value!.trust,
    history: trustLatencyHistory.value,
    color: 'primary' as const,
  },
])

const qpsLabel = (value: number) => `${value.toFixed(1)}/s`
const msLabel = (value: number) => `${value.toFixed(0)}ms`
// 用 ChartsCard 同一个助手,而不是自己拼字符串:tooltip 的标记、颜色和数字格式
// 都在那里定义,重写一遍就是让这一张图慢慢长得和别的不一样。
const qpsTooltip = (params: ToolTipParams[]) =>
  params.map((item) => getToolTipForParams(item, { binary: false, suffix: '/s' })).join('')
const msTooltip = (params: ToolTipParams[]) =>
  params.map((item) => getToolTipForParams(item, { binary: false, suffix: 'ms' })).join('')
</script>
