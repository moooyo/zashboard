<template>
  <details
    class="border-base-300 bg-base-150 rounded-box overflow-hidden border"
    @toggle="onToggle"
  >
    <summary class="cursor-pointer list-none px-3 py-2">
      <div class="flex min-w-0 items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
            <span class="text-base-content font-semibold">{{ action.id }}</span>
            <span
              class="opacity-40"
              aria-hidden="true"
              >·</span
            >
            <span :title="action.phase">{{ phaseLabel }}</span>
            <span
              class="opacity-40"
              aria-hidden="true"
              >·</span
            >
            <span
              class="badge badge-ghost badge-xs"
              :title="action.kind"
            >
              {{ kindLabel }}
            </span>
            <span
              class="opacity-40"
              aria-hidden="true"
              >·</span
            >
            <span class="opacity-70">{{ gateLabel }}</span>
          </div>
          <code
            class="scrollbar-hidden mt-1 block overflow-x-auto text-xs whitespace-nowrap opacity-70"
            tabindex="0"
          >
            {{ matcher }}
          </code>
        </div>
        <span class="badge badge-ghost badge-sm shrink-0">
          {{ $t('fivegpnActionReviewDetails') }}
        </span>
      </div>
    </summary>

    <div
      v-if="expanded"
      class="border-base-300 flex flex-col gap-3 border-t px-3 py-2 text-xs"
    >
      <dl class="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div class="min-w-0">
          <dt class="opacity-60">{{ $t('fivegpnActionLimits') }}</dt>
          <dd class="font-mono">
            {{ $t('fivegpnActionTimeout', { value: action.timeout_ms }) }} ·
            {{ $t('fivegpnActionBodyLimit', { value: formatBytes(action.max_body_bytes) }) }} ·
            {{ $t('fivegpnActionBodyMode', { value: action.body_mode }) }}
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="opacity-60">{{ $t('fivegpnActionReviewDigest') }}</dt>
          <dd
            class="scrollbar-hidden overflow-x-auto font-mono whitespace-nowrap"
            tabindex="0"
          >
            {{ action.review_digest }}
          </dd>
        </div>
        <div
          v-if="scriptAction"
          class="min-w-0"
        >
          <dt class="opacity-60">{{ $t('fivegpnActionSource') }}</dt>
          <dd class="font-mono">
            {{ scriptAction.entry }} · {{ scriptAction.source_kind }}
            <a
              v-if="safeSourceURL"
              class="link link-primary scrollbar-hidden mt-1 block overflow-x-auto whitespace-nowrap"
              :title="safeSourceURL"
              :href="safeSourceURL"
              target="_blank"
              rel="noopener noreferrer"
              referrerpolicy="no-referrer"
            >
              {{ safeSourceURL }}
            </a>
          </dd>
        </div>
        <div
          v-if="codeAction"
          class="min-w-0"
        >
          <dt class="opacity-60">{{ $t('fivegpnActionCodeEvidence') }}</dt>
          <dd class="font-mono">
            {{ formatBytes(codeAction.code_bytes) }}
            <code
              class="scrollbar-hidden mt-1 block overflow-x-auto whitespace-nowrap"
              :title="codeAction.code_digest"
              tabindex="0"
            >
              {{ codeAction.code_digest }}
            </code>
          </dd>
        </div>
      </dl>

      <div class="border-base-300 flex flex-col gap-2 border-t pt-2">
        <p
          v-if="action.kind === 'script'"
          class="opacity-70"
        >
          {{ $t('fivegpnActionScriptSummary', { entry: action.entry }) }}
        </p>
        <p
          v-else-if="action.kind === 'jq'"
          class="opacity-70"
        >
          {{ $t('fivegpnActionJqSummary') }}
        </p>
        <p
          v-else-if="action.kind === 'reject'"
          class="opacity-70"
        >
          {{ $t('fivegpnActionRejectSummary') }}
        </p>

        <template v-else-if="action.kind === 'mock'">
          <p class="font-mono">
            status={{ action.mock.status }} · body={{ action.mock.body.kind }} ·
            {{ formatBytes(action.mock.body.bytes) }}
          </p>
          <code
            class="scrollbar-hidden overflow-x-auto whitespace-nowrap"
            tabindex="0"
          >
            body.sha256={{ action.mock.body.sha256 }}
          </code>
          <p v-if="mockHeaders.length">
            <span class="opacity-60">{{ $t('fivegpnActionMockHeaders') }}:</span>
            <code class="ml-1 break-all">{{ mockHeaders.join(' · ') }}</code>
          </p>
        </template>

        <template v-else-if="action.kind === 'headers'">
          <p v-if="headerSetEntries.length">
            <span class="opacity-60">{{ $t('fivegpnActionHeadersSet') }}:</span>
            <code class="ml-1 break-all">{{ headerSetEntries.join(' · ') }}</code>
          </p>
          <p v-if="action.headers.remove?.length">
            <span class="opacity-60">{{ $t('fivegpnActionHeadersRemove') }}:</span>
            <code class="ml-1 break-all">{{ action.headers.remove.join(' · ') }}</code>
          </p>
        </template>

        <template v-else-if="action.kind === 'rewrite'">
          <code class="break-all">{{ action.rewrite.pattern }} → {{ action.rewrite.to }}</code>
          <p class="opacity-70">
            {{
              action.rewrite.status === 0
                ? $t('fivegpnActionRewriteInPlace')
                : `status=${action.rewrite.status}`
            }}
          </p>
        </template>

        <template v-else-if="action.kind === 'replace_body'">
          <code class="break-all"
            >{{ action.replace_body.pattern }} → {{ action.replace_body.to }}</code
          >
          <p v-if="valueMapEntries.length">
            <span class="opacity-60">{{ $t('fivegpnActionValueMap') }}:</span>
            <code class="ml-1 break-all">{{ valueMapEntries.join(' · ') }}</code>
          </p>
        </template>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import type {
  FiveGPNActionReview,
  FiveGPNJQActionReview,
  FiveGPNScriptActionReview,
} from '@/api/fivegpn'
import { compactReviewActionMatcher } from '@/helper/fivegpnExtensionReview'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ action: FiveGPNActionReview }>()
const { locale, t } = useI18n()
const expanded = ref(false)
const onToggle = (event: Event) => {
  expanded.value = (event.currentTarget as HTMLDetailsElement).open
}

const matcher = computed(() => compactReviewActionMatcher(props.action))
const phaseLabel = computed(() =>
  t(props.action.phase === 'request' ? 'fivegpnActionPhaseRequest' : 'fivegpnActionPhaseResponse'),
)
const kindLabel = computed(() =>
  t(
    {
      script: 'fivegpnActionKindScript',
      jq: 'fivegpnActionKindJq',
      reject: 'fivegpnActionKindReject',
      mock: 'fivegpnActionKindMock',
      headers: 'fivegpnActionKindHeaders',
      rewrite: 'fivegpnActionKindRewrite',
      replace_body: 'fivegpnActionKindReplaceBody',
    }[props.action.kind],
  ),
)
const gateLabel = computed(() =>
  props.action.enabled_when
    ? `${props.action.enabled_when.key}=${props.action.enabled_when.equals}`
    : t('fivegpnActionGateAlways'),
)
const scriptAction = computed<FiveGPNScriptActionReview | null>(() =>
  props.action.kind === 'script' ? props.action : null,
)
const safeSourceURL = computed(() => {
  const raw = scriptAction.value?.source_url
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : ''
  } catch {
    return ''
  }
})
const codeAction = computed<FiveGPNScriptActionReview | FiveGPNJQActionReview | null>(() =>
  props.action.kind === 'script' || props.action.kind === 'jq' ? props.action : null,
)
const mockHeaders = computed(() =>
  props.action.kind === 'mock'
    ? Object.entries(props.action.mock.headers ?? {}).map(([name, value]) => `${name}=${value}`)
    : [],
)
const headerSetEntries = computed(() =>
  props.action.kind === 'headers'
    ? Object.entries(props.action.headers.set ?? {}).map(([name, value]) => `${name}=${value}`)
    : [],
)
const valueMapEntries = computed(() =>
  props.action.kind === 'replace_body'
    ? Object.entries(props.action.replace_body.value_map ?? {}).flatMap(([key, values]) =>
        Object.entries(values).map(([value, replacement]) => `${key}[${value}]=${replacement}`),
      )
    : [],
)
const formatBytes = (value: number) => `${new Intl.NumberFormat(locale.value).format(value)} B`
</script>
