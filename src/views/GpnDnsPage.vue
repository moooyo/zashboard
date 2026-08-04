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

      <!-- 这一页只剩查询日志。策略、上游与诊断是配置,它们和其它配置一起住在
           设置页的「DNS」分区里 —— 分散在两个地方是原来的样子,不是有意的。
           日志是一份读取出来的流水,不是一份要保存的草稿,所以它留在这里。 -->
      <div class="base-container flex flex-col gap-2 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium">{{ $t('gpnTabQueryLog') }}</span>
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
} from '@/assembly/gpn/dns'
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
