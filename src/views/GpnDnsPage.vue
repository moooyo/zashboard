<template>
  <div class="relative size-full overflow-x-hidden">
    <div
      class="flex flex-col gap-3 p-3"
      :style="padding"
    >
      <!-- 引擎缺席不是「DNS 关掉了」。关掉是一份加载成功并声明如此的文档;
           缺席是一份没能加载的文档。渲染成同一个界面,等于告诉操作者他的策略
           正在生效,而实际上没有人在读它。 -->
      <div
        v-if="dnsStatus === 'absent'"
        class="alert alert-warning"
      >
        <span>{{ $t('gpnDnsAbsent') }}</span>
      </div>
      <div
        v-else-if="dnsStatus === 'error'"
        class="alert alert-error"
      >
        <span>{{ dnsError }}</span>
      </div>

      <template v-if="draft">
        <div
          role="tablist"
          class="tabs tabs-box w-fit"
        >
          <a
            v-for="t in TABS"
            :key="t"
            role="tab"
            class="tab"
            :class="{ 'tab-active': tab === t }"
            @click="tab = t"
          >
            {{ $t(TAB_LABEL[t]) }}
          </a>
        </div>

        <div
          v-if="notice"
          class="alert"
          :class="noticeIsError ? 'alert-error' : 'alert-success'"
        >
          <span>{{ notice }}</span>
        </div>

        <!-- 策略 -->
        <div
          v-show="tab === 'policy'"
          class="base-container flex flex-col gap-3 p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium">{{ $t('gpnFallback') }}</span>
            <select
              v-model="draft.policy.fallback"
              class="select select-sm w-40"
            >
              <option value="auto">{{ $t('gpnFallbackAuto') }}</option>
              <option value="direct">{{ $t('gpnFallbackDirect') }}</option>
              <option value="gateway">{{ $t('gpnFallbackGateway') }}</option>
            </select>
            <span class="text-xs opacity-70">{{ $t(FALLBACK_HINT[draft.policy.fallback]) }}</span>
          </div>

          <!-- 顺序是语义的一部分:整份列表只走一遍,首个命中获胜,跨 intent。
               所以这里必须能看出「谁在谁上面」,而不是按 intent 分组。 -->
          <div class="flex flex-col gap-2">
            <div
              v-for="(rule, index) in draft.policy.rules"
              :key="rule.id"
              class="border-base-300 flex flex-wrap items-center gap-2 rounded-lg border p-2"
              :class="{ 'opacity-50': !rule.enabled }"
            >
              <span class="w-6 text-center text-xs opacity-60">{{ index + 1 }}</span>
              <input
                v-model="rule.enabled"
                type="checkbox"
                class="toggle toggle-sm"
              />
              <select
                v-model="rule.intent"
                class="select select-xs w-24"
              >
                <option value="block">{{ $t('gpnIntentBlock') }}</option>
                <option value="direct">{{ $t('gpnIntentDirect') }}</option>
                <option value="proxy">{{ $t('gpnIntentProxy') }}</option>
              </select>
              <select
                v-model="rule.kind"
                class="select select-xs w-36"
              >
                <option value="domain">{{ $t('gpnKindDomain') }}</option>
                <option value="domain-suffix">{{ $t('gpnKindSuffix') }}</option>
                <option value="domain-keyword">{{ $t('gpnKindKeyword') }}</option>
                <option value="subscription">{{ $t('gpnKindSubscription') }}</option>
              </select>
              <input
                v-model="rule.value"
                class="input input-xs min-w-56 flex-1"
                :placeholder="$t('gpnRuleValue')"
              />
              <template v-if="rule.kind === 'subscription'">
                <select
                  v-model="rule.format"
                  class="select select-xs w-28"
                >
                  <option value="plain">plain</option>
                  <option value="gfwlist">gfwlist</option>
                  <option value="dnsmasq">dnsmasq</option>
                  <option value="hosts">hosts</option>
                  <option value="clash">clash</option>
                </select>
                <input
                  v-model.number="rule.intervalSeconds"
                  type="number"
                  class="input input-xs w-24"
                  :placeholder="$t('gpnInterval')"
                />
                <span class="text-xs opacity-60">{{ subscriptionNote(rule.id) }}</span>
              </template>
              <div class="ml-auto flex gap-1">
                <button
                  class="btn btn-ghost btn-xs"
                  :disabled="index === 0"
                  @click="move(index, -1)"
                >
                  ↑
                </button>
                <button
                  class="btn btn-ghost btn-xs"
                  :disabled="index === draft.policy.rules.length - 1"
                  @click="move(index, 1)"
                >
                  ↓
                </button>
                <button
                  class="btn btn-ghost btn-xs text-error"
                  @click="draft.policy.rules.splice(index, 1)"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <button
            class="btn btn-sm w-fit"
            @click="addRule"
          >
            {{ $t('gpnAddRule') }}
          </button>
        </div>

        <!-- 上游与网关 -->
        <div
          v-show="tab === 'upstreams'"
          class="base-container flex flex-col gap-3 p-3"
        >
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ $t('gpnGateway') }}</span>
            <input
              v-model="draft.gateway"
              class="input input-sm max-w-md"
              placeholder="203.0.113.10"
            />
            <span class="text-xs opacity-70">{{ $t('gpnGatewayHint') }}</span>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ $t('gpnChinaGroup') }}</span>
            <textarea
              v-model="chinaText"
              class="textarea textarea-sm max-w-2xl font-mono"
              rows="3"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ $t('gpnTrustGroup') }}</span>
            <textarea
              v-model="trustText"
              class="textarea textarea-sm max-w-2xl font-mono"
              rows="3"
            />
          </label>
          <p class="max-w-2xl text-xs opacity-70">{{ $t('gpnUpstreamGrammar') }}</p>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ $t('gpnEcs') }}</span>
            <input
              v-model="draft.upstreams.ecs"
              class="input input-sm max-w-md"
              placeholder="112.96.32.0/24"
            />
            <span class="max-w-2xl text-xs opacity-70">{{ $t('gpnEcsHint') }}</span>
          </label>
        </div>

        <!-- 诊断 -->
        <div
          v-show="tab === 'diagnose'"
          class="base-container flex flex-col gap-3 p-3"
        >
          <div class="flex flex-wrap items-end gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">{{ $t('gpnResolveTest') }}</span>
              <input
                v-model="probeName"
                class="input input-sm w-72"
                placeholder="example.com"
                @keyup.enter="runProbe"
              />
            </label>
            <button
              class="btn btn-sm btn-primary"
              :disabled="explaining || !probeName"
              @click="runProbe"
            >
              {{ $t('gpnResolveRun') }}
            </button>
            <button
              class="btn btn-sm"
              @click="flushCache"
            >
              {{ $t('gpnFlushCache') }}
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
              <span class="setting-item-label">{{ $t('gpnVerdict') }}</span>
              <span class="badge badge-sm">
                {{ explanation.verdict.verdict || '—' }} / {{ explanation.verdict.reason || '—' }}
              </span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnDecidedBy') }}</span>
              <span>{{ decidedBy }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnClientAnswer') }}</span>
              <span class="font-mono text-xs">{{
                (explanation.answers ?? []).join(', ') || '—'
              }}</span>
            </div>
            <!-- 客户端答案与源站答案在被引导的名字上必然不同,只看前者会读成
                 「DNS 坏了」。 -->
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnOriginAnswer') }}</span>
              <span class="font-mono text-xs">{{
                (explanation.origin ?? []).join(', ') || '—'
              }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnUpstreamAdopted') }}</span>
              <span
                >{{ explanation.upstream || '—'
                }}{{ explanation.cacheHit ? ` (${$t('gpnCacheHit')})` : '' }}</span
              >
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnRcode') }}</span>
              <span>{{ explanation.rcode }}</span>
            </div>
          </div>

          <div
            v-if="dnsStats"
            class="settings-grid"
          >
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnQueriesTotal') }}</span>
              <span>{{ dnsStats.total }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnCache') }}</span>
              <span
                >{{ dnsStats.cacheHits }} / {{ dnsStats.cacheHits + dnsStats.cacheMisses }} ·
                {{ dnsStats.cacheEntries }}</span
              >
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnChinaGroup') }}</span>
              <span>{{ groupLine(dnsStats.china) }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnTrustGroup') }}</span>
              <span>{{ groupLine(dnsStats.trust) }}</span>
            </div>
            <!-- 解析成空的 CN 集会把整个国内互联网判成境外,而从外面看不出来。 -->
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnCnRanges') }}</span>
              <span :class="{ 'text-error': dnsStats.cnRanges === 0 }">{{
                dnsStats.cnRanges
              }}</span>
            </div>
            <div class="setting-item">
              <span class="setting-item-label">{{ $t('gpnSteered') }}</span>
              <span>{{ dnsStats.chnrouteForeign + dnsStats.forceProxy }}</span>
            </div>
          </div>
        </div>

        <!-- 查询日志 -->
        <div
          v-show="tab === 'querylog'"
          class="base-container flex flex-col gap-2 p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <input
              v-model="queryLogFilter"
              class="input input-sm w-64"
              :placeholder="$t('gpnQueryLogFilter')"
              @keyup.enter="refreshQueryLog"
            />
            <button
              class="btn btn-sm"
              @click="refreshQueryLog"
            >
              {{ $t('gpnInterceptionRefresh') }}
            </button>
            <span class="text-xs opacity-70">{{ $t('gpnQueryLogWindow') }}</span>
          </div>
          <div
            v-if="queryLogError"
            class="alert alert-error py-2"
          >
            <span>{{ queryLogError }}</span>
          </div>
          <div class="overflow-x-auto">
            <table class="table-xs table">
              <thead>
                <tr>
                  <th>{{ $t('gpnLogTime') }}</th>
                  <th>{{ $t('gpnLogName') }}</th>
                  <th>{{ $t('gpnLogType') }}</th>
                  <th>{{ $t('gpnVerdict') }}</th>
                  <th>{{ $t('gpnUpstreamAdopted') }}</th>
                  <th>{{ $t('gpnLogAnswer') }}</th>
                  <th>{{ $t('gpnLogDuration') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(entry, index) in queryLog"
                  :key="index"
                >
                  <td class="whitespace-nowrap opacity-70">{{ shortTime(entry.time) }}</td>
                  <td class="font-mono">{{ entry.name }}</td>
                  <td>{{ entry.qtype }}</td>
                  <td>
                    <span
                      class="badge badge-xs"
                      :class="verdictClass(entry.verdict)"
                    >
                      {{ entry.reason || entry.verdict || '—' }}
                    </span>
                  </td>
                  <td>{{ entry.upstream || (entry.cacheHit ? $t('gpnCacheHit') : '—') }}</td>
                  <td class="font-mono text-xs">{{ (entry.ips ?? []).join(', ') }}</td>
                  <td class="whitespace-nowrap">{{ entry.durationMs.toFixed(1) }} ms</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="btn btn-primary btn-sm"
            :disabled="saving || !dirty"
            @click="save"
          >
            {{ $t('gpnSave') }}
          </button>
          <button
            class="btn btn-sm"
            :disabled="saving"
            @click="reset"
          >
            {{ $t('gpnRevert') }}
          </button>
          <span
            v-if="dirty"
            class="text-xs opacity-70"
          >
            {{ $t('gpnUnsaved') }}
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GpnDnsDocument, GpnGroupStats } from '@/api/gpn'
import {
  dnsDocument,
  dnsError,
  dnsStats,
  dnsStatus,
  dnsSubscriptions,
  explain,
  explaining,
  explanation,
  explanationError,
  flushCache,
  queryLog,
  queryLogError,
  queryLogFilter,
  refreshDns,
  refreshQueryLog,
  saveDns,
} from '@/assembly/gpn/dns'
import { usePaddingForViews } from '@/composables/paddingViews'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { padding } = usePaddingForViews({ offsetTop: 12, offsetBottom: 8 })

const TABS = ['policy', 'upstreams', 'diagnose', 'querylog'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = {
  policy: 'gpnTabPolicy',
  upstreams: 'gpnTabUpstreams',
  diagnose: 'gpnTabDiagnose',
  querylog: 'gpnTabQueryLog',
}
const FALLBACK_HINT: Record<string, string> = {
  auto: 'gpnFallbackAutoHint',
  direct: 'gpnFallbackDirectHint',
  gateway: 'gpnFallbackGatewayHint',
}

const tab = ref<Tab>('policy')
const draft = ref<GpnDnsDocument | null>(null)
const saving = ref(false)
const notice = ref('')
const noticeIsError = ref(false)
const probeName = ref('')

// 草稿是深拷贝。直接改 store 里的文档会让「取消」无处可退,也会在保存失败时
// 留下一份界面上已生效、后端并不知道的策略。
const clone = (doc: GpnDnsDocument): GpnDnsDocument => JSON.parse(JSON.stringify(doc))

const reset = () => {
  draft.value = dnsDocument.value ? clone(dnsDocument.value) : null
  notice.value = ''
}

watch(dnsDocument, reset, { immediate: true })

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

const splitLines = (v: string) =>
  v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

const dirty = computed(
  () =>
    Boolean(draft.value) &&
    Boolean(dnsDocument.value) &&
    JSON.stringify(draft.value) !== JSON.stringify(dnsDocument.value),
)

const move = (index: number, delta: number) => {
  const rules = draft.value?.policy.rules
  if (!rules) return
  const target = index + delta
  if (target < 0 || target >= rules.length) return
  const [item] = rules.splice(index, 1)
  rules.splice(target, 0, item)
}

// 规则 ID 由客户端铸造,因为它同时是订阅缓存文件名;服务端只要求它是路径安全的。
const addRule = () => {
  if (!draft.value) return
  draft.value.policy.rules.push({
    id: `r-${Math.random().toString(36).slice(2, 10)}`,
    kind: 'domain-suffix',
    value: '',
    intent: 'proxy',
    enabled: true,
  })
}

const save = async () => {
  if (!draft.value) return
  saving.value = true
  const error = await saveDns(draft.value)
  saving.value = false
  noticeIsError.value = Boolean(error)
  notice.value = error === 'conflict' ? t('gpnConflict') : error || t('gpnSaved')
}

const runProbe = () => explain(probeName.value)

const decidedBy = computed(() => {
  const e = explanation.value
  if (!e) return '—'
  if (e.capture) {
    const who = e.capture.extensionName || e.capture.extensionId
    return e.capture.ready
      ? t('gpnDecidedByExtension', { name: who, pattern: e.capture.pattern })
      : t('gpnDecidedByExtensionInert', { name: who })
  }
  if (e.rule) return t('gpnDecidedByRule', { kind: e.rule.kind, value: e.rule.value })
  return t('gpnDecidedByFallback', { fallback: e.fallback })
})

const groupLine = (g: GpnGroupStats) =>
  g.latencyCount === 0
    ? `${g.ok} / ${g.ok + g.err} · ${t('gpnNoSamples')}`
    : `${g.ok} / ${g.ok + g.err} · p50 ${g.p50Ms.toFixed(1)}ms · p95 ${g.p95Ms.toFixed(1)}ms`

const subscriptionNote = (ruleId: string) => {
  const status = dnsSubscriptions.value.find((s) => s.ruleId === ruleId)
  if (!status) return t('gpnSubNotFetched')
  if (status.error) return t('gpnSubError', { entries: status.entries })
  return t('gpnSubEntries', { entries: status.entries })
}

const verdictClass = (verdict?: string) => {
  switch (verdict) {
    case 'proxy':
      return 'badge-primary'
    case 'block':
      return 'badge-error'
    case 'direct':
      return 'badge-success'
    default:
      return 'badge-ghost'
  }
}

const shortTime = (iso: string) => new Date(iso).toLocaleTimeString()

refreshDns()
refreshQueryLog()
</script>
