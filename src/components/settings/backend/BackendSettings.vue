<template>
  <div
    v-if="hasVisibleItems"
    class="text-sm"
  >
    <template v-if="isVisibleBackendSwitch">
      <div class="settings-section-label">{{ $t('settingsSectionCurrentBackend') }}</div>
      <div class="settings-grid">
        <SettingItem
          :setting-key="k.backend"
          class="py-3"
        >
          <div class="flex w-full flex-col gap-3">
            <div class="flex items-center gap-2 px-1">
              <div class="indicator">
                <!--
                  上游在这里挂了一颗「有新版内核」的红点。5gpn 不做内核更新检查,
                  也就没有这颗点 —— 升级由安装与发布链路负责。
                  见 test/disabledUpgradePaths.test.mjs。
                -->
                <a
                  class="flex cursor-pointer items-center gap-2 font-semibold"
                  :href="coreBrand.url"
                  target="_blank"
                >
                  {{ $t('backend') }}
                  <BackendVersion class="text-sm font-normal" />
                </a>
              </div>
            </div>
            <BackendSwitch :show-actions="false" />
          </div>
        </SettingItem>
      </div>
    </template>

    <template v-if="hasVisibleActions">
      <div class="settings-section-label">{{ $t('settingsSectionCoreOperations') }}</div>
      <div class="settings-grid">
        <SettingItem
          v-for="action in backendActions"
          :key="action.key"
          :setting-key="action.key"
        >
          <div class="setting-item-label">{{ $t(action.label) }}</div>
          <button
            class="btn btn-sm min-w-11"
            :disabled="action.running"
            :aria-label="$t(action.label)"
            @click="action.run()"
          >
            <span
              v-if="action.running"
              class="loading loading-spinner h-4 w-4"
            ></span>
            <component
              :is="action.icon"
              v-else
              class="h-4 w-4"
            />
          </button>
        </SettingItem>
      </div>
    </template>

    <template v-if="hasVisibleNetworkSettings">
      <div class="settings-section-label">{{ $t('settingsSectionNetworkListening') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.ports">
          <div class="setting-item-label">
            {{ $t('ports') }}
            <span class="setting-item-summary">{{ $t('configurePorts') }}</span>
          </div>
          <button
            type="button"
            class="btn btn-sm min-w-11"
            :aria-label="$t('configurePorts')"
            @click="portsDialogOpen = true"
          >
            <ChevronRightIcon class="h-4 w-4" />
          </button>
        </SettingItem>
        <SettingItem
          :setting-key="k.tunMode"
          :when="!!configs?.tun && !activeBackend?.disableTunMode"
        >
          <div class="setting-item-label">{{ $t('tunMode') }}</div>
          <input
            v-model="configs!.tun.enable"
            class="toggle"
            type="checkbox"
            @change="hanlderTunModeChange"
          />
        </SettingItem>
        <SettingItem
          :setting-key="k.allowLan"
          :when="!!configs"
        >
          <div class="setting-item-label">{{ $t('allowLan') }}</div>
          <input
            v-model="configs!['allow-lan']"
            class="toggle"
            type="checkbox"
            @change="handlerAllowLanChange"
          />
        </SettingItem>
      </div>
    </template>

    <!--
      上游在这里还有一节「内核更新」(检查更新 / 自动升级)。5gpn 没有这一节:
      面板不提供内核自升级与更新检查,升级走安装与发布链路。
      这条产品边界由 test/disabledUpgradePaths.test.mjs 守着,不要从上游合回来。
    -->

    <template v-if="showDnsQuery">
      <div class="settings-section-label">{{ $t('settingsSectionDiagnostics') }}</div>
      <div class="settings-grid">
        <SettingItem :setting-key="k.DNSQuery">
          <div class="setting-item-label">
            {{ $t('DNSQuery') }}
            <span class="setting-item-summary">{{ $t('dnsQueryDescription') }}</span>
          </div>
          <button
            type="button"
            class="btn btn-sm min-w-11"
            :aria-label="$t('DNSQuery')"
            @click="dnsDialogOpen = true"
          >
            <MagnifyingGlassIcon class="h-4 w-4" />
          </button>
        </SettingItem>
      </div>
    </template>

    <DialogWrapper
      v-model="portsDialogOpen"
      :title="$t('ports')"
      box-class="w-full max-w-2xl"
    >
      <BackendPortsGrid />
    </DialogWrapper>
    <DialogWrapper
      v-model="dnsDialogOpen"
      :title="$t('DNSQuery')"
      box-class="w-full max-w-2xl"
    >
      <DnsQuery />
    </DialogWrapper>
  </div>
</template>

<script setup lang="ts">
import { can } from '@/assembly/backend'
import { configs, updateConfigs } from '@/assembly/config'
import { coreBrand } from '@/assembly/version'
import BackendVersion from '@/components/common/BackendVersion.vue'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import BackendPortsGrid from '@/components/settings/backend/BackendPortsGrid.vue'
import BackendSwitch from '@/components/settings/backend/BackendSwitch.vue'
import DnsQuery from '@/components/settings/backend/DnsQuery.vue'
import SettingItem from '@/components/settings/SettingItem.vue'
import { backendActions } from '@/composables/backendActions'
import { isSettingVisible, useIsSettingVisible } from '@/composables/settings'
import { BACKEND_ITEM_KEYS } from '@/config/settingsItems'
// 上游那两个内核自升级开关有意不从 store/settings 引入 ——
// 它们在 5gpn 里根本不存在(见 test/disabledUpgradePaths.test.mjs)。
import { notifyRequestError } from '@/helper/requestError'
import { activeBackend } from '@/store/setup'
import { ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'

const k = BACKEND_ITEM_KEYS
const portsDialogOpen = ref(false)
const dnsDialogOpen = ref(false)

const isVisibleBackendSwitch = useIsSettingVisible(k.backend)
const isVisiblePorts = useIsSettingVisible(k.ports)
const isVisibleTunMode = useIsSettingVisible(k.tunMode)
const isVisibleAllowLan = useIsSettingVisible(k.allowLan)
const isVisibleDnsQuery = useIsSettingVisible(k.DNSQuery)
const canShowTunMode = computed(
  () => isVisibleTunMode.value && !activeBackend.value?.disableTunMode,
)

// 派生的「有没有东西可显示」必须和条目自身的门控一致,否则会渲染出空容器。
const hasVisibleActions = computed(() =>
  backendActions.value.some((action) => isSettingVisible(action.key)),
)
const showDnsQuery = computed(() => isVisibleDnsQuery.value && can('dnsQuery'))
const hasVisibleNetworkSettings = computed(
  () =>
    can('configPatch') &&
    !!configs.value &&
    (isVisiblePorts.value ||
      (!!configs.value.tun && canShowTunMode.value) ||
      isVisibleAllowLan.value),
)
// 上游这里还有一个 hasVisibleUpgradeSettings。5gpn 没有内核更新那一节,
// 所以也没有这个派生量 —— 见 test/disabledUpgradePaths.test.mjs。
const hasVisibleItems = computed(
  () =>
    isVisibleBackendSwitch.value ||
    hasVisibleActions.value ||
    hasVisibleNetworkSettings.value ||
    showDnsQuery.value,
)

const hanlderTunModeChange = async () => {
  try {
    await updateConfigs({ tun: { enable: configs.value?.tun.enable } })
  } catch (error) {
    notifyRequestError(error)
  }
}
const handlerAllowLanChange = async () => {
  try {
    await updateConfigs({ ['allow-lan']: configs.value?.['allow-lan'] })
  } catch (error) {
    notifyRequestError(error)
  }
}
</script>
