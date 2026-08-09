<template>
  <LogSurface>
    <template #controls>
      <div class="flex flex-col gap-2 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-lg font-semibold">{{ $t('fivegpnPluginLogs') }}</h1>
          <span class="text-caption opacity-60">{{ $t('fivegpnPluginLogsMemoryOnly') }}</span>
          <div class="ml-auto flex items-center gap-2">
            <LiveToggle
              :paused="pluginLogsPaused"
              :buffered="pluginLogBufferedCount"
              :pause-label="$t('fivegpnPluginLogsPause')"
              :resume-label="$t('fivegpnPluginLogsResume')"
              @update:paused="setPluginLogsPaused"
            />
            <button
              class="btn btn-ghost btn-sm"
              @click="refreshPluginLogs"
            >
              {{ $t('fivegpnInterceptionRefresh') }}
            </button>
            <button
              class="btn btn-ghost btn-sm"
              @click="clearPluginLogView"
            >
              {{ $t('fivegpnPluginLogsClear') }}
            </button>
            <button
              v-if="pluginLogCanUndoClear"
              class="btn btn-ghost btn-sm"
              @click="undoPluginLogClear"
            >
              {{ $t('fivegpnPluginLogsUndo') }}
            </button>
          </div>
        </div>

        <p
          v-if="pluginLogsPaused"
          class="text-caption text-warning"
        >
          {{
            $t(
              pluginLogPausedStreamChanged
                ? 'fivegpnPluginLogsPausedAfterReset'
                : 'fivegpnPluginLogsPausedHint',
              { count: pluginLogBufferedCount },
            )
          }}
        </p>

        <div
          v-if="pluginLogStreamReset"
          class="alert alert-info py-2"
        >
          {{ $t('fivegpnPluginLogsStreamReset') }}
        </div>
        <div
          v-if="pluginLogDropped !== '0'"
          class="alert alert-warning py-2"
        >
          {{ $t('fivegpnPluginLogsDropped', { count: pluginLogDropped }) }}
        </div>

        <div class="hidden gap-2 md:flex">
          <input
            v-model="pluginLogSearchInput"
            class="input input-sm min-w-0 flex-1"
            :placeholder="$t('fivegpnLogSearch')"
          />
          <select
            v-model="pluginLogExtension"
            class="select select-sm w-48"
          >
            <option value="">{{ $t('fivegpnLogAllExtensions') }}</option>
            <option
              v-for="extension in pluginLogExtensions"
              :key="extension"
              :value="extension"
            >
              {{ extension }}
            </option>
          </select>
          <select
            v-model="pluginLogLevel"
            class="select select-sm w-32"
          >
            <option value="">{{ $t('fivegpnLogAllLevels') }}</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </div>

        <div class="flex flex-wrap items-center gap-2 md:hidden">
          <button
            class="btn btn-ghost btn-sm"
            @click="filtersOpen = true"
          >
            {{ $t('fivegpnPluginLogsFilters') }}
          </button>
          <span
            v-if="pluginLogSearchInput"
            class="badge badge-ghost"
            >{{ pluginLogSearchInput }}</span
          >
          <span
            v-if="pluginLogExtension"
            class="badge badge-ghost"
            >{{ pluginLogExtension }}</span
          >
          <span
            v-if="pluginLogLevel"
            class="badge badge-ghost"
            >{{ pluginLogLevel }}</span
          >
        </div>
      </div>
    </template>

    <div
      v-if="pluginLogError"
      class="alert alert-error m-3"
    >
      <span>{{ pluginLogError }}</span>
    </div>
    <VirtualScroller
      v-else
      :data="visiblePluginLogs"
      :size="72"
      content-class="overflow-hidden"
    >
      <template v-slot="{ item }: { item: FiveGPNEngineLog }">
        <FiveGPNPluginLogRow
          :entry="item"
          :expanded="expandedStreamID === pluginLogDisplayStreamID && expandedSeq === item.seq"
          @toggle="toggleRow"
        />
      </template>
    </VirtualScroller>
  </LogSurface>

  <div
    v-if="filtersOpen"
    class="bg-neutral/30 fixed inset-0 z-50 flex items-end md:hidden"
    @click.self="filtersOpen = false"
  >
    <section class="bg-base-100 w-full rounded-t-box p-4 shadow-xl">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-semibold">{{ $t('fivegpnPluginLogsFilters') }}</h2>
        <button
          class="btn btn-ghost btn-sm"
          @click="filtersOpen = false"
        >
          {{ $t('fivegpnDone') }}
        </button>
      </div>
      <div class="flex flex-col gap-3">
        <input
          v-model="pluginLogSearchInput"
          class="input input-bordered w-full"
          :placeholder="$t('fivegpnLogSearch')"
        />
        <select
          v-model="pluginLogExtension"
          class="select select-bordered w-full"
        >
          <option value="">{{ $t('fivegpnLogAllExtensions') }}</option>
          <option
            v-for="extension in pluginLogExtensions"
            :key="extension"
            :value="extension"
          >
            {{ extension }}
          </option>
        </select>
        <select
          v-model="pluginLogLevel"
          class="select select-bordered w-full"
        >
          <option value="">{{ $t('fivegpnLogAllLevels') }}</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { FiveGPNEngineLog } from '@/api/fivegpn'
import {
  clearPluginLogView,
  pluginLogBufferedCount,
  pluginLogCanUndoClear,
  pluginLogDisplayStreamID,
  pluginLogError,
  pluginLogDropped,
  pluginLogExtension,
  pluginLogExtensions,
  pluginLogLevel,
  pluginLogPausedStreamChanged,
  pluginLogSearchInput,
  pluginLogsPaused,
  pluginLogStreamReset,
  refreshPluginLogs,
  setPluginLogsPaused,
  startPluginLogPolling,
  stopPluginLogPolling,
  undoPluginLogClear,
  visiblePluginLogs,
} from '@/assembly/fivegpn/pluginLogs'
import VirtualScroller from '@/components/common/VirtualScroller.vue'
import LogSurface from '@/components/ds/LogSurface.vue'
import LiveToggle from '@/components/ds/LiveToggle.vue'
import FiveGPNPluginLogRow from '@/components/fivegpn/FiveGPNPluginLogRow.vue'
import { toggleExpandedPluginLog } from '@/helper/pluginLogState'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const filtersOpen = ref(false)
const expandedSeq = ref('')
const expandedStreamID = ref('')

const clearExpandedRow = () => {
  expandedSeq.value = ''
  expandedStreamID.value = ''
}
const toggleRow = (seq: string) => {
  const next = toggleExpandedPluginLog(expandedSeq.value, seq)
  expandedSeq.value = next
  expandedStreamID.value = next ? pluginLogDisplayStreamID.value : ''
}

watch(pluginLogDisplayStreamID, (stream, previous) => {
  if (stream !== previous) clearExpandedRow()
})
watch(visiblePluginLogs, (entries) => {
  if (expandedSeq.value && !entries.some((entry) => entry.seq === expandedSeq.value)) {
    clearExpandedRow()
  }
})

onMounted(startPluginLogPolling)
onUnmounted(stopPluginLogPolling)
</script>
