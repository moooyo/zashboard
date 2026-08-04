<template>
  <div
    ref="sidebarRef"
    class="sidebar border-base-300/30 bg-base-200 text-base-content scrollbar-hidden h-full overflow-x-hidden border-r p-2 transition-[width,padding] duration-320 ease-[cubic-bezier(0.34,0.1,0.2,1)]"
    :class="isSidebarCollapsed ? 'w-18 px-0' : 'w-64'"
    @transitionend="handleTransitionEnd"
  >
    <!--
      侧边栏是一个滚动容器(overflow-x-hidden 让 overflow-y 变成 auto),而
      .scrollbar-hidden 又把滚动条藏了 —— 于是"装不下"的表现不是可滚动,而是
      直接消失。列内的三块都带着默认的 min-height:auto,谁都不能被压缩,窗口一
      矮整列就顶出边界:先掉统计,再掉路由表的最后一行(设置)。少的那一格没有任
      何提示,读起来就是"tab 少了一个"。

      导航是唯一不能被裁掉的东西 —— 掉一格就等于一个页面再也点不到。所以下面
      的次要块显式 min-h-0 + 自己滚动,由它们吸收压缩;nav 保持自然高度。
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
          h-full 曾经把这个 ul 钉死在 nav 的高度上。两个后果:daisyUI 的 .menu 是
          flex-flow: column wrap,一旦 nav 被压到比内容矮,行就会折进第二列并被
          overflow-x-hidden 裁掉;而且 ul 的尺寸永远不变,useResizeObserver 永远
          不触发,能力探测在首帧之后补上 5gpn 那几个 tab 时没有任何东西重新量过
          指示条。让它取自然高度,两个问题一起没了。
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
        <!-- min-h-28 而不是 min-h-0:图表是最该让位的一块,但让到零就不是"让位"
             而是"消失"了。留一格图表的高度,它自己有滚动条。 -->
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

// renderRoutes 也要在这里:能力探测在首帧之后才回答,5gpn 的三个 tab 大约晚一帧
// 补进来。路由名没变、折叠状态也没变,所以在此之前没有任何东西会重新量指示条 ——
// 刷新落在 gpn 页面上时,高亮就停在探测前的位置。
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
