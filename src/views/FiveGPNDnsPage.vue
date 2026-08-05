<template>
  <div class="relative size-full overflow-x-hidden">
    <div
      class="flex flex-col gap-3 p-3"
      :style="padding"
    >
      <!-- A missing engine does not mean DNS is disabled. Disabled means a successfully loaded
           document says so; missing means the document could not be loaded. Rendering both states
           alike would tell the operator that policy is active when nothing reads it. -->
      <div
        v-if="dnsStatus === 'absent'"
        class="alert alert-warning"
      >
        <span>{{ $t('fivegpnDnsAbsent') }}</span>
      </div>
      <div
        v-else-if="dnsStatus === 'error'"
        class="alert alert-error"
      >
        <span>{{ dnsError }}</span>
      </div>

      <!-- Only query logs remain on this page. Policy, upstreams, and diagnostics are configuration
           and live with other configuration in the DNS section of Settings; their previous split
           across two locations was accidental. Logs are a read-only stream rather than a draft to
           save, so they remain here. -->
      <div class="base-container flex flex-col gap-2 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium">{{ $t('fivegpnTabQueryLog') }}</span>
          <input
            v-model="queryLogFilter"
            class="input input-sm w-64"
            :placeholder="$t('fivegpnQueryLogFilter')"
            @keyup.enter="refreshQueryLog"
          />
          <button
            class="btn btn-sm"
            @click="refreshQueryLog"
          >
            {{ $t('fivegpnInterceptionRefresh') }}
          </button>
          <span class="text-xs opacity-70">{{ $t('fivegpnQueryLogWindow') }}</span>
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
                <th>{{ $t('fivegpnLogTime') }}</th>
                <th>{{ $t('fivegpnLogName') }}</th>
                <th>{{ $t('fivegpnLogType') }}</th>
                <th>{{ $t('fivegpnVerdict') }}</th>
                <th>{{ $t('fivegpnUpstreamAdopted') }}</th>
                <th>{{ $t('fivegpnLogAnswer') }}</th>
                <th>{{ $t('fivegpnLogDuration') }}</th>
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
                <td>{{ entry.upstream || (entry.cacheHit ? $t('fivegpnCacheHit') : '—') }}</td>
                <td class="font-mono text-xs">{{ (entry.ips ?? []).join(', ') }}</td>
                <td class="whitespace-nowrap">{{ entry.durationMs.toFixed(1) }} ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  dnsError,
  dnsStatus,
  queryLog,
  queryLogError,
  queryLogFilter,
  refreshDns,
  refreshQueryLog,
} from '@/assembly/fivegpn/dns'
import { usePaddingForViews } from '@/composables/paddingViews'

const { padding } = usePaddingForViews({ offsetTop: 12, offsetBottom: 8 })

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

// The log is served beside the document, and dnsStatus is what the absent/error
// alerts above read. Refreshing the document here keeps this page honest about
// the engine even though it no longer edits it.
refreshDns()
refreshQueryLog()
</script>
