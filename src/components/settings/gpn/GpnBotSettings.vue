<template>
  <div
    v-if="hasVisibleItems"
    class="flex flex-col gap-3 text-sm"
  >
    <template v-if="botStatus === 'absent'">
      <div class="alert alert-warning py-2">
        <span>{{ $t('gpnBotAbsent') }}</span>
      </div>
    </template>

    <template v-else-if="botStatus === 'error'">
      <div class="alert alert-error py-2">
        <span>{{ botError }}</span>
      </div>
    </template>

    <template v-else-if="data">
      <!-- 状态与文档是两回事:一个 bot 可以既开着又配好,同时够不到 Telegram。
           那不是配置错误,而是网络,所以它自己一行。 -->
      <div
        v-if="data.enabled && data.last_error"
        class="alert alert-warning py-2"
      >
        <span>{{ data.last_error }}</span>
      </div>

      <div class="settings-grid">
        <SettingItem :setting-key="k.gpnBotEnabled">
          <div class="setting-item-label">{{ $t('gpnBotEnabled') }}</div>
          <input
            type="checkbox"
            class="toggle toggle-sm"
            :checked="draft.enabled"
            :disabled="busy"
            @change="draft.enabled = ($event.target as HTMLInputElement).checked"
          />
        </SettingItem>

        <SettingItem :setting-key="k.gpnBotState">
          <div class="setting-item-label">{{ $t('gpnBotState') }}</div>
          <div
            class="badge badge-sm"
            :class="data.state === 'running' ? 'badge-success' : 'badge-ghost'"
          >
            {{ data.state }}
          </div>
        </SettingItem>

        <!-- token 是只写的。这里永远只说明有没有,绝不回显 —— 读回来的
             载荷里根本没有这个字段。 -->
        <SettingItem :setting-key="k.gpnBotToken">
          <div class="setting-item-label">{{ $t('gpnBotToken') }}</div>
          <div class="flex items-center gap-2">
            <input
              v-model="token"
              type="password"
              class="input input-sm w-48"
              :placeholder="data.token_set ? $t('gpnBotTokenStored') : $t('gpnBotTokenUnset')"
              :disabled="busy"
              autocomplete="off"
            />
            <button
              v-if="data.token_set"
              class="btn btn-ghost btn-xs text-error"
              :disabled="busy"
              @click="clearToken"
            >
              {{ $t('gpnBotTokenClear') }}
            </button>
          </div>
        </SettingItem>

        <!-- 一个开着但没有管理员的 bot 谁都不回答,操作者会以为它坏了然后去查
             网络。所以它是要求,而不是留白。 -->
        <SettingItem :setting-key="k.gpnBotAdmins">
          <div class="setting-item-label">{{ $t('gpnBotAdmins') }}</div>
          <input
            v-model="adminText"
            class="input input-sm w-48"
            placeholder="123456789, 987654321"
            :disabled="busy"
          />
        </SettingItem>

        <SettingItem :setting-key="k.gpnBotAlerts">
          <div class="setting-item-label">{{ $t('gpnBotAlerts') }}</div>
          <input
            type="checkbox"
            class="toggle toggle-sm"
            :checked="draft.alerts"
            :disabled="busy"
            @change="draft.alerts = ($event.target as HTMLInputElement).checked"
          />
        </SettingItem>

        <SettingItem :setting-key="k.gpnBotSave">
          <div class="setting-item-label">{{ $t('gpnBotSave') }}</div>
          <button
            class="btn btn-primary btn-sm"
            :disabled="busy"
            @click="save"
          >
            {{ $t('gpnBotSave') }}
          </button>
        </SettingItem>
      </div>

      <p class="text-xs opacity-70">{{ $t('gpnBotReadOnlyNote') }}</p>

      <div
        v-if="notice"
        class="alert py-2"
        :class="noticeIsError ? 'alert-error' : 'alert-success'"
      >
        <span>{{ notice }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { bot, botError, botStatus, refreshBot, saveBot } from '@/assembly/gpn/bot'
import SettingItem from '@/components/settings/SettingItem.vue'
import { useHasAnyVisibleSetting } from '@/composables/settings'
import { GPN_BOT_ITEM_KEYS, getAllKeysForCategory } from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const k = GPN_BOT_ITEM_KEYS
const hasVisibleItems = useHasAnyVisibleSetting(getAllKeysForCategory(SETTINGS_MENU_KEY.gpnBot))

const data = computed(() => bot.value)
const busy = ref(false)
const notice = ref('')
const noticeIsError = ref(false)

const draft = reactive({ enabled: false, alerts: false })
const adminText = ref('')
const token = ref('')

// 服务端是权威。每次读回来都覆盖草稿,否则一次并发写会让界面继续显示一份
// 谁都没保存过的配置。
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
  notice.value = error === 'conflict' ? t('gpnConflict') : error || t('gpnSaved')
}

const write = async (payload: { token?: string }) => {
  busy.value = true
  report(
    await saveBot({
      enabled: draft.enabled,
      alerts: draft.alerts,
      admins: parsedAdmins.value,
      ...payload,
    }),
  )
  busy.value = false
}

const save = () => write(token.value.trim() ? { token: token.value.trim() } : {})

// 清除必须是明示的,因为「留空」已经用来表示「别动」了。
const clearToken = () => {
  draft.enabled = false
  return write({ token: '-' })
}

refreshBot()
</script>
