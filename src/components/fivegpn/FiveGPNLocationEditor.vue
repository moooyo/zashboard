<template>
  <div class="flex flex-col gap-2">
    <div
      ref="mapElement"
      class="coordinate-map border-base-300 bg-base-200 text-base-content focus-visible:ring-primary relative cursor-crosshair overflow-hidden border outline-none focus-visible:ring-2"
      :class="disabled && 'cursor-default opacity-60'"
      role="group"
      :tabindex="disabled ? -1 : 0"
      :aria-disabled="disabled"
      :aria-label="$t('fivegpnLocationMap')"
      @pointerdown="pickPoint"
      @keydown="movePoint"
    >
      <svg
        class="size-full"
        viewBox="0 0 720 360"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <rect
          class="fill-base-200"
          width="720"
          height="360"
        />
        <g
          class="stroke-base-content"
          fill="none"
          opacity="0.13"
          stroke-width="1"
        >
          <path
            v-for="x in [120, 240, 360, 480, 600]"
            :key="`x-${x}`"
            :d="`M ${x} 0 V 360`"
          />
          <path
            v-for="y in [60, 120, 180, 240, 300]"
            :key="`y-${y}`"
            :d="`M 0 ${y} H 720`"
          />
        </g>
        <!-- A deliberately quiet local world silhouette keeps coordinate picking useful without
             adding a remote tile provider, tracking request, or another trust boundary. -->
        <g
          class="fill-base-content"
          opacity="0.12"
        >
          <path d="M52 89 93 54l70 4 43 29-8 36-36 20-24 47-30-6-13-43-38-17Z" />
          <path d="m177 191 38 17 18 43-14 73-28 25-17-52-20-37Z" />
          <path
            d="m307 79 43-25 58 11 22 29 50-20 89 12 65 45-28 31-73-7-39 25-31-18-39 20-36-22-29-45-48-8Z"
          />
          <path d="m360 180 58-4 36 40-16 86-38 43-31-43-15-67Z" />
          <path d="m565 252 54-23 50 23-7 51-53 18-42-32Z" />
          <path d="m657 123 18-9 20 14-8 17-24 2Z" />
        </g>
        <g v-if="hasCoordinates">
          <line
            class="stroke-primary"
            :x1="markerX"
            :x2="markerX"
            y1="0"
            y2="360"
            opacity="0.32"
          />
          <line
            class="stroke-primary"
            x1="0"
            x2="720"
            :y1="markerY"
            :y2="markerY"
            opacity="0.32"
          />
          <circle
            class="fill-primary stroke-base-100"
            :cx="markerX"
            :cy="markerY"
            r="8"
            stroke-width="4"
          />
        </g>
      </svg>
      <span class="bg-base-100/80 absolute bottom-2 left-2 px-2 py-1 font-mono text-xs">
        {{ coordinateText }}
      </span>
    </div>

    <div class="grid grid-cols-1 gap-2 md:grid-cols-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs opacity-70">{{ $t('fivegpnLongitude') }}</span>
        <input
          class="input input-sm w-full font-mono"
          type="number"
          min="-180"
          max="180"
          step="any"
          :disabled="disabled"
          :value="longitude ?? ''"
          @input="setLongitude"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs opacity-70">{{ $t('fivegpnLatitude') }}</span>
        <input
          class="input input-sm w-full font-mono"
          type="number"
          min="-90"
          max="90"
          step="any"
          :disabled="disabled"
          :value="latitude ?? ''"
          @input="setLatitude"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs opacity-70">{{ $t('fivegpnAccuracyMetres') }}</span>
        <input
          class="input input-sm w-full font-mono"
          type="number"
          min="1"
          max="100000"
          step="1"
          :disabled="disabled"
          :value="accuracy || ''"
          @input="setAccuracy"
        />
      </label>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs opacity-60">{{ $t('fivegpnLocationHint') }}</p>
      <button
        class="btn btn-ghost btn-xs"
        type="button"
        :disabled="disabled"
        @click="$emit('update:modelValue', null)"
      >
        {{ $t('fivegpnClearLocation') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FiveGPNLocationValue } from '@/api/fivegpn'
import { computed, ref } from 'vue'

const props = defineProps<{
  modelValue?: FiveGPNLocationValue | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FiveGPNLocationValue | null]
}>()

const mapElement = ref<HTMLElement>()
const longitude = computed(() => props.modelValue?.longitude)
const latitude = computed(() => props.modelValue?.latitude)
const accuracy = computed(() => props.modelValue?.accuracy ?? 25)
const hasCoordinates = computed(
  () => Number.isFinite(longitude.value) && Number.isFinite(latitude.value),
)
const markerX = computed(() => (((longitude.value ?? 0) + 180) / 360) * 720)
const markerY = computed(() => ((90 - (latitude.value ?? 0)) / 180) * 360)
const coordinateText = computed(() =>
  hasCoordinates.value ? `${longitude.value!.toFixed(6)}, ${latitude.value!.toFixed(6)}` : '—, —',
)

const emitCoordinates = (
  nextLongitude?: number,
  nextLatitude?: number,
  nextAccuracy = accuracy.value,
) =>
  emit('update:modelValue', {
    longitude: nextLongitude,
    latitude: nextLatitude,
    accuracy: nextAccuracy,
  })

const parsedInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value
  if (value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const setLongitude = (event: Event) =>
  emitCoordinates(parsedInput(event), latitude.value, accuracy.value)
const setLatitude = (event: Event) =>
  emitCoordinates(longitude.value, parsedInput(event), accuracy.value)
const setAccuracy = (event: Event) =>
  emitCoordinates(longitude.value, latitude.value, parsedInput(event) ?? 0)

const pickPoint = (event: PointerEvent) => {
  if (props.disabled) return
  const bounds = mapElement.value?.getBoundingClientRect()
  if (!bounds || bounds.width === 0 || bounds.height === 0) return
  const x = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width)
  const y = Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height)
  const nextLongitude = Number(((x / bounds.width) * 360 - 180).toFixed(6))
  const nextLatitude = Number((90 - (y / bounds.height) * 180).toFixed(6))
  emitCoordinates(nextLongitude, nextLatitude, accuracy.value || 25)
}

const movePoint = (event: KeyboardEvent) => {
  if (props.disabled) return
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const step = event.shiftKey ? 1 : 0.1
  const currentLongitude = longitude.value ?? 0
  const currentLatitude = latitude.value ?? 0
  const nextLongitude = Math.min(
    180,
    Math.max(
      -180,
      currentLongitude +
        (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
    ),
  )
  const nextLatitude = Math.min(
    90,
    Math.max(
      -90,
      currentLatitude + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
    ),
  )
  emitCoordinates(Number(nextLongitude.toFixed(6)), Number(nextLatitude.toFixed(6)), accuracy.value)
}
</script>

<style scoped>
.coordinate-map {
  aspect-ratio: 2 / 1;
}
</style>
