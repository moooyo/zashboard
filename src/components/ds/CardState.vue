<template>
  <div>
    <div
      v-if="status === 'absent'"
      class="alert alert-warning py-2"
      role="status"
    >
      <span>{{ absentMessage }}</span>
    </div>
    <div
      v-else-if="status === 'error'"
      class="alert alert-error flex-wrap py-2"
      role="alert"
    >
      <span class="min-w-0 flex-1">{{ errorMessage }}</span>
      <button
        v-if="retryLabel"
        type="button"
        class="btn btn-sm"
        :disabled="retrying"
        @click="$emit('retry')"
      >
        {{ retryLabel }}
      </button>
    </div>
    <slot v-else-if="ready" />
    <div
      v-else
      class="settings-grid"
      role="status"
      :aria-label="loadingMessage"
    >
      <div
        v-for="row in skeletonRows"
        :key="row"
        class="setting-item"
      >
        <div class="skeleton h-control-sm w-32" />
        <div class="skeleton h-control-sm w-20" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    status: string
    ready: boolean
    loadingMessage: string
    absentMessage: string
    errorMessage: string
    retryLabel?: string
    retrying?: boolean
    skeletonRows?: number
  }>(),
  { skeletonRows: 4 },
)

defineEmits<{
  retry: []
}>()
</script>
