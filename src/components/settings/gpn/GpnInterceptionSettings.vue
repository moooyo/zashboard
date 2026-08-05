<template>
  <div
    v-if="hasVisibleItems"
    class="flex flex-col gap-3 text-sm"
  >
    <!-- 引擎缺席不是「拦截已关闭」。关闭是一份加载成功并声明 enabled:false 的
         文档;缺席是一份没能加载的文档。渲染成同一个界面,等于告诉操作者他的
         配置正在被遵守,而实际上没有人在读它。 -->
    <template v-if="interceptionStatus === 'absent'">
      <div class="alert alert-warning py-2">
        <span>{{ $t('gpnInterceptionAbsent') }}</span>
      </div>
    </template>

    <template v-else-if="interceptionStatus === 'error'">
      <div class="alert alert-error py-2">
        <span>{{ interceptionError }}</span>
      </div>
    </template>

    <!-- 渲染条件是「有数据」而不是「状态为 ready」:刷新期间状态会变成
         loading,若按状态渲染,整个面板会在每次刷新时闪空一下。留住已有的数字,
         把刷新的可见性交给按钮自己。 -->
    <template v-else-if="data">
      <!-- SAN 集与已启用扩展要求捕获的集合不符,是唯一一个在客户端表现为信任
           错误、而网关日志里什么都没有的故障。它必须比其他任何一行都显眼。 -->
      <div
        v-if="certificateGap"
        class="alert alert-error py-2"
      >
        <span>{{ $t('gpnCertificateGap', { hosts: missingHosts }) }}</span>
      </div>

      <div class="settings-grid">
        <SettingItem :setting-key="k.gpnMitmMaster">
          <div class="setting-item-label">{{ $t('gpnMitmMaster') }}</div>
          <input
            type="checkbox"
            class="toggle"
            :checked="data.enabled"
            :disabled="busy"
            @change="toggleMaster"
          />
        </SettingItem>

        <SettingItem :setting-key="k.gpnHttp2">
          <div class="setting-item-label">{{ $t('gpnHttp2') }}</div>
          <input
            type="checkbox"
            class="toggle"
            :checked="data.http2"
            :disabled="busy"
            @change="toggleHttp2"
          />
        </SettingItem>

        <SettingItem :setting-key="k.gpnHttp3">
          <div class="setting-item-label">{{ $t('gpnHttp3') }}</div>
          <div
            data-testid="gpn-http3-boundary"
            class="flex max-w-xl flex-col items-end gap-1 text-right"
          >
            <span class="badge badge-warning badge-sm">{{ $t('gpnHttp3Unavailable') }}</span>
            <span class="text-xs opacity-70">{{ $t('gpnHttp3Blocked') }}</span>
          </div>
        </SettingItem>

        <!-- 「已安装」与「正在捕获」是两个数字,而不是一个。被禁用的扩展照样
             声明主机;把声明集报告成生效集,等于告诉操作者他的流量正在被拦截,
             而实际上没有任何东西在拦。 -->
        <SettingItem :setting-key="k.gpnModules">
          <div class="setting-item-label">{{ $t('gpnModules') }}</div>
          <div>
            {{ $t('gpnModuleCount', { enabled: enabledCount, total: data.modules.length }) }}
          </div>
        </SettingItem>

        <SettingItem :setting-key="k.gpnCaptureHosts">
          <div class="setting-item-label">{{ $t('gpnCaptureHosts') }}</div>
          <div>{{ data.active_capture_hosts.length }}</div>
        </SettingItem>

        <!-- 空的 egress group 本身没有含义。在要求它的模块上,它就是「已安装、
             已启用、却什么都没捕获」的全部原因,所以只在真的缺失时才出现。 -->
        <SettingItem
          :setting-key="k.gpnUnboundEgress"
          :when="unboundEgress.length > 0"
        >
          <div class="setting-item-label">{{ $t('gpnUnboundEgress') }}</div>
          <div class="text-error">{{ unboundEgress.join(', ') }}</div>
        </SettingItem>

        <SettingItem
          :setting-key="k.gpnCertificateExpiry"
          :when="Boolean(data.certificate.loaded && data.certificate.not_after)"
        >
          <div class="setting-item-label">{{ $t('gpnCertificateExpiry') }}</div>
          <div>{{ expiry }}</div>
        </SettingItem>

        <SettingItem :setting-key="k.gpnInterceptionRefresh">
          <div class="setting-item-label">{{ $t('gpnInterceptionRefresh') }}</div>
          <button
            class="btn btn-sm"
            :disabled="interceptionStatus === 'loading'"
            @click="refreshInterception"
          >
            {{ $t('gpnInterceptionRefresh') }}
          </button>
        </SettingItem>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  interception,
  interceptionError,
  interceptionStatus,
  refreshInterception,
  setInterceptionSettings,
} from '@/assembly/gpn/interception'
import SettingItem from '@/components/settings/SettingItem.vue'
import { useHasAnyVisibleSetting } from '@/composables/settings'
import { GPN_INTERCEPTION_ITEM_KEYS, getAllKeysForCategory } from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import { computed, ref } from 'vue'

const k = GPN_INTERCEPTION_ITEM_KEYS
const hasVisibleItems = useHasAnyVisibleSetting(
  getAllKeysForCategory(SETTINGS_MENU_KEY.gpnInterception),
)

const data = computed(() => interception.value)

// The mutable interception controls live in Settings and apply immediately.
// HTTP/3 is deliberately not one of them: the fixed gateway guard blocks
// UDP/443, and the request boundary below omits this read-only snapshot field.
const busy = ref(false)

const settingsOf = () => ({
  enabled: data.value?.enabled ?? false,
  http2: data.value?.http2 ?? false,
})

const apply = async (next: ReturnType<typeof settingsOf>) => {
  if (!data.value || busy.value) return
  busy.value = true
  const error = await setInterceptionSettings(next)
  busy.value = false
  if (error) {
    // 失败时把界面拉回核心的真实状态,而不是留下一个看起来已经生效的开关。
    void refreshInterception()
  }
}

const toggleMaster = () => apply({ ...settingsOf(), enabled: !data.value?.enabled })
const toggleHttp2 = () => apply({ ...settingsOf(), http2: !data.value?.http2 })

const enabledCount = computed(() => (data.value?.modules ?? []).filter((m) => m.enabled).length)

const certificateGap = computed(
  () => data.value?.certificate.loaded === true && !data.value.certificate.covers_all_capture_hosts,
)

const missingHosts = computed(() => (data.value?.certificate.missing_hosts ?? []).join(', '))

const unboundEgress = computed(() =>
  (data.value?.modules ?? [])
    .filter((m) => m.enabled && m.egress_group_required && !m.egress_group)
    .map((m) => m.name || m.id),
)

const expiry = computed(() => {
  const at = data.value?.certificate.not_after
  return at ? new Date(at * 1000).toLocaleString() : ''
})
</script>
