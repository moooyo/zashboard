<template>
  <div
    class="relative size-full overflow-x-hidden"
    :style="padding"
  >
    <div class="flex flex-col gap-3 p-3">
      <div
        v-if="interceptionStatus === 'loading' && !data"
        class="base-container p-4"
      >
        <span class="loading loading-spinner loading-sm" />
      </div>
      <div
        v-else-if="interceptionStatus === 'absent'"
        class="alert alert-warning"
      >
        {{ $t('fivegpnInterceptionAbsent') }}
      </div>
      <div
        v-else-if="interceptionStatus === 'error'"
        class="alert alert-error"
      >
        {{ interceptionError }}
      </div>

      <template v-if="data">
        <section class="base-container flex flex-col gap-3 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <div>
              <h1 class="text-lg font-semibold">{{ $t('fivegpnExtensionHosts') }}</h1>
              <p class="text-caption opacity-70">{{ $t('fivegpnExtensionHostsHint') }}</p>
            </div>
            <button
              class="btn btn-ghost btn-sm ml-auto"
              @click="refreshInterception"
            >
              {{ $t('fivegpnInterceptionRefresh') }}
            </button>
          </div>
          <input
            v-model="query"
            class="input input-bordered w-full"
            :placeholder="$t('fivegpnExtensionHostSearch')"
          />

          <div
            v-if="canonicalQuery"
            class="alert"
            :class="winner?.runtime.ready ? 'alert-info' : 'alert-warning'"
          >
            <template v-if="winner">
              <span>
                {{
                  $t('fivegpnExtensionHostWinner', {
                    host: canonicalQuery,
                    extension: winner.name || winner.id,
                    egress: winner.egress_group,
                  })
                }}
              </span>
              <span
                v-if="!winner.runtime.ready"
                class="badge badge-warning"
                >{{ winner.runtime.phase }}</span
              >
              <span
                v-if="!winner.runtime.ready"
                class="w-full text-sm"
              >
                {{
                  $t('fivegpnExtensionHostBlocked', {
                    phase: winner.runtime.phase,
                    reason: winner.runtime.reason || $t('fivegpnExtensionRuntimeUnavailable'),
                  })
                }}
              </span>
            </template>
            <span v-else>{{ $t('fivegpnExtensionHostNoWinner', { host: canonicalQuery }) }}</span>
          </div>
        </section>

        <section class="base-container overflow-hidden">
          <div class="hidden grid-cols-[4rem_minmax(10rem,1fr)_minmax(12rem,2fr)_minmax(8rem,1fr)_8rem] gap-3 border-b p-3 text-caption font-medium opacity-60 md:grid">
            <span>{{ $t('fivegpnExtensionPriority') }}</span>
            <span>{{ $t('fivegpnLogExtension') }}</span>
            <span>{{ $t('fivegpnCaptureHosts') }}</span>
            <span>{{ $t('fivegpnEgressGroup') }}</span>
            <span>{{ $t('fivegpnExtensionRuntime') }}</span>
          </div>
          <article
            v-for="row in rows"
            :key="row.module.id"
            class="border-base-300 flex flex-col gap-2 border-b p-3 last:border-b-0 md:grid md:grid-cols-[4rem_minmax(10rem,1fr)_minmax(12rem,2fr)_minmax(8rem,1fr)_8rem] md:gap-3"
          >
            <span class="text-caption opacity-60">#{{ row.priority }}</span>
            <div>
              <p class="font-medium">{{ row.module.name || row.module.id }}</p>
              <p class="text-caption opacity-60">{{ row.module.id }}</p>
            </div>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="pattern in row.patterns"
                :key="pattern"
                class="badge badge-ghost font-mono"
                :class="canonicalQuery && capturePatternMatches(pattern, canonicalQuery) && 'badge-info'"
              >
                {{ pattern }}
              </span>
            </div>
            <span
              class="font-mono"
              :class="egressAvailable(row.module.egress_group) ? '' : 'text-error'"
              >{{ row.module.egress_group }}</span
            >
            <span
              class="badge badge-sm"
              :class="row.module.runtime.ready ? 'badge-success' : 'badge-ghost'"
              >{{ row.module.runtime.phase }}</span
            >
          </article>
          <p
            v-if="rows.length === 0"
            class="p-4 text-center text-sm opacity-60"
          >
            {{ $t('noData') }}
          </p>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  interception,
  interceptionError,
  interceptionStatus,
  refreshInterception,
} from '@/assembly/fivegpn/interception'
import { usePaddingForViews } from '@/composables/paddingViews'
import {
  canonicalAuditHost,
  capturePatternMatches,
  extensionEgressWinner,
  orderedExtensionModules,
} from '@/helper/extensionHostAudit'
import { activeBackendSession } from '@/store/setup'
import { computed, onMounted, ref, watch } from 'vue'

const { padding } = usePaddingForViews({ offsetTop: 12, offsetBottom: 8 })
const query = ref('')
const data = computed(() => interception.value)
const canonicalQuery = computed(() => canonicalAuditHost(query.value))
const orderedModules = computed(() =>
  orderedExtensionModules(data.value?.modules ?? [], data.value?.execution_order ?? []),
)
const winner = computed(() =>
  canonicalQuery.value
    ? extensionEgressWinner(
        data.value?.modules ?? [],
        data.value?.execution_order ?? [],
        canonicalQuery.value,
      )
    : undefined,
)
const rows = computed(() => {
  const needle = canonicalQuery.value
  return orderedModules.value
    .map((module, index) => ({
      module,
      priority: index + 1,
      patterns: needle
        ? module.capture_hosts.filter(
            (pattern) =>
              capturePatternMatches(pattern, needle) ||
              pattern.includes(needle) ||
              module.id.includes(needle) ||
              module.name?.toLowerCase().includes(needle),
          )
        : module.capture_hosts,
    }))
    .filter((row) => !needle || row.patterns.length > 0)
})
const egressAvailable = (group: string) =>
  Boolean(group && data.value?.available_egress_groups.includes(group))

onMounted(() => void refreshInterception())
watch(activeBackendSession, (session, previous) => {
  if (session && session.epoch !== previous?.epoch) void refreshInterception()
})
</script>
