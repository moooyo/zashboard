<template>
  <div
    ref="sidebarRef"
    class="sidebar border-base-300/30 bg-base-200 text-base-content scrollbar-hidden h-full overflow-x-hidden border-r p-2 transition-[width,padding] duration-320 ease-[cubic-bezier(0.34,0.1,0.2,1)]"
    :class="isSidebarCollapsed ? 'w-18 px-0' : 'w-64'"
    @transitionend="handleTransitionEnd"
  >
    <!--
      The sidebar is a scroll container (overflow-x-hidden makes overflow-y auto), while
      .scrollbar-hidden hides the scrollbar. Content that does not fit therefore appears to vanish
      instead of looking scrollable. All three column sections default to min-height:auto, so none
      can shrink. A shorter window pushes the column past its boundary: statistics disappear first,
      followed by the last route row (Settings). Nothing signals the missing row, so it looks like
      the tab was never present.

      Navigation is the one section that must never be clipped, because losing a row makes a page
      unreachable. Secondary sections below explicitly use min-h-0 and their own scrolling to absorb
      compression, while nav keeps its natural height.
      The sidebar is a scroll container with its scrollbar hidden, so anything
      that does not fit does not scroll — it vanishes. Navigation is the one
      block that must never be the one to go.
    -->
    <div :class="twMerge('flex h-full flex-col gap-2', isSidebarCollapsed ? 'w-18 px-0' : 'w-60')">
      <div
        class="flex-1 shrink-0"
      >
        <ul class="sidebar-route-menu menu w-full flex-nowrap">
          <template
            v-for="r in renderRoutes"
            :key="r"
          >
            <li
              v-if="r === ROUTE_NAME.fivegpnExtensions"
              class="menu-title mt-2"
              :aria-label="$t('fivegpnPluginGroup')"
            >
              <span v-if="!isSidebarCollapsed">{{ $t('fivegpnPluginGroup') }}</span>
              <hr
                v-else
                aria-hidden="true"
                class="border-base-300 w-full"
              />
            </li>
            <li
              v-if="r === ROUTE_NAME.tools"
              aria-hidden="true"
              class="px-2 py-1"
            >
              <hr class="border-base-300 w-full" />
            </li>
            <li @mouseenter="(e) => mouseenterHandler(e, r)">
              <a
                :class="[
                  r !== route.name && 'hover:bg-base-300!',
                  isSidebarCollapsed && 'justify-center',
                  'py-2',
                ]"
                :aria-current="r === route.name ? 'page' : undefined"
                @click.passive="() => router.push({ name: r })"
              >
                <component
                  :is="ROUTE_ICON_MAP[r]"
                  class="h-5 w-5"
                />
                <template v-if="!isSidebarCollapsed">
                  {{ $t(r) }}
                </template>
              </a>
            </li>
          </template>
        </ul>
      </div>
      <template v-if="isSidebarCollapsed">
        <VerticalInfos
          v-if="showStatisticsWhenSidebarCollapsed"
          class="scrollbar-hidden min-h-0 shrink overflow-y-auto"
        >
          <SidebarButtons vertical />
        </VerticalInfos>
        <SidebarButtons
          v-else
          vertical
          class="shrink-0"
        />
      </template>
      <template v-else>
        <!-- Use min-h-28 rather than min-h-0. The chart should yield space first, but shrinking to
             zero makes it disappear rather than yield. Preserve one chart row; it has its own scrollbar. -->
        <OverviewCarousel class="min-h-28" />
        <CommonSidebar class="base-container scrollbar-hidden min-h-0 shrink overflow-y-auto" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import CommonSidebar from '@/components/sidebar/CommonCtrl.vue'
import { ROUTE_ICON_MAP, ROUTE_NAME } from '@/constant'
import { renderRoutes } from '@/helper'
import { useTooltip } from '@/helper/tooltip'
import { twMerge } from '@/lib/cn'
import router from '@/router'
import { isSidebarCollapsed, showStatisticsWhenSidebarCollapsed } from '@/store/settings'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import OverviewCarousel from './OverviewCarousel.vue'
import SidebarButtons from './SidebarButtons.vue'
import VerticalInfos from './VerticalInfos.vue'

const emit = defineEmits<{
  transitionend: []
}>()

const sidebarRef = ref<HTMLDivElement>()
const { showTip } = useTooltip()
const { t } = useI18n()

const mouseenterHandler = (e: MouseEvent, r: string) => {
  if (!isSidebarCollapsed.value) return
  showTip(e, t(r), {
    placement: 'right',
  })
}

const route = useRoute()

const handleTransitionEnd = (e: TransitionEvent) => {
  if (e.target !== sidebarRef.value || e.propertyName !== 'width') return
  emit('transitionend')
}
</script>
