<template>
  <article class="p-3 text-sm">
    <button
      type="button"
      class="hover:bg-base-200/40 grid w-full grid-cols-1 gap-2 rounded-md p-1 text-left transition-colors md:grid-cols-[minmax(8rem,0.8fr)_6rem_minmax(8rem,1fr)_minmax(0,3fr)] md:gap-3"
      :aria-expanded="expanded"
      :aria-controls="detailsID"
      :aria-label="$t(expanded ? 'fivegpnPluginLogCollapse' : 'fivegpnPluginLogExpand')"
      @click="$emit('toggle', entry.seq)"
    >
      <time class="text-caption opacity-60">{{ displayTime }}</time>
      <span
        class="badge badge-sm"
        :class="levelClass"
        >{{ entry.level }}</span
      >
      <span class="truncate font-medium">{{ entry.extension || entry.source }}</span>
      <span class="truncate">{{ entry.message }}</span>
    </button>

    <div
      v-if="expanded"
      :id="detailsID"
      class="border-base-300 mt-3 flex flex-col gap-3 border-t pt-3"
    >
      <p class="whitespace-pre-wrap break-words">{{ entry.message }}</p>
      <dl class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2 text-caption">
        <dt class="opacity-60">{{ $t('fivegpnLogTime') }}</dt>
        <dd class="break-all">{{ entry.time }}</dd>
        <dt class="opacity-60">{{ $t('fivegpnLogLevel') }}</dt>
        <dd>{{ entry.level }}</dd>
        <dt class="opacity-60">{{ $t('fivegpnPluginLogSource') }}</dt>
        <dd>{{ entry.source }}</dd>
        <template v-if="entry.extension">
          <dt class="opacity-60">{{ $t('fivegpnLogExtension') }}</dt>
          <dd class="break-all">{{ entry.extension }}</dd>
        </template>
        <template v-if="entry.action">
          <dt class="opacity-60">{{ $t('fivegpnLogAction') }}</dt>
          <dd class="break-all">{{ entry.action }}</dd>
        </template>
        <template v-if="entry.phase">
          <dt class="opacity-60">{{ $t('fivegpnPluginLogPhase') }}</dt>
          <dd>{{ entry.phase }}</dd>
        </template>
        <template v-if="entry.duration_ms !== undefined">
          <dt class="opacity-60">{{ $t('fivegpnPluginLogDuration') }}</dt>
          <dd>{{ entry.duration_ms }} ms</dd>
        </template>
        <template v-if="entry.url">
          <dt class="opacity-60">URL</dt>
          <dd class="break-all">{{ entry.url }}</dd>
        </template>
        <template v-if="entry.script_digest">
          <dt class="opacity-60">{{ $t('fivegpnPluginLogScriptDigest') }}</dt>
          <dd class="break-all font-mono">{{ entry.script_digest }}</dd>
        </template>
        <dt class="opacity-60">{{ $t('fivegpnPluginLogSequence') }}</dt>
        <dd class="break-all font-mono">{{ entry.seq }}</dd>
      </dl>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { FiveGPNEngineLog } from '@/api/fivegpn'
import { computed } from 'vue'

const props = defineProps<{
  entry: FiveGPNEngineLog
  expanded: boolean
}>()

defineEmits<{
  toggle: [seq: string]
}>()

const detailsID = computed(() => `fivegpn-plugin-log-${props.entry.seq}`)
const displayTime = computed(() => new Date(props.entry.time).toLocaleTimeString())
const levelClass = computed(() => {
  if (props.entry.level === 'error') return 'badge-error'
  if (props.entry.level === 'warn') return 'badge-warning'
  return 'badge-ghost'
})
</script>
