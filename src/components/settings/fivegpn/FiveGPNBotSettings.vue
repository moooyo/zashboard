<template>
  <CardState
    v-if="hasVisibleItems"
    :status="botStatus"
    :ready="Boolean(data)"
    :loading-message="$t('fivegpnLoadingState')"
    :absent-message="$t('fivegpnBotAbsent')"
    :error-message="botError"
    :retry-label="$t('fivegpnRetryState')"
    :retrying="botStatus === 'loading'"
    class="flex flex-col gap-3 text-sm"
    @retry="refreshBot"
  >
    <template v-if="data">
      <!-- Runtime status and configuration are separate concerns: a bot can be enabled and
           configured while Telegram is unreachable. That is a network issue, so it gets its own row. -->
      <div
        v-if="data.enabled && data.last_error"
        class="alert alert-warning py-2"
      >
        <span>{{ data.last_error }}</span>
      </div>

      <div class="settings-grid">
        <SettingItem :setting-key="k.fivegpnBotEnabled">
          <div class="setting-item-label">{{ $t('fivegpnBotEnabled') }}</div>
          <input
            type="checkbox"
            class="toggle toggle-sm"
            :checked="draft.enabled"
            :disabled="busy"
            @change="draft.enabled = ($event.target as HTMLInputElement).checked"
          />
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnBotState">
          <div class="setting-item-label">{{ $t('fivegpnBotState') }}</div>
          <div
            class="badge badge-sm"
            :class="data.state === 'running' ? 'badge-success' : 'badge-ghost'"
          >
            {{ data.state }}
          </div>
        </SettingItem>

        <!-- The token is write-only. This UI reports only whether one exists and never echoes it;
             the response payload does not contain this field. -->
        <SettingItem :setting-key="k.fivegpnBotToken">
          <div class="setting-item-label">{{ $t('fivegpnBotToken') }}</div>
          <div class="flex items-center gap-2">
            <input
              v-model="token"
              type="password"
              class="input input-sm w-48"
              :placeholder="
                data.token_set ? $t('fivegpnBotTokenStored') : $t('fivegpnBotTokenUnset')
              "
              :disabled="busy"
              autocomplete="off"
            />
            <button
              v-if="data.token_set"
              class="btn btn-ghost btn-xs text-error"
              :disabled="busy"
              @click="clearToken"
            >
              {{ $t('fivegpnBotTokenClear') }}
            </button>
          </div>
        </SettingItem>

        <!-- An enabled bot without an administrator answers nobody, which looks like a network
             failure to the operator. Treat an administrator as required rather than optional. -->
        <SettingItem :setting-key="k.fivegpnBotAdmins">
          <div class="setting-item-label">{{ $t('fivegpnBotAdmins') }}</div>
          <input
            v-model="adminText"
            class="input input-sm w-48"
            placeholder="123456789, 987654321"
            :disabled="busy"
          />
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnBotAlerts">
          <div class="setting-item-label">{{ $t('fivegpnBotAlerts') }}</div>
          <input
            type="checkbox"
            class="toggle toggle-sm"
            :checked="draft.alerts"
            :disabled="busy"
            @change="draft.alerts = ($event.target as HTMLInputElement).checked"
          />
        </SettingItem>

        <SettingItem :setting-key="k.fivegpnBotSave">
          <div class="setting-item-label">{{ $t('fivegpnBotSave') }}</div>
          <button
            class="btn btn-primary btn-sm"
            :disabled="busy"
            @click="save"
          >
            {{ $t('fivegpnBotSave') }}
          </button>
        </SettingItem>
      </div>

      <p class="text-xs opacity-70">{{ $t('fivegpnBotReadOnlyNote') }}</p>

      <div
        v-if="notice"
        class="alert py-2"
        :class="noticeIsError ? 'alert-error' : 'alert-success'"
      >
        <span>{{ notice }}</span>
      </div>
    </template>
  </CardState>
</template>

<script setup lang="ts">
import { bot, botError, botStatus, refreshBot, saveBot } from '@/assembly/fivegpn/bot'
import CardState from '@/components/ds/CardState.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import { useHasAnyVisibleSetting } from '@/composables/settings'
import { FIVEGPN_BOT_ITEM_KEYS, getAllKeysForCategory } from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import { activeBackendSession } from '@/store/setup'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const k = FIVEGPN_BOT_ITEM_KEYS
const hasVisibleItems = useHasAnyVisibleSetting(getAllKeysForCategory(SETTINGS_MENU_KEY.fivegpnBot))

const data = computed(() => bot.value)
const busy = ref(false)
const notice = ref('')
const noticeIsError = ref(false)
let actionEpoch = 0

const draft = reactive({ enabled: false, alerts: false })
const adminText = ref('')
const token = ref('')

// The server is authoritative. Replace the draft after every read; otherwise a concurrent write
// could leave the UI displaying a configuration that nobody saved.
watch(
  data,
  (next) => {
    if (!next) return
    draft.enabled = next.enabled
    draft.alerts = next.alerts
    adminText.value = next.admins.join(', ')
    token.value = ''
  },
  { immediate: true },
)

const parsedAdmins = computed(() =>
  adminText.value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((id) => Number.isSafeInteger(id) && id !== 0),
)

const report = (error: string) => {
  noticeIsError.value = Boolean(error)
  notice.value = error === 'conflict' ? t('fivegpnConflict') : error || t('fivegpnSaved')
}

const write = async (payload: { token?: string }) => {
  const action = ++actionEpoch
  const session = activeBackendSession.value
  if (!session) return
  busy.value = true
  const error = await saveBot({
    enabled: draft.enabled,
    alerts: draft.alerts,
    admins: parsedAdmins.value,
    ...payload,
  })
  if (action !== actionEpoch || activeBackendSession.value?.epoch !== session.epoch) return
  report(error)
  busy.value = false
}

const save = () => write(token.value.trim() ? { token: token.value.trim() } : {})

// Clearing must be explicit because an empty value already means "leave unchanged."
const clearToken = () => {
  draft.enabled = false
  return write({ token: '-' })
}

watch(activeBackendSession, (session, previous) => {
  if (session?.epoch === previous?.epoch) return
  actionEpoch += 1
  busy.value = false
  notice.value = ''
  token.value = ''
  if (session) {
    void Promise.resolve().then(() => {
      if (activeBackendSession.value?.epoch === session.epoch) return refreshBot()
    })
  }
})

onMounted(() => void refreshBot())
onUnmounted(() => {
  actionEpoch += 1
  busy.value = false
})
</script>
