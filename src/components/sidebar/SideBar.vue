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
        ref="navRef"
        class="relative flex-1 shrink-0"
      >
        <div
          aria-hidden="true"
          class="sidebar-tab-indicator bg-neutral pointer-events-none absolute"
          :class="{ 'sidebar-tab-indicator-ready': indicatorReady }"
          :style="indicatorStyle"
        />
        <!--
          h-full previously fixed this ul to nav's height. That caused two problems. DaisyUI's .menu
          uses flex-flow: column wrap, so once nav became shorter than its content, rows wrapped into
          a second column and were clipped by overflow-x-hidden. Also, the ul size never changed, so
          useResizeObserver never fired and nothing remeasured the indicator when capability discovery
          added the 5gpn tabs after the first frame. Natural height fixes both problems.
        -->
        <ul
          ref="menuRef"
          class="sidebar-route-menu menu w-full flex-nowrap"
        >
          <li
            v-for="r in renderRoutes"
            :key="r"
            :data-sidebar-route="r"
            @mouseenter="(e) => mouseenterHandler(e, r)"
          >
            <a
              :class="[
                r === route.name ? 'sidebar-tab-active' : 'hover:bg-base-300!',
                isSidebarCollapsed && 'justify-center',
                'relative z-10 py-2',
              ]"
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
import { ROUTE_ICON_MAP } from '@/constant'
import { renderRoutes } from '@/helper'
import { useTooltip } from '@/helper/tooltip'
import router from '@/router'
import { isSidebarCollapsed, showStatisticsWhenSidebarCollapsed } from '@/store/settings'
import { useResizeObserver } from '@vueuse/core'
import { twMerge } from 'tailwind-merge'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import OverviewCarousel from './OverviewCarousel.vue'
import SidebarButtons from './SidebarButtons.vue'
import VerticalInfos from './VerticalInfos.vue'

const emit = defineEmits<{
  transitionend: []
}>()

const sidebarRef = ref<HTMLDivElement>()
const navRef = ref<HTMLDivElement>()
const menuRef = ref<HTMLUListElement>()
const indicatorReady = ref(false)
const indicatorStyle = ref({
  height: '0px',
  opacity: '0',
  transform: 'translate3d(0, 0, 0)',
  width: '0px',
})
const { showTip } = useTooltip()
const { t } = useI18n()

const mouseenterHandler = (e: MouseEvent, r: string) => {
  if (!isSidebarCollapsed.value) return
  showTip(e, t(r), {
    placement: 'right',
  })
}

const route = useRoute()

const syncTabIndicator = () => {
  const nav = navRef.value
  const menu = menuRef.value
  if (!nav || !menu || typeof route.name !== 'string') return

  const activeTab = menu.querySelector<HTMLElement>(
    `[data-sidebar-route="${CSS.escape(route.name)}"] > a`,
  )
  if (!activeTab) return

  const navRect = nav.getBoundingClientRect()
  const activeTabRect = activeTab.getBoundingClientRect()

  indicatorStyle.value = {
    height: `${activeTabRect.height}px`,
    opacity: '1',
    transform: `translate3d(${activeTabRect.left - navRect.left}px, ${activeTabRect.top - navRect.top}px, 0)`,
    width: `${activeTabRect.width}px`,
  }
}

// Include renderRoutes here because capability discovery responds after the first frame, adding the
// three 5gpn tabs roughly one frame later. Neither the route name nor collapse state changes, so
// nothing else remeasures the indicator. Refreshing on a 5gpn page would leave the highlight at its
// pre-discovery position.
watch(
  [() => route.name, isSidebarCollapsed, renderRoutes],
  async () => {
    await nextTick()
    syncTabIndicator()
    requestAnimationFrame(() => {
      indicatorReady.value = true
    })
  },
  { immediate: true },
)

useResizeObserver(menuRef, syncTabIndicator)

const handleTransitionEnd = (e: TransitionEvent) => {
  if (e.target !== sidebarRef.value || e.propertyName !== 'width') return
  syncTabIndicator()
  emit('transitionend')
}
</script>
