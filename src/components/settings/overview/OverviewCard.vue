<template>
  <!--
    总览未拆分成独立页面时内嵌在设置页里，这里是各卡片的显隐开关。
    5gpn DNS 卡片是 chartsCard / networkCard 的同级项，顺序与 defaultOverviewCardOrder
    对齐（DNS 在最前）；和 DNS 页面用同一道能力闸，网关没有 DNS 决策层时不出现。
  -->
  <SettingItem
    :setting-key="OVERVIEW_ITEM_KEYS.fivegpnDnsCard"
    :when="dnsSupported"
  >
    <div class="setting-item-label">
      {{ $t('fivegpnDnsCard') }}
      <span class="setting-item-summary">{{ $t('overviewCardVisibilityDescription') }}</span>
    </div>
    <input
      v-model="fivegpnDnsCardVisible"
      type="checkbox"
      class="toggle"
    />
  </SettingItem>
  <SettingItem :setting-key="OVERVIEW_ITEM_KEYS.chartsCard">
    <div class="setting-item-label">
      {{ $t('chartsCard') }}
      <span class="setting-item-summary">{{ $t('overviewCardVisibilityDescription') }}</span>
    </div>
    <input
      v-model="chartsCardVisible"
      type="checkbox"
      class="toggle"
    />
  </SettingItem>
  <SettingItem :setting-key="OVERVIEW_ITEM_KEYS.networkCard">
    <div class="setting-item-label">
      {{ $t('networkCard') }}
      <span class="setting-item-summary">{{ $t('overviewCardVisibilityDescription') }}</span>
    </div>
    <input
      v-model="networkCardVisible"
      type="checkbox"
      class="toggle"
    />
  </SettingItem>
</template>

<script setup lang="ts">
import { dnsSupported } from '@/assembly/fivegpn/dns'
import SettingItem from '@/components/settings/SettingItem.vue'
import { OVERVIEW_ITEM_KEYS } from '@/config/settingsItems'
import { OVERVIEW_CARD } from '@/constant'
import { overviewCardOrder } from '@/store/settings'
import { computed } from 'vue'

const cardVisibility = (card: OVERVIEW_CARD) =>
  computed({
    get: () => overviewCardOrder.value.find((item) => item.card === card)?.visible ?? false,
    set: (visible: boolean) => {
      const item = overviewCardOrder.value.find((entry) => entry.card === card)
      if (item) item.visible = visible
    },
  })

const fivegpnDnsCardVisible = cardVisibility(OVERVIEW_CARD.FiveGPNDnsCard)
const chartsCardVisible = cardVisibility(OVERVIEW_CARD.ChartsCard)
const networkCardVisible = cardVisibility(OVERVIEW_CARD.NetworkCard)
</script>
