<template>
  <div
    :class="
      isLogTable
        ? 'relative flex size-full flex-col overflow-hidden'
        : 'relative size-full overflow-x-hidden'
    "
    :style="isLogTable ? padding : undefined"
  >
    <!--
      表格模式下 LogsCtrl 本来就是 flex 兄弟节点，不会跟着列表滚走（和 ConnectionsPage
      一个形状）；VirtualTable 自带 `m-3 h-full`，靠 flex 收缩把外边距让出来，塞进定高
      容器反而会把底部裁掉。卡片模式的控制条原本长在 VirtualScroller 的 before 插槽里，
      会跟着滚动消失，才需要 LogSurface 把它钉住。
    -->
    <template v-if="isLogTable">
      <LogsCtrl />
      <LogsTable
        :logs="renderLogs"
        @connection-click="handlerConnectionClick"
      />
    </template>
    <LogSurface v-else>
      <template #controls>
        <LogsCtrl />
      </template>
      <VirtualScroller
        :data="renderLogs"
        :size="44"
      >
        <template v-slot="{ item }: { item: LogWithSeq }">
          <LogsCard
            :log="item"
            @connection-click="handlerConnectionClick"
          />
        </template>
      </VirtualScroller>
    </LogSurface>
    <DialogWrapper
      v-model="connectionLogsDialogVisible"
      no-padding
      :title="`${t('sameConnectionLogs')} (${connectionLogID})`"
    >
      <!-- 弹窗底色本身就是 base-100，垫一层 base-200 才能让卡片之间的间距看得出来 -->
      <div class="bg-base-200 flex flex-col gap-2 p-2">
        <div
          v-for="log in connectionLogs"
          :key="log.seq"
          class="base-container"
        >
          <LogsCard
            :log="log"
            connection-detail-disabled
          />
        </div>
      </div>
    </DialogWrapper>
  </div>
</template>

<script setup lang="ts">
import DialogWrapper from '@/components/common/DialogWrapper.vue'
import VirtualScroller from '@/components/common/VirtualScroller.vue'
import LogsCtrl from '@/components/controls/LogsCtrl.tsx'
import LogSurface from '@/components/ds/LogSurface.vue'
import LogsCard from '@/components/logs/LogsCard.vue'
import LogsTable from '@/components/logs/LogsTable.vue'
import { usePaddingForViews } from '@/composables/paddingViews'
import { LIST_DISPLAY_STYLE } from '@/constant'
import { toSearchRegex } from '@/helper/search'
import {
  getLogConnectionID,
  logFilter,
  logFilterEnabled,
  logFilterRegex,
  logTypeFilter,
  logs,
} from '@/store/logs'
import { logDisplayStyle } from '@/store/settings'
import type { LogWithSeq } from '@/types'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const isLogTable = computed(() => logDisplayStyle.value === LIST_DISPLAY_STYLE.TABLE)
const { padding } = usePaddingForViews({
  offsetTop: 0,
  offsetBottom: 0,
})

const renderLogs = computed(() => {
  let renderLogs = logs.value
  const searchRegex = toSearchRegex(logFilter.value)

  if (logFilter.value || logTypeFilter.value) {
    renderLogs = logs.value.filter((log) => {
      if (searchRegex && !searchRegex.testAny([log.payload, log.time, log.type])) {
        return false
      }

      if (
        logTypeFilter.value &&
        !(log.payload.includes(logTypeFilter.value) || log.type === logTypeFilter.value)
      ) {
        return false
      }

      return true
    })
  }

  if (logFilterEnabled.value && logFilterRegex.value) {
    const hideRegex = toSearchRegex(logFilterRegex.value)

    if (hideRegex) {
      renderLogs = renderLogs.filter((log) => {
        return !hideRegex.testAny([log.payload, log.time, log.type])
      })
    }
  }

  return renderLogs
})

const connectionLogID = ref('')
const connectionLogsDialogVisible = ref(false)
const connectionLogs = computed(() => {
  if (!connectionLogID.value) return []

  return logs.value
    .filter((log) => getLogConnectionID(log.payload) === connectionLogID.value)
    .reverse()
})

const handlerConnectionClick = (connectionID: string) => {
  connectionLogID.value = connectionID
  connectionLogsDialogVisible.value = true
}
</script>
