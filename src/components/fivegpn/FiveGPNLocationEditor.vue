<template>
  <div class="flex flex-col gap-3">
    <div
      class="flex flex-col gap-1"
      role="search"
    >
      <label
        class="text-xs font-medium"
        :for="searchInputId"
      >
        {{ $t('fivegpnLocationSearchLabel') }}
      </label>
      <div class="flex gap-2">
        <input
          :id="searchInputId"
          v-model="searchQuery"
          class="input input-sm min-w-0 flex-1"
          type="search"
          autocomplete="off"
          maxlength="128"
          :placeholder="$t('fivegpnLocationSearchPlaceholder')"
          :disabled="disabled"
          :readonly="searching"
          :aria-busy="searching"
          @input="clearSearchValidation"
          @keydown.enter="submitSearchFromKeyboard"
        />
        <button
          class="btn btn-primary btn-sm shrink-0"
          :class="searching && 'btn-disabled'"
          type="button"
          :disabled="disabled || !searchQuery.trim()"
          :aria-disabled="searching"
          @click="searchLocations"
        >
          <span
            v-if="searching"
            class="loading loading-spinner loading-xs"
            aria-hidden="true"
          />
          {{ $t('fivegpnLocationSearchAction') }}
        </button>
      </div>
      <p class="text-xs opacity-60">
        {{ $t('fivegpnLocationSearchDisclosure') }}
      </p>
    </div>

    <p
      v-if="searching"
      class="text-xs opacity-70"
      role="status"
    >
      {{ $t('fivegpnLocationSearching') }}
    </p>
    <div
      v-else-if="searchError"
      class="alert alert-error py-2 text-sm"
      role="alert"
    >
      <span>{{ searchErrorMessage }}</span>
    </div>
    <p
      v-else-if="searchSubmitted && searchResults.length === 0"
      class="text-xs opacity-70"
      role="status"
    >
      {{ $t('fivegpnLocationSearchEmpty') }}
    </p>
    <p
      v-else-if="searchSubmitted && searchResults.length > 0"
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ $t('fivegpnLocationSearchResultCount', { count: searchResults.length }) }}
    </p>

    <ul
      v-if="searchResults.length"
      class="border-base-300 bg-base-100 divide-base-300 rounded-box divide-y overflow-hidden border"
      :aria-label="$t('fivegpnLocationSearchResults')"
    >
      <li
        v-for="result in searchResults"
        :key="`${result.latitude}:${result.longitude}:${result.label}`"
      >
        <button
          class="hover:bg-base-200 focus-visible:ring-primary focus-visible:bg-base-200 flex w-full flex-col items-start gap-1 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset md:flex-row md:items-center md:justify-between md:gap-3"
          type="button"
          :disabled="disabled"
          @click="selectSearchResult(result)"
        >
          <span class="min-w-0 flex-1 text-sm font-medium break-words">{{ result.label }}</span>
          <span class="shrink-0 font-mono text-xs opacity-60">
            {{ formatCoordinates(result.longitude, result.latitude) }}
          </span>
        </button>
      </li>
    </ul>

    <div class="border-base-300 bg-base-200 rounded-box relative isolate overflow-hidden border">
      <div
        ref="mapElement"
        class="location-map relative z-0 h-72 w-full md:h-80"
        role="group"
        :tabindex="disabled ? -1 : 0"
        :aria-label="$t('fivegpnLocationMap')"
        :aria-disabled="disabled"
        :aria-busy="mapLoading"
      />
      <div
        v-if="mapLoading"
        class="bg-base-100/90 rounded-field pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-2 px-2 py-1 text-xs shadow-sm"
        role="status"
      >
        <span
          class="loading loading-spinner loading-xs"
          aria-hidden="true"
        />
        {{ $t('fivegpnLocationMapLoading') }}
      </div>
    </div>

    <div
      v-if="mapError"
      class="alert alert-warning flex flex-col items-stretch gap-2 py-2 text-sm md:flex-row md:items-center"
      role="alert"
    >
      <span class="min-w-0 flex-1">{{ mapErrorMessage }}</span>
      <button
        class="btn btn-sm shrink-0 self-end md:self-auto"
        type="button"
        :disabled="disabled || mapLoading"
        @click="retryMap"
      >
        {{ $t('fivegpnLocationRetryMap') }}
      </button>
    </div>

    <div
      v-if="outsideMapRange"
      class="alert alert-warning py-2 text-sm"
      role="status"
    >
      <span>{{ $t('fivegpnLocationMapRangeWarning') }}</span>
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
          :value="accuracy ?? ''"
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
import {
  searchInterceptionLocationAPI,
  type FiveGPNLocationSearchResult,
  type FiveGPNLocationValue,
} from '@/api/fivegpn'
import { responseStatus } from '@/api/response'
import {
  hasVisibleMapIntersection,
  locationSearchQueryTooLong,
  tileBatchHasFailure,
} from '@/helper/fivegpnLocation'
import { backendSessionIsCurrent, captureBackendSession } from '@/store/setup'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const WEB_MERCATOR_MAX_LATITUDE = 85.0511287798066
const WEB_MERCATOR_EMIT_MAX_LATITUDE = 85.051128
const DEFAULT_ACCURACY = 25
const TILE_LOAD_TIMEOUT = 15000

const props = defineProps<{
  modelValue?: FiveGPNLocationValue | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FiveGPNLocationValue | null]
}>()

const { locale, t } = useI18n()
const searchInputId = `fivegpn-location-search-${useId()}`
const mapElement = ref<HTMLElement>()
const searchQuery = ref('')
const searchResults = ref<FiveGPNLocationSearchResult[]>([])
const searchSubmitted = ref(false)
const searching = ref(false)
const searchError = ref<'generic' | 'rate-limit' | 'too-long' | ''>('')
const mapLoading = ref(true)
const mapError = ref<'runtime' | 'tiles' | ''>('')

let leaflet: typeof import('leaflet') | undefined
let map: import('leaflet').Map | undefined
let tileLayer: import('leaflet').TileLayer | undefined
let marker: import('leaflet').Marker | undefined
let accuracyCircle: import('leaflet').Circle | undefined
let zoomControl: import('leaflet').Control.Zoom | undefined
let zoomControlAttached = false
let resizeObserver: ResizeObserver | undefined
let visibilityObserver: IntersectionObserver | undefined
let searchController: AbortController | undefined
let tileLoadTimer: number | undefined
let initializeGeneration = 0
let preserveSearchViewport = false
let unmounted = false

const longitude = computed(() => props.modelValue?.longitude)
const latitude = computed(() => props.modelValue?.latitude)
const accuracy = computed(() => props.modelValue?.accuracy ?? DEFAULT_ACCURACY)
const hasCoordinates = computed(
  () => Number.isFinite(longitude.value) && Number.isFinite(latitude.value),
)
const canPlotCoordinates = computed(
  () =>
    hasCoordinates.value &&
    Math.abs(latitude.value!) <= WEB_MERCATOR_MAX_LATITUDE &&
    longitude.value! >= -180 &&
    longitude.value! <= 180,
)
const outsideMapRange = computed(
  () => Number.isFinite(latitude.value) && Math.abs(latitude.value!) > WEB_MERCATOR_MAX_LATITUDE,
)
const mapErrorMessage = computed(() =>
  t(mapError.value === 'tiles' ? 'fivegpnLocationTilesError' : 'fivegpnLocationMapLoadError'),
)
const searchErrorMessage = computed(() =>
  t(
    searchError.value === 'rate-limit'
      ? 'fivegpnLocationSearchRateLimited'
      : searchError.value === 'too-long'
        ? 'fivegpnLocationSearchTooLong'
        : 'fivegpnLocationSearchError',
  ),
)

const formatCoordinates = (nextLongitude: number, nextLatitude: number) =>
  `${nextLongitude.toFixed(6)}, ${nextLatitude.toFixed(6)}`

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

const validSearchResult = (value: unknown): value is FiveGPNLocationSearchResult => {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<FiveGPNLocationSearchResult>
  const bounds = result.bounding_box
  return (
    typeof result.label === 'string' &&
    result.label.trim().length > 0 &&
    Number.isFinite(result.latitude) &&
    Math.abs(result.latitude!) <= 90 &&
    Number.isFinite(result.longitude) &&
    result.longitude! >= -180 &&
    result.longitude! <= 180 &&
    !!bounds &&
    Number.isFinite(bounds.south) &&
    Number.isFinite(bounds.north) &&
    Number.isFinite(bounds.west) &&
    Number.isFinite(bounds.east)
  )
}

const submitSearchFromKeyboard = (event: KeyboardEvent) => {
  if (event.isComposing) return
  event.preventDefault()
  event.stopPropagation()
  void searchLocations()
}

const clearSearchValidation = () => {
  if (searchError.value !== 'too-long') return
  searchError.value = ''
  searchSubmitted.value = false
}

const searchLocations = async () => {
  const query = searchQuery.value.trim()
  if (!query || props.disabled || searching.value) return
  if (locationSearchQueryTooLong(query)) {
    searchSubmitted.value = true
    searchResults.value = []
    searchError.value = 'too-long'
    return
  }

  searchController?.abort()
  const controller = new AbortController()
  const session = captureBackendSession()
  searchController = controller
  searching.value = true
  searchSubmitted.value = true
  searchError.value = ''
  searchResults.value = []

  try {
    const response = await searchInterceptionLocationAPI(
      { query, language: String(locale.value) },
      controller.signal,
    )
    if (controller.signal.aborted || searchController !== controller) return
    const status = response.status
    if (status === 429) {
      searchError.value = 'rate-limit'
      return
    }
    if (!status || status < 200 || status >= 300 || !Array.isArray(response.data?.results)) {
      throw new Error('Location search returned an invalid response')
    }
    searchResults.value = response.data.results.filter(validSearchResult).slice(0, 5)
  } catch (error) {
    if (!backendSessionIsCurrent(session)) return
    if (responseStatus(error) === 429) {
      searchError.value = 'rate-limit'
    } else if (!controller.signal.aborted && searchController === controller) {
      searchError.value = 'generic'
    }
  } finally {
    if (searchController === controller) {
      searching.value = false
      searchController = undefined
    }
  }
}

const validBounds = (bounds: FiveGPNLocationSearchResult['bounding_box']) =>
  bounds &&
  Number.isFinite(bounds.south) &&
  Number.isFinite(bounds.north) &&
  Number.isFinite(bounds.west) &&
  Number.isFinite(bounds.east) &&
  bounds.south <= bounds.north &&
  bounds.west <= bounds.east &&
  Math.abs(bounds.south) <= WEB_MERCATOR_MAX_LATITUDE &&
  Math.abs(bounds.north) <= WEB_MERCATOR_MAX_LATITUDE &&
  bounds.west >= -180 &&
  bounds.east <= 180

const selectSearchResult = (result: FiveGPNLocationSearchResult) => {
  if (props.disabled) return
  mapElement.value?.focus({ preventScroll: true })
  preserveSearchViewport = true
  emitCoordinates(
    Number(result.longitude.toFixed(6)),
    Number(result.latitude.toFixed(6)),
    accuracy.value || DEFAULT_ACCURACY,
  )
  searchQuery.value = result.label
  searchResults.value = []
  searchSubmitted.value = false
  void nextTick(() => {
    preserveSearchViewport = false
  })

  if (!map || !leaflet) return
  if (validBounds(result.bounding_box)) {
    map.fitBounds(
      leaflet.latLngBounds(
        [result.bounding_box.south, result.bounding_box.west],
        [result.bounding_box.north, result.bounding_box.east],
      ),
      { animate: false, maxZoom: 16, padding: [24, 24] },
    )
  } else if (
    Math.abs(result.latitude) <= WEB_MERCATOR_MAX_LATITUDE &&
    result.longitude >= -180 &&
    result.longitude <= 180
  ) {
    map.setView([result.latitude, result.longitude], 14, { animate: false })
  }
}

const markerIcon = () =>
  leaflet!.divIcon({
    className: 'fivegpn-location-marker',
    html: `
      <svg viewBox="0 0 44 48" role="presentation" aria-hidden="true">
        <g transform="translate(6 4)">
          <path d="M16 1C7.72 1 1 7.72 1 16c0 11.25 15 23 15 23s15-11.75 15-23C31 7.72 24.28 1 16 1Z" fill="currentColor" />
          <circle cx="16" cy="16" r="6" fill="var(--color-primary-content)" />
        </g>
      </svg>
    `,
    iconAnchor: [22, 43],
    iconSize: [44, 48],
  })

const removeCoordinateLayers = () => {
  if (map && marker) map.removeLayer(marker)
  if (map && accuracyCircle) map.removeLayer(accuracyCircle)
  marker = undefined
  accuracyCircle = undefined
}

const normalizedMapPoint = (point: import('leaflet').LatLng) => {
  const wrapped = point.wrap()
  return leaflet!.latLng(
    Math.min(WEB_MERCATOR_MAX_LATITUDE, Math.max(-WEB_MERCATOR_MAX_LATITUDE, wrapped.lat)),
    wrapped.lng,
  )
}

const latitudeForEmit = (value: number) =>
  Math.min(
    WEB_MERCATOR_EMIT_MAX_LATITUDE,
    Math.max(-WEB_MERCATOR_EMIT_MAX_LATITUDE, Number(value.toFixed(6))),
  )

const updateRuntimeLabels = () => {
  const markerElement = marker?.getElement()
  if (markerElement) {
    const label = t('fivegpnLocationMarker')
    markerElement.setAttribute('aria-label', label)
    markerElement.setAttribute('role', 'img')
    markerElement.setAttribute('title', label)
  }
  const labels = [
    ['.leaflet-control-zoom-in', t('fivegpnLocationZoomIn')],
    ['.leaflet-control-zoom-out', t('fivegpnLocationZoomOut')],
  ] as const
  for (const [selector, label] of labels) {
    const element = mapElement.value?.querySelector<HTMLElement>(selector)
    element?.setAttribute('aria-label', label)
    element?.setAttribute('title', label)
  }
}

const setMapInteractivity = () => {
  if (!map) return
  const handlers = [map.dragging, map.touchZoom, map.doubleClickZoom, map.boxZoom, map.keyboard]
  for (const handler of handlers) {
    if (props.disabled) handler.disable()
    else handler.enable()
  }
  map.scrollWheelZoom.disable()
  if (props.disabled && zoomControlAttached) {
    zoomControl?.remove()
    zoomControlAttached = false
  } else if (!props.disabled && zoomControl && !zoomControlAttached) {
    zoomControl.addTo(map)
    zoomControlAttached = true
    updateRuntimeLabels()
  }
  mapElement.value?.setAttribute('tabindex', props.disabled ? '-1' : '0')
  if (marker?.dragging) {
    if (props.disabled) marker.dragging.disable()
    else marker.dragging.enable()
  }
}

const fitCoordinatePrecision = () => {
  if (!map || !canPlotCoordinates.value) return
  if (accuracyCircle) {
    map.fitBounds(accuracyCircle.getBounds(), {
      animate: false,
      maxZoom: 17,
      padding: [24, 24],
    })
  } else {
    map.setView([latitude.value!, longitude.value!], 16, { animate: false })
  }
}

const syncCoordinateLayers = (recenter: boolean) => {
  if (!map || !leaflet) return
  if (!canPlotCoordinates.value) {
    removeCoordinateLayers()
    setMapInteractivity()
    return
  }

  const point = leaflet.latLng(latitude.value!, longitude.value!)
  const markerWasCreated = !marker
  if (!marker) {
    marker = leaflet.marker(point, {
      alt: t('fivegpnLocationMarker'),
      autoPan: true,
      draggable: !props.disabled,
      icon: markerIcon(),
      keyboard: false,
      riseOnHover: true,
      title: t('fivegpnLocationMarker'),
    })
    marker.on('drag', () => {
      if (marker && accuracyCircle) accuracyCircle.setLatLng(marker.getLatLng())
    })
    marker.on('dragend', () => {
      if (!marker || props.disabled) return
      const point = normalizedMapPoint(marker.getLatLng())
      marker.setLatLng(point)
      accuracyCircle?.setLatLng(point)
      emitCoordinates(
        Number(point.lng.toFixed(6)),
        latitudeForEmit(point.lat),
        accuracy.value || DEFAULT_ACCURACY,
      )
    })
    marker.addTo(map)
    updateRuntimeLabels()
  } else {
    marker.setLatLng(point)
  }

  const radius = Number.isFinite(accuracy.value) && accuracy.value > 0 ? accuracy.value : 0
  if (radius > 0) {
    if (!accuracyCircle) {
      accuracyCircle = leaflet.circle(point, {
        className: 'fivegpn-location-accuracy',
        fillOpacity: 0.12,
        interactive: false,
        opacity: 0.7,
        radius,
        weight: 2,
      })
      accuracyCircle.addTo(map)
    } else {
      accuracyCircle.setLatLng(point).setRadius(radius)
    }
  } else if (accuracyCircle) {
    map.removeLayer(accuracyCircle)
    accuracyCircle = undefined
  }

  setMapInteractivity()
  if (recenter && markerWasCreated && !preserveSearchViewport) {
    fitCoordinatePrecision()
  } else if (recenter && !map.getBounds().pad(-0.15).contains(point)) {
    map.panTo(point, { animate: false })
  }
}

const installTileLayer = () => {
  if (!leaflet || !map) return
  if (tileLoadTimer !== undefined) {
    window.clearTimeout(tileLoadTimer)
    tileLoadTimer = undefined
  }
  if (tileLayer) {
    tileLayer.off()
    map.removeLayer(tileLayer)
  }

  mapLoading.value = true
  let loadedTiles = 0
  let failedTiles = 0
  const nextLayer = leaflet.tileLayer(OSM_TILE_URL, {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    keepBuffer: 0,
    maxNativeZoom: 19,
    maxZoom: 19,
    minZoom: 2,
    updateWhenIdle: true,
  })
  tileLayer = nextLayer
  const armTileLoadTimeout = () => {
    if (tileLoadTimer !== undefined) window.clearTimeout(tileLoadTimer)
    tileLoadTimer = window.setTimeout(() => {
      if (tileLayer !== nextLayer) return
      tileLoadTimer = undefined
      mapLoading.value = false
      mapError.value = 'tiles'
    }, TILE_LOAD_TIMEOUT)
  }
  nextLayer.on('loading', () => {
    if (tileLayer !== nextLayer) return
    loadedTiles = 0
    failedTiles = 0
    mapLoading.value = true
    armTileLoadTimeout()
  })
  nextLayer.on('tileload', () => {
    if (tileLayer !== nextLayer) return
    loadedTiles += 1
  })
  nextLayer.on('tileerror', () => {
    if (tileLayer !== nextLayer) return
    failedTiles += 1
  })
  nextLayer.on('load', () => {
    if (tileLayer !== nextLayer) return
    if (tileLoadTimer !== undefined) {
      window.clearTimeout(tileLoadTimer)
      tileLoadTimer = undefined
    }
    mapLoading.value = false
    if (tileBatchHasFailure(failedTiles)) {
      mapError.value = 'tiles'
    } else if (loadedTiles > 0 && mapError.value !== 'tiles') {
      mapError.value = ''
    }
  })
  nextLayer.addTo(map)
}

const disposeMap = () => {
  if (tileLoadTimer !== undefined) {
    window.clearTimeout(tileLoadTimer)
    tileLoadTimer = undefined
  }
  resizeObserver?.disconnect()
  resizeObserver = undefined
  tileLayer?.off()
  marker?.off()
  if (zoomControlAttached) zoomControl?.remove()
  map?.off()
  map?.remove()
  tileLayer = undefined
  marker = undefined
  accuracyCircle = undefined
  zoomControl = undefined
  zoomControlAttached = false
  map = undefined
  leaflet = undefined
}

const initializeMap = async () => {
  if (map || unmounted || !mapElement.value) return
  const generation = ++initializeGeneration
  mapLoading.value = true
  mapError.value = ''

  try {
    const [, runtime] = await Promise.all([import('leaflet/dist/leaflet.css'), import('leaflet')])
    if (unmounted || generation !== initializeGeneration || !mapElement.value) return

    leaflet = runtime
    const initialCenter: import('leaflet').LatLngExpression = canPlotCoordinates.value
      ? [latitude.value!, longitude.value!]
      : [20, 0]
    map = runtime.map(mapElement.value, {
      attributionControl: true,
      center: initialCenter,
      maxBounds: runtime.latLngBounds(
        [-WEB_MERCATOR_MAX_LATITUDE, -360],
        [WEB_MERCATOR_MAX_LATITUDE, 360],
      ),
      maxBoundsViscosity: 1,
      maxZoom: 19,
      minZoom: 2,
      scrollWheelZoom: false,
      worldCopyJump: true,
      zoom: canPlotCoordinates.value ? 13 : 2,
      zoomControl: false,
    })
    zoomControl = runtime.control.zoom({
      zoomInTitle: t('fivegpnLocationZoomIn'),
      zoomOutTitle: t('fivegpnLocationZoomOut'),
    })
    map.on('click', (event: import('leaflet').LeafletMouseEvent) => {
      if (props.disabled) return
      const point = normalizedMapPoint(event.latlng)
      emitCoordinates(
        Number(point.lng.toFixed(6)),
        latitudeForEmit(point.lat),
        accuracy.value || DEFAULT_ACCURACY,
      )
    })

    syncCoordinateLayers(false)
    setMapInteractivity()
    fitCoordinatePrecision()
    installTileLayer()

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => map?.invalidateSize({ animate: false, pan: false }))
      resizeObserver.observe(mapElement.value)
    }
    requestAnimationFrame(() => map?.invalidateSize({ animate: false, pan: false }))
  } catch {
    if (generation !== initializeGeneration || unmounted) return
    disposeMap()
    mapLoading.value = false
    mapError.value = 'runtime'
  }
}

const retryMap = () => {
  if (props.disabled || mapLoading.value) return
  mapElement.value?.focus()
  mapError.value = ''
  if (map) installTileLayer()
  else void initializeMap()
}

watch(
  () => [longitude.value, latitude.value, accuracy.value],
  () => syncCoordinateLayers(true),
)
watch(
  () => props.disabled,
  (disabled) => {
    // A busy/disabled transition can interrupt an in-progress marker drag
    // before Leaflet emits dragend. Re-project the committed prop value before
    // disabling handlers so the map cannot display an unsaved draft point.
    syncCoordinateLayers(false)
    if (disabled && searchController) {
      searchController.abort()
      searchController = undefined
      searching.value = false
      searchSubmitted.value = false
    }
  },
)
watch(locale, updateRuntimeLabels)

onMounted(() => {
  if (!mapElement.value || typeof IntersectionObserver === 'undefined') {
    void initializeMap()
    return
  }
  visibilityObserver = new IntersectionObserver(
    (entries) => {
      if (!hasVisibleMapIntersection(entries)) return
      visibilityObserver?.disconnect()
      visibilityObserver = undefined
      void initializeMap()
    },
    { rootMargin: '256px 0px' },
  )
  visibilityObserver.observe(mapElement.value)
})

onBeforeUnmount(() => {
  unmounted = true
  initializeGeneration += 1
  searchController?.abort()
  visibilityObserver?.disconnect()
  visibilityObserver = undefined
  disposeMap()
})
</script>

<style scoped>
.location-map {
  background: var(--color-base-200);
  font-family: inherit;
}

.location-map[aria-disabled='true'] {
  cursor: default;
}

:deep(.fivegpn-location-marker) {
  color: var(--color-primary);
  background: transparent;
  border: 0;
  filter: drop-shadow(0 2px 3px color-mix(in oklab, var(--color-base-content) 30%, transparent));
}

:deep(.fivegpn-location-marker svg) {
  display: block;
  width: 100%;
  height: 100%;
}

:deep(.fivegpn-location-accuracy) {
  fill: var(--color-primary);
  stroke: var(--color-primary);
}

:deep(.leaflet-bar a),
:deep(.leaflet-control-attribution) {
  color: var(--color-base-content);
  background-color: color-mix(in oklab, var(--color-base-100) 90%, transparent);
}

:deep(.leaflet-bar a:hover),
:deep(.leaflet-bar a:focus-visible) {
  color: var(--color-base-content);
  background-color: var(--color-base-200);
}

:deep(.leaflet-control-attribution a) {
  color: var(--color-primary);
}
</style>
