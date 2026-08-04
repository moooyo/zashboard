<template>
  <div
    v-if="hasVisibleItems"
    class="flex flex-col gap-3 text-sm"
  >
    <!-- 引擎缺席不是「DNS 关掉了」。关掉是一份加载成功并声明如此的文档;缺席是
         一份没能加载的文档。渲染成同一个界面,等于告诉操作者他的策略正在生效,
         而实际上没有人在读它。 -->
    <template v-if="dnsStatus === 'absent'">
      <div class="alert alert-warning py-2">
        <span>{{ $t('gpnDnsAbsent') }}</span>
      </div>
    </template>

    <template v-else-if="dnsStatus === 'error'">
      <div class="alert alert-error py-2">
        <span>{{ dnsError }}</span>
      </div>
    </template>

    <!-- draft 而不是 status:刷新期间状态会变成 loading,按状态渲染会让整块在每次
         刷新时闪空一下,而草稿里可能有操作者还没保存的编辑。 -->
    <template v-else-if="draft">
      <div
        v-if="notice"
        class="alert py-2"
        :class="noticeIsError ? 'alert-error' : 'alert-success'"
      >
        <span>{{ notice }}</span>
      </div>

      <div class="settings-section-label">{{ $t('gpnDnsPolicy') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.gpnDnsFallback">
          <div class="setting-item-label">
            {{ $t('gpnFallback') }}
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t(FALLBACK_HINT[draft.policy.fallback]))"
            />
          </div>
          <select
            v-model="draft.policy.fallback"
            class="select select-sm w-32"
            @change="apply"
          >
            <option value="auto">{{ $t('gpnFallbackAuto') }}</option>
            <option value="direct">{{ $t('gpnFallbackDirect') }}</option>
            <option value="gateway">{{ $t('gpnFallbackGateway') }}</option>
          </select>
        </SettingItem>

        <!-- 规则是一份有序列表,不是一行一个控件:整份列表只走一遍,首个命中获胜,
             跨 intent,所以「谁在谁上面」是语义本身。拆成设置行会把顺序拆没。
             它走 zashboard 给「值是列表」的那条路 —— 一行显示数量,编辑在对话框
             里,和源 IP 标签同一个形状。 -->
        <SettingItem :setting-key="k.gpnDnsRules">
          <div class="setting-item-label">
            {{ $t('gpnDnsRules') }}
            <template v-if="draft.policy.rules.length">
              ({{ draft.policy.rules.length }})
            </template>
          </div>
          <button
            class="btn btn-sm"
            @click="rulesDialog = true"
          >
            <PencilSquareIcon class="h-4 w-4" />
          </button>
        </SettingItem>

        <!-- 订阅在数据模型里就是 kind=subscription 的规则,所以它本来就"实现了" ——
             但它只在规则对话框里以一个下拉选项的形式存在,等于没有。给它自己的一行
             和自己的对话框,因为「我订了哪些表、抓下来多少条、有没有失败」是一个
             独立的问题,不是编辑某一条规则时顺带看的东西。 -->
        <SettingItem :setting-key="k.gpnDnsSubscriptions">
          <div class="setting-item-label">
            {{ $t('gpnDnsSubscriptions') }}
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

      <div class="settings-section-label">{{ $t('gpnDnsUpstreams') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.gpnDnsGateway">
          <div class="setting-item-label">
            {{ $t('gpnGateway') }}
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t('gpnGatewayHint'))"
            />
          </div>
          <input
            v-model="draft.gateway"
            class="input input-sm w-44"
            placeholder="203.0.113.10"
            @change="apply"
          />
        </SettingItem>

        <SettingItem :setting-key="k.gpnDnsChina">
          <div class="setting-item-label">
            {{ $t('gpnChinaGroup') }}
            <template v-if="draft.upstreams.china?.length">
              ({{ draft.upstreams.china.length }})
            </template>
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t('gpnUpstreamGrammar'))"
            />
          </div>
          <button
            class="btn btn-sm"
            @click="chinaDialog = true"
          >
            <PencilSquareIcon class="h-4 w-4" />
          </button>
        </SettingItem>

        <SettingItem :setting-key="k.gpnDnsTrust">
          <div class="setting-item-label">
            {{ $t('gpnTrustGroup') }}
            <template v-if="draft.upstreams.trust?.length">
              ({{ draft.upstreams.trust.length }})
            </template>
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t('gpnUpstreamGrammar'))"
            />
          </div>
          <button
            class="btn btn-sm"
            @click="trustDialog = true"
          >
            <PencilSquareIcon class="h-4 w-4" />
          </button>
        </SettingItem>

        <SettingItem :setting-key="k.gpnDnsEcs">
          <div class="setting-item-label">
            {{ $t('gpnEcs') }}
            <QuestionMarkCircleIcon
              class="h-4 w-4 cursor-pointer"
              @mouseenter="showTip($event, $t('gpnEcsHint'))"
            />
          </div>
          <input
            v-model="draft.upstreams.ecs"
            class="input input-sm w-44"
            placeholder="112.96.32.0/24"
            @change="apply"
          />
        </SettingItem>
      </div>

      <div class="settings-section-label">{{ $t('gpnDnsDiagnose') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.gpnDnsResolve">
          <div class="setting-item-label">{{ $t('gpnResolveTest') }}</div>
          <button
            class="btn btn-sm"
            @click="probeDialog = true"
          >
            <MagnifyingGlassIcon class="h-4 w-4" />
          </button>
        </SettingItem>

        <SettingItem :setting-key="k.gpnDnsFlush">
          <div class="setting-item-label">{{ $t('gpnDnsFlush') }}</div>
          <button
            class="btn btn-sm"
            @click="flushCache"
          >
            {{ $t('gpnFlushCache') }}
          </button>
        </SettingItem>
      </div>

      <!-- 统计是只读的,天然就是一行一项。 -->
      <template v-if="dnsStats">
        <div class="settings-grid">
          <SettingItem :setting-key="k.gpnDnsStats">
            <div class="setting-item-label">{{ $t('gpnQueriesTotal') }}</div>
            <span>{{ dnsStats.total }}</span>
          </SettingItem>
          <div class="setting-item">
            <div class="setting-item-label">{{ $t('gpnCache') }}</div>
            <span
              >{{ dnsStats.cacheHits }} / {{ dnsStats.cacheHits + dnsStats.cacheMisses }} ·
              {{ dnsStats.cacheEntries }}</span
            >
          </div>
          <div class="setting-item">
            <div class="setting-item-label">{{ $t('gpnChinaGroup') }}</div>
            <span>{{ groupLine(dnsStats.china) }}</span>
          </div>
          <div class="setting-item">
            <div class="setting-item-label">{{ $t('gpnTrustGroup') }}</div>
            <span>{{ groupLine(dnsStats.trust) }}</span>
          </div>
          <!-- 解析成空的 CN 集会把整个国内互联网判成境外,而从外面看不出来。 -->
          <div class="setting-item">
            <div class="setting-item-label">{{ $t('gpnCnRanges') }}</div>
            <span :class="{ 'text-error': dnsStats.cnRanges === 0 }">{{ dnsStats.cnRanges }}</span>
          </div>
          <div class="setting-item">
            <div class="setting-item-label">{{ $t('gpnSteered') }}</div>
            <span>{{ dnsStats.chnrouteForeign + dnsStats.forceProxy }}</span>
          </div>
        </div>
      </template>
    </template>
  </div>

  <DialogWrapper
    v-model="rulesDialog"
    :title="$t('gpnDnsRules')"
  >
    <div
      v-if="draft"
      class="flex flex-col gap-2 text-sm"
    >
      <div
        v-for="(rule, index) in draft.policy.rules"
        :key="rule.id"
        class="border-base-content/10 rounded-box flex flex-wrap items-center gap-2 border p-2"
        :class="{ 'opacity-50': !rule.enabled }"
      >
        <span class="w-6 text-center text-xs opacity-60">{{ index + 1 }}</span>
        <input
          v-model="rule.enabled"
          type="checkbox"
          class="toggle toggle-sm"
          @change="apply"
        />
        <select
          v-model="rule.intent"
          class="select select-xs w-24"
          @change="apply"
        >
          <option value="block">{{ $t('gpnIntentBlock') }}</option>
          <option value="direct">{{ $t('gpnIntentDirect') }}</option>
          <option value="proxy">{{ $t('gpnIntentProxy') }}</option>
        </select>
        <select
          v-model="rule.kind"
          class="select select-xs w-36"
          @change="apply"
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
          @change="apply"
        />
        <template v-if="rule.kind === 'subscription'">
          <select
            v-model="rule.format"
            class="select select-xs w-28"
            @change="apply"
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
            @change="apply"
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
            @click="removeRule(index)"
          >
            ✕
          </button>
        </div>
      </div>

      <button
        class="btn btn-sm w-fit"
        @click="addRule"
      >
        {{ $t('gpnAddRule') }}
      </button>
    </div>
  </DialogWrapper>

  <DialogWrapper
    v-model="subsDialog"
    :title="$t('gpnDnsSubscriptions')"
  >
    <div
      v-if="draft"
      class="flex flex-col gap-2 text-sm"
    >
      <div
        v-if="subscriptionRules.length === 0"
        class="text-base-content/50 py-2 text-xs"
      >
        {{ $t('gpnSubNone') }}
      </div>
      <div
        v-for="entry in subscriptionRules"
        :key="entry.rule.id"
        class="border-base-content/10 rounded-box flex flex-col gap-2 border p-2"
        :class="{ 'opacity-50': !entry.rule.enabled }"
      >
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="entry.rule.enabled"
            type="checkbox"
            class="toggle toggle-sm"
            @change="apply"
          />
          <select
            v-model="entry.rule.intent"
            class="select select-xs w-24"
            @change="apply"
          >
            <option value="block">{{ $t('gpnIntentBlock') }}</option>
            <option value="direct">{{ $t('gpnIntentDirect') }}</option>
            <option value="proxy">{{ $t('gpnIntentProxy') }}</option>
          </select>
          <select
            v-model="entry.rule.format"
            class="select select-xs w-28"
            @change="apply"
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
            :placeholder="$t('gpnInterval')"
            @change="apply"
          />
          <button
            class="btn btn-ghost btn-xs text-error ml-auto"
            @click="removeSubscription(entry.rule.id)"
          >
            ✕
          </button>
        </div>
        <input
          v-model="entry.rule.value"
          class="input input-xs w-full font-mono"
          placeholder="https://example.com/list.txt"
          @change="apply"
        />
        <div class="text-xs opacity-60">{{ subscriptionNote(entry.rule.id) }}</div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          class="btn btn-sm w-fit"
          @click="addSubscription"
        >
          {{ $t('gpnSubAdd') }}
        </button>
        <!-- 新装的网关由核心种下这两条。已经有文档的网关不会 —— 默认值只对
             「不存在的文档」生效,而那正是扩展目录当初在所有已有主机上发布即
             黑屏的原因。所以这里给一个显式的按钮,而不是让升级悄悄改写运维者
             的策略。 -->
        <button
          class="btn btn-sm w-fit"
          :disabled="defaultsPresent"
          @click="importDefaultSubscriptions"
        >
          {{ defaultsPresent ? $t('gpnSubDefaultsPresent') : $t('gpnSubImportDefaults') }}
        </button>
      </div>
      <p class="text-xs opacity-70">{{ $t('gpnSubHint') }}</p>
    </div>
  </DialogWrapper>

  <DialogWrapper
    v-model="chinaDialog"
    :title="$t('gpnChinaGroup')"
  >
    <div class="flex flex-col gap-2 text-sm">
      <textarea
        v-model="chinaText"
        class="textarea textarea-sm w-full font-mono"
        rows="6"
        @change="apply"
      />
      <p class="text-xs opacity-70">{{ $t('gpnUpstreamGrammar') }}</p>
    </div>
  </DialogWrapper>

  <DialogWrapper
    v-model="trustDialog"
    :title="$t('gpnTrustGroup')"
  >
    <div class="flex flex-col gap-2 text-sm">
      <textarea
        v-model="trustText"
        class="textarea textarea-sm w-full font-mono"
        rows="6"
        @change="apply"
      />
      <p class="text-xs opacity-70">{{ $t('gpnUpstreamGrammar') }}</p>
    </div>
  </DialogWrapper>

  <DialogWrapper
    v-model="probeDialog"
    :title="$t('gpnResolveTest')"
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
          {{ $t('gpnResolveRun') }}
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
          <div class="setting-item-label">{{ $t('gpnVerdict') }}</div>
          <span class="badge badge-sm">
            {{ explanation.verdict.verdict || '—' }} / {{ explanation.verdict.reason || '—' }}
          </span>
        </div>
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('gpnDecidedBy') }}</div>
          <span>{{ decidedBy }}</span>
        </div>
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('gpnClientAnswer') }}</div>
          <span class="font-mono text-xs">{{ (explanation.answers ?? []).join(', ') || '—' }}</span>
        </div>
        <!-- 客户端答案与源站答案在被引导的名字上必然不同,只看前者会读成
             「DNS 坏了」。 -->
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('gpnOriginAnswer') }}</div>
          <span class="font-mono text-xs">{{ (explanation.origin ?? []).join(', ') || '—' }}</span>
        </div>
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('gpnUpstreamAdopted') }}</div>
          <span
            >{{ explanation.upstream || '—'
            }}{{ explanation.cacheHit ? ` (${$t('gpnCacheHit')})` : '' }}</span
          >
        </div>
        <div class="setting-item">
          <div class="setting-item-label">{{ $t('gpnRcode') }}</div>
          <span>{{ explanation.rcode }}</span>
        </div>
      </div>
    </div>
  </DialogWrapper>
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
  refreshDns,
  saveDns,
} from '@/assembly/gpn/dns'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import { useHasAnyVisibleSetting } from '@/composables/settings'
import { useTooltip } from '@/helper/tooltip'
import { getAllKeysForCategory, GPN_DNS_ITEM_KEYS } from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import {
  MagnifyingGlassIcon,
  PencilSquareIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { showTip } = useTooltip()
const k = GPN_DNS_ITEM_KEYS
const hasVisibleItems = useHasAnyVisibleSetting(getAllKeysForCategory(SETTINGS_MENU_KEY.gpnDns))

const FALLBACK_HINT: Record<string, string> = {
  auto: 'gpnFallbackAutoHint',
  direct: 'gpnFallbackDirectHint',
  gateway: 'gpnFallbackGatewayHint',
}

const draft = ref<GpnDnsDocument | null>(null)
const notice = ref('')
const noticeIsError = ref(false)
const probeName = ref('')

const rulesDialog = ref(false)
const subsDialog = ref(false)
const chinaDialog = ref(false)
const trustDialog = ref(false)
const probeDialog = ref(false)

// 草稿是深拷贝。直接改 store 里的文档会让「取消」无处可退,也会在保存失败时
// 留下一份界面上已生效、后端并不知道的策略。
const clone = (doc: GpnDnsDocument): GpnDnsDocument => JSON.parse(JSON.stringify(doc))

const reset = () => {
  draft.value = dnsDocument.value ? clone(dnsDocument.value) : null
  notice.value = ''
}

watch(dnsDocument, reset, { immediate: true })

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

// 订阅规则连同它在整份列表里的位置一起给出:顺序是策略语义的一部分,而这个
// 对话框只筛出其中一类,不改变它们之间的先后。
const subscriptionRules = computed(() =>
  (draft.value?.policy.rules ?? [])
    .map((rule, index) => ({ rule, index }))
    .filter((entry) => entry.rule.kind === 'subscription'),
)

const failedSubscriptions = computed(
  () => dnsSubscriptions.value.filter((s) => Boolean(s.error)).length,
)

// 和核心 DefaultSubscriptionRules 同一份地址与格式。两处描述同一个「默认」,
// 写成两份迟早会各说各话 —— 这一份是给已经有文档、因此拿不到种子的网关的。
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
    // 按 URL 判重,不按 ID:运维者可能自己加过同一份表,再加一条只会让两条规则
    // 抓同一个地址。
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
  apply()
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
  apply()
}

const move = (index: number, delta: number) => {
  const rules = draft.value?.policy.rules
  if (!rules) return
  const target = index + delta
  if (target < 0 || target >= rules.length) return
  const [item] = rules.splice(index, 1)
  rules.splice(target, 0, item)
  apply()
}

const removeRule = (index: number) => {
  draft.value?.policy.rules.splice(index, 1)
  apply()
}

// 规则 ID 由客户端铸造,因为它同时是订阅缓存文件名;服务端只要求它是路径安全的。
//
// A new rule is not applied on creation: it has an empty value, which the core
// would refuse, and reporting that as an error to someone who has just pressed
// "add" is telling them off for a step they are in the middle of. It writes when
// the value changes.
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

// Every row writes when it changes, and there is no save button, because that
// is what a zashboard settings row that writes to the backend does --
// BackendPortsGrid patches /configs on @change, and the tun / allow-lan toggles
// beside it do the same. A save bar here was this panel inventing a second
// interaction model for the same job.
//
// @change rather than the model updating: on an <input> it fires on blur or
// Enter, so typing an address does not send a request per keystroke. Add,
// remove and reorder call this directly, because those have no blur to wait for.
const apply = async () => {
  if (!draft.value) return
  const error = await saveDns(draft.value)
  noticeIsError.value = Boolean(error)
  // Silence on success. A settings row that announces every accepted change is
  // noise; what an operator needs to see is the one that was refused.
  notice.value = error === 'conflict' ? t('gpnConflict') : error
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

refreshDns()
</script>
