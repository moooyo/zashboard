<template>
  <!-- overview -->
  <div class="mb-3 flex flex-col gap-3">
    <!--
      splitOverviewPage 关着的时候(默认),概览就长在设置页里,而长在这里的是这个
      组件写死的那几张卡 —— 不是 overviewCardOrder。所以 5gpn 的 DNS 卡片虽然在
      默认顺序里排第一、在独立概览页上渲染得好好的,在绝大多数人实际会看的那一面
      上从来没出现过。给它和 chartsCard / networkCard 一样的一格。

      顺序跟 defaultOverviewCardOrder 一致:DNS 在最前。
      When splitOverviewPage is off — the default — the overview lives in the
      settings page, and what lives there is this component's fixed list, not
      overviewCardOrder. The DNS card rendered correctly on a page most people
      never open.
    -->
    <div
      v-if="dnsSupported && isVisibleGpnDnsCard"
      class="relative"
    >
      <SettingVisibilityToggle
        :setting-key="OVERVIEW_ITEM_KEYS.gpnDnsCard"
        class="absolute top-2 left-2 z-10"
      />
      <GpnDnsCard
        class="shadow-none"
        :class="
          settingsEditMode && isSettingHidden(OVERVIEW_ITEM_KEYS.gpnDnsCard) ? 'opacity-40' : ''
        "
      />
    </div>
    <div
      v-if="isVisibleOverviewCard"
      class="relative"
    >
      <SettingVisibilityToggle
        :setting-key="OVERVIEW_ITEM_KEYS.chartsCard"
        class="absolute top-2 left-2 z-10"
      />
      <ChartsCard
        class="shadow-none"
        :class="
          settingsEditMode && isSettingHidden(OVERVIEW_ITEM_KEYS.chartsCard) ? 'opacity-40' : ''
        "
      />
    </div>
    <div
      v-if="isVisibleNetworkCard"
      class="relative"
    >
      <SettingVisibilityToggle
        :setting-key="OVERVIEW_ITEM_KEYS.networkCard"
        class="absolute top-2 left-2 z-10"
      />
      <NetworkCard
        class="shadow-none"
        :class="
          settingsEditMode && isSettingHidden(OVERVIEW_ITEM_KEYS.networkCard) ? 'opacity-40' : ''
        "
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import ChartsCard from '@/components/overview/ChartsCard.vue'
import GpnDnsCard from '@/components/overview/GpnDnsCard.vue'
import NetworkCard from '@/components/overview/NetworkCard.vue'
import SettingVisibilityToggle from '@/components/settings/SettingVisibilityToggle.vue'
import { dnsSupported } from '@/assembly/gpn/dns'
import { isSettingHidden, settingsEditMode, useIsSettingVisible } from '@/composables/settings'
import { OVERVIEW_ITEM_KEYS } from '@/config/settingsItems'

const isVisibleGpnDnsCard = useIsSettingVisible(OVERVIEW_ITEM_KEYS.gpnDnsCard)
const isVisibleOverviewCard = useIsSettingVisible(OVERVIEW_ITEM_KEYS.chartsCard)
const isVisibleNetworkCard = useIsSettingVisible(OVERVIEW_ITEM_KEYS.networkCard)
</script>
