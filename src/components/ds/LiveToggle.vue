<template>
  <button
    type="button"
    class="btn btn-sm"
    :class="paused ? 'btn-warning' : 'btn-ghost'"
    :aria-pressed="paused"
    @click="$emit('update:paused', !paused)"
  >
    {{ paused ? resumeLabel : pauseLabel }}
    <span
      v-if="paused && buffered > 0"
      class="badge badge-sm"
    >
      {{ buffered }}
    </span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  paused: boolean
  buffered: number
  pauseLabel: string
  resumeLabel: string
}>()

defineEmits<{
  'update:paused': [value: boolean]
}>()
</script>
