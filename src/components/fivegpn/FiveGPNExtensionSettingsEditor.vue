<template>
  <form
    class="flex flex-col gap-3"
    data-testid="fivegpn-extension-settings-form"
    @submit.prevent="save"
  >
    <div
      v-if="flatLocation"
      class="border-base-300 flex flex-col gap-2 border-b pb-3"
    >
      <div>
        <div class="text-sm font-medium">{{ $t('fivegpnLocation') }}</div>
        <p class="text-xs opacity-70">{{ $t('fivegpnFlatLocationDescription') }}</p>
      </div>
      <FiveGPNLocationEditor
        :model-value="flatLocationValue"
        @update:model-value="setFlatLocation"
      />
      <p
        v-if="flatLocationError"
        class="text-error text-xs"
      >
        {{ flatLocationError }}
      </p>
    </div>

    <div
      v-for="setting in visibleSettings"
      :key="setting.key"
      class="border-base-300 grid grid-cols-1 gap-2 border-b pb-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)]"
    >
      <div>
        <label
          class="text-sm font-medium"
          :for="fieldId(setting.key)"
        >
          {{ setting.label || setting.key }}
          <span
            v-if="setting.required"
            class="text-error"
            aria-hidden="true"
            >*</span
          >
        </label>
        <p
          v-if="setting.description"
          class="mt-1 text-xs opacity-70"
        >
          {{ setting.description }}
        </p>
        <code class="mt-1 block text-xs opacity-50">{{ setting.key }}</code>
      </div>

      <div class="flex flex-col gap-1">
        <select
          v-if="setting.type === 'boolean'"
          :id="fieldId(setting.key)"
          class="select select-sm w-full"
          :value="booleanSelectValue(setting.key)"
          @change="setBooleanValue(setting.key, $event)"
        >
          <option
            value="unset"
            :disabled="setting.required"
          >
            {{ $t(setting.required ? 'fivegpnSettingChoose' : 'fivegpnSettingUnset') }}
          </option>
          <option value="true">{{ $t('fivegpnEnabled') }}</option>
          <option value="false">{{ $t('fivegpnDisabled') }}</option>
        </select>
        <select
          v-else-if="setting.type === 'select'"
          :id="fieldId(setting.key)"
          class="select select-sm w-full"
          :value="draft[setting.key] ?? ''"
          @change="setString(setting.key, $event)"
        >
          <option
            v-if="!setting.required || draft[setting.key] === null"
            value=""
            :disabled="setting.required"
          >
            {{ $t(setting.required ? 'fivegpnSettingChoose' : 'fivegpnSettingUnset') }}
          </option>
          <option
            v-for="option in setting.options ?? []"
            :key="option"
            :value="option"
          >
            {{ option }}
          </option>
        </select>
        <input
          v-else-if="setting.type === 'text'"
          :id="fieldId(setting.key)"
          class="input input-sm w-full"
          type="text"
          :value="draft[setting.key] ?? ''"
          @input="setString(setting.key, $event)"
        />
        <input
          v-else-if="setting.type === 'number'"
          :id="fieldId(setting.key)"
          class="input input-sm w-full font-mono"
          type="number"
          step="any"
          :min="setting.min"
          :max="setting.max"
          :value="draft[setting.key] ?? ''"
          @input="setNumber(setting.key, $event)"
        />
        <FiveGPNLocationEditor
          v-else-if="setting.type === 'location'"
          :model-value="locationValue(setting.key)"
          @update:model-value="draft[setting.key] = $event"
        />
        <p
          v-if="errors[setting.key]"
          class="text-error text-xs"
        >
          {{ errors[setting.key] }}
        </p>
      </div>
    </div>

    <div
      v-if="conflictMessage"
      class="alert alert-error py-2"
    >
      <span>{{ conflictMessage }}</span>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        class="btn btn-primary btn-sm"
        type="submit"
        :disabled="busy || disabled"
      >
        {{ submitLabel }}
      </button>
      <button
        v-if="cancelLabel"
        class="btn btn-sm"
        type="button"
        :disabled="busy"
        @click="$emit('cancel')"
      >
        {{ cancelLabel }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { FiveGPNLocationValue, FiveGPNModuleSetting, FiveGPNSettingValue } from '@/api/fivegpn'
import {
  findFlatLocationSettings,
  invalidFlatLocationKeys,
  readFlatLocationValue,
  writeFlatLocationValue,
} from '@/helper/fivegpnExtensionSettings'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FiveGPNLocationEditor from './FiveGPNLocationEditor.vue'

const props = defineProps<{
  settings: FiveGPNModuleSetting[]
  idPrefix: string
  busy?: boolean
  disabled?: boolean
  submitLabel: string
  cancelLabel?: string
  conflictMessage?: string
}>()

const emit = defineEmits<{
  save: [values: Record<string, FiveGPNSettingValue>]
  cancel: []
}>()

const { t } = useI18n()
const draft = ref<Record<string, FiveGPNSettingValue>>({})
const errors = ref<Record<string, string>>({})

const cloneValue = (value: FiveGPNSettingValue | undefined): FiveGPNSettingValue => {
  if (value === undefined) return null
  if (value && typeof value === 'object') return { ...value }
  return value
}

const reset = () => {
  draft.value = Object.fromEntries(
    props.settings.map((setting) => [
      setting.key,
      cloneValue(setting.value !== undefined ? setting.value : setting.default),
    ]),
  )
  const location = findFlatLocationSettings(props.settings)
  if (location?.accuracy) {
    const current = draft.value[location.accuracy.key]
    if (current === null || current === undefined || current === '') {
      draft.value[location.accuracy.key] = location.accuracy.type === 'text' ? '25' : 25
    }
  }
  errors.value = {}
}

watch(() => props.settings, reset, { immediate: true, deep: true })

const flatLocation = computed(() => findFlatLocationSettings(props.settings))
const flatKeys = computed(
  () =>
    new Set(
      flatLocation.value
        ? Object.values(flatLocation.value)
            .filter((setting) => setting !== undefined)
            .map((setting) => setting.key)
        : [],
    ),
)
const visibleSettings = computed(() =>
  props.settings.filter((setting) => !flatKeys.value.has(setting.key)),
)
const flatLocationValue = computed<FiveGPNLocationValue | null>(() => {
  if (!flatLocation.value) return null
  return readFlatLocationValue(flatLocation.value, draft.value)
})
const flatLocationError = computed(() => {
  if (!flatLocation.value) return ''
  return (
    errors.value[flatLocation.value.longitude.key] ||
    errors.value[flatLocation.value.latitude.key] ||
    (flatLocation.value.accuracy ? errors.value[flatLocation.value.accuracy.key] : '') ||
    ''
  )
})

const setFlatLocation = (value: FiveGPNLocationValue | null) => {
  if (!flatLocation.value) return
  draft.value = writeFlatLocationValue(flatLocation.value, draft.value, value ?? { accuracy: 0 })
}

const fieldId = (key: string) => `fivegpn-setting-${props.idPrefix}-${key}`
const booleanSelectValue = (key: string) =>
  typeof draft.value[key] === 'boolean' ? String(draft.value[key]) : 'unset'
const setBooleanValue = (key: string, event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  draft.value[key] = value === 'unset' ? null : value === 'true'
}
const setString = (key: string, event: Event) => {
  const value = (event.target as HTMLInputElement | HTMLSelectElement).value
  draft.value[key] = value === '' ? null : value
}
const setNumber = (key: string, event: Event) => {
  const value = (event.target as HTMLInputElement).value
  draft.value[key] = value === '' ? null : Number(value)
}
const locationValue = (key: string) => {
  const value = draft.value[key]
  return value && typeof value === 'object' ? value : null
}

const validateSetting = (setting: FiveGPNModuleSetting) => {
  const value = draft.value[setting.key]
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    return setting.required ? t('fivegpnSettingRequired') : ''
  }
  if (setting.type === 'select' && !setting.options?.includes(String(value))) {
    return t('fivegpnSettingInvalidOption')
  }
  if (setting.type === 'text' && typeof value !== 'string') {
    return t('fivegpnSettingText')
  }
  if (setting.type === 'boolean' && typeof value !== 'boolean') {
    return t('fivegpnSettingBoolean')
  }
  if (setting.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return t('fivegpnSettingFiniteNumber')
    if (setting.min !== undefined && value < setting.min) {
      return t('fivegpnSettingMinimum', { value: setting.min })
    }
    if (setting.max !== undefined && value > setting.max) {
      return t('fivegpnSettingMaximum', { value: setting.max })
    }
  }
  if (setting.type === 'location') {
    if (typeof value !== 'object') return t('fivegpnLocationInvalid')
    const { longitude, latitude, accuracy } = value
    if (
      !Number.isInteger(accuracy) ||
      accuracy < 1 ||
      accuracy > 100000 ||
      (longitude === undefined) !== (latitude === undefined) ||
      (longitude !== undefined && (longitude < -180 || longitude > 180)) ||
      (latitude !== undefined && (latitude < -90 || latitude > 90))
    ) {
      return t('fivegpnLocationInvalid')
    }
    if (setting.required && longitude === undefined) return t('fivegpnSettingRequired')
  }
  return ''
}

const save = () => {
  errors.value = Object.fromEntries(
    props.settings
      .map((setting) => [setting.key, validateSetting(setting)] as const)
      .filter(([, error]) => error),
  )
  if (flatLocation.value) {
    for (const key of invalidFlatLocationKeys(flatLocation.value, draft.value)) {
      errors.value[key] = t('fivegpnLocationInvalid')
    }
  }
  if (Object.keys(errors.value).length) return
  emit('save', { ...draft.value })
}
</script>
