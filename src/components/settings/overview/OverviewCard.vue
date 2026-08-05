<template>
  <!-- overview -->
  <div class="mb-3 flex flex-col gap-3">
    <!--
      When splitOverviewPage is off (the default), the overview is embedded in
      Settings. This component renders a fixed card list rather than
      overviewCardOrder, so the 5gpn DNS card needs an explicit slot alongside
      chartsCard and networkCard. Keep the order aligned with
      defaultOverviewCardOrder, with DNS first.
    -->
    <div
      v-if="dnsSupported && isVisibleFiveGPNDnsCard"
      class="relative"
    >
      <SettingVisibilityToggle
        :setting-key="OVERVIEW_ITEM_KEYS.fivegpnDnsCard"
        class="absolute top-2 left-2 z-10"
      />
      <FiveGPNDnsCard
        class="shadow-none"
        :class="
          settingsEditMode && isSettingHidden(OVERVIEW_ITEM_KEYS.fivegpnDnsCard) ? 'opacity-40' : ''
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
import FiveGPNDnsCard from '@/components/overview/FiveGPNDnsCard.vue'
import NetworkCard from '@/components/overview/NetworkCard.vue'
import SettingVisibilityToggle from '@/components/settings/SettingVisibilityToggle.vue'
import { dnsSupported } from '@/assembly/fivegpn/dns'
import { isSettingHidden, settingsEditMode, useIsSettingVisible } from '@/composables/settings'
import { OVERVIEW_ITEM_KEYS } from '@/config/settingsItems'

const isVisibleFiveGPNDnsCard = useIsSettingVisible(OVERVIEW_ITEM_KEYS.fivegpnDnsCard)
const isVisibleOverviewCard = useIsSettingVisible(OVERVIEW_ITEM_KEYS.chartsCard)
const isVisibleNetworkCard = useIsSettingVisible(OVERVIEW_ITEM_KEYS.networkCard)
</script>
