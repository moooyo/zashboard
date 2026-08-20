<template>
  <div
    ref="scrollContainerRef"
    class="relative h-full overflow-y-scroll"
    :class="settingsPaneTransition && 'overflow-x-hidden'"
    :style="padding"
  >
    <!-- 移动端与窄内容区共用顶部控制栏；宽屏改用页内左侧导航。 -->
    <CtrlsBar v-if="!showSideNavigation">
      <div class="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 p-2">
        <button
          v-if="showMobileIndex === false && isMiddleScreen"
          type="button"
          class="btn btn-circle btn-ghost btn-sm shrink-0"
          :aria-label="$t('back')"
          @click="backToCategories"
        >
          <ChevronLeftIcon class="h-5 w-5" />
        </button>

        <div
          v-if="isMiddleScreen"
          class="min-w-0 flex-1"
        >
          <div class="truncate text-base font-semibold">
            {{
              showMobileIndex || !activeCategory
                ? $t('settings')
                : $t(SETTINGS_MENU_LABELS[activeCategory.key])
            }}
          </div>
        </div>

        <SelectInput
          v-else
          v-model="narrowCategoryKey"
          class="select-sm max-w-56 min-w-40"
          :aria-label="$t('settingsCategory')"
          :options="categorySelectOptions"
        />

        <SettingsSearch
          v-if="!isMiddleScreen || showMobileIndex || mobileSearchOpen"
          :class="[
            'min-w-0 flex-1',
            isMiddleScreen && showMobileIndex && 'order-last w-full flex-none',
            isMiddleScreen && !showMobileIndex && 'absolute top-full right-2 left-2 mt-1',
          ]"
          @select="openSetting"
          @customize="customizationOpen = true"
        />

        <button
          v-if="isMiddleScreen && !showMobileIndex"
          type="button"
          class="btn btn-circle btn-ghost btn-sm shrink-0"
          :class="mobileSearchOpen && 'btn-active'"
          :aria-label="$t('searchSettings')"
          @click="mobileSearchOpen = !mobileSearchOpen"
        >
          <MagnifyingGlassIcon class="h-4 w-4" />
        </button>
        <button
          v-if="isPWA"
          type="button"
          class="btn btn-circle btn-ghost btn-sm shrink-0"
          :title="$t('refresh')"
          @click="refreshPages"
        >
          <ArrowPathIcon class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="btn btn-circle btn-ghost btn-sm shrink-0"
          :title="$t('customizeSettingsPage')"
          @click="customizationOpen = true"
        >
          <AdjustmentsHorizontalIcon class="h-4 w-4" />
        </button>
      </div>
    </CtrlsBar>

    <!-- 移动端先展示分类首页，组件仍在下方挂载以维护准确的可搜索项目索引。 -->
    <main
      v-if="showMobileIndex"
      class="mx-auto w-full max-w-2xl p-3 pb-6"
      :class="settingsPaneTransition === 'pop' && 'settings-pane-pop'"
      @animationend.self="clearPaneAnimation"
    >
      <div class="mb-4 px-1 pt-2">
        <h1 class="text-xl font-semibold tracking-tight">{{ $t('settings') }}</h1>
        <p class="text-base-content/55 mt-1 text-sm">{{ $t('settingsPageDescription') }}</p>
      </div>

      <div class="settings-grid">
        <button
          v-for="category in menuItems"
          :key="category.key"
          type="button"
          class="setting-item hover:bg-base-200/60 w-full text-left transition-colors"
          @click="selectSection(category.key)"
        >
          <span class="bg-base-200 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <component
              :is="category.icon"
              class="h-5 w-5"
            />
          </span>
          <span class="min-w-0 flex-1 py-2">
            <span class="block text-sm font-medium">
              {{ $t(SETTINGS_MENU_LABELS[category.key]) }}
            </span>
            <span class="text-base-content/50 mt-0.5 block text-xs leading-5">
              {{ $t(category.description) }}
            </span>
          </span>
          <ChevronRightIcon class="h-4 w-4 shrink-0 opacity-35" />
        </button>
      </div>

      <div
        v-if="!menuItems.length"
        class="text-base-content/50 p-8 text-center text-sm"
      >
        {{ $t('noVisibleSettingsCategories') }}
      </div>
    </main>

    <div
      v-show="!showMobileIndex"
      class="mx-auto w-full"
      :class="[
        showSideNavigation
          ? 'grid max-w-5xl grid-cols-[14rem_minmax(0,48rem)] gap-8 p-6'
          : 'max-w-3xl p-3 md:p-6',
        settingsPaneTransition === 'push' && 'settings-pane-push',
      ]"
      @animationend.self="clearPaneAnimation"
    >
      <aside
        v-if="showSideNavigation"
        class="sticky top-6 flex h-[calc(100dvh-3rem)] min-h-0 flex-col"
      >
        <div class="mb-4 px-2">
          <h1 class="text-xl font-semibold tracking-tight">{{ $t('settings') }}</h1>
        </div>

        <SettingsSearch
          class="mb-3"
          @select="openSetting"
          @customize="customizationOpen = true"
        />

        <nav
          class="min-h-0 flex-1 space-y-1 overflow-y-auto"
          :aria-label="$t('settingsCategory')"
        >
          <button
            v-for="category in menuItems"
            :key="category.key"
            type="button"
            class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors"
            :class="
              category.key === activeCategory?.key
                ? 'bg-primary text-primary-content shadow-sm'
                : 'hover:bg-base-100 text-base-content/65 hover:text-base-content'
            "
            :aria-current="category.key === activeCategory?.key ? 'page' : undefined"
            @click="selectSection(category.key)"
          >
            <component
              :is="category.icon"
              class="h-5 w-5 shrink-0"
            />
            <span class="min-w-0 flex-1 truncate">
              {{ $t(SETTINGS_MENU_LABELS[category.key]) }}
            </span>
            <ChevronRightIcon class="h-4 w-4 shrink-0 opacity-35" />
          </button>
        </nav>

        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="btn btn-sm flex-1"
            @click="customizationOpen = true"
          >
            <AdjustmentsHorizontalIcon class="h-4 w-4" />
            {{ $t('customize') }}
          </button>
          <button
            v-if="isPWA"
            type="button"
            class="btn btn-circle btn-sm"
            :title="$t('refresh')"
            @click="refreshPages"
          >
            <ArrowPathIcon class="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main class="min-w-0">
        <header
          v-if="activeCategory"
          class="mb-5 px-1"
        >
          <div class="flex items-center gap-3">
            <span
              class="bg-base-100 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-xs"
            >
              <component
                :is="activeCategory.icon"
                class="h-6 w-6"
              />
            </span>
            <div class="min-w-0">
              <h2 class="text-xl font-semibold tracking-tight">
                {{ $t(SETTINGS_MENU_LABELS[activeCategory.key]) }}
              </h2>
              <p class="text-base-content/50 mt-0.5 text-sm">
                {{ $t(activeCategory.description) }}
              </p>
            </div>
          </div>
        </header>

        <div
          v-if="!activeCategory"
          class="text-base-content/50 p-8 text-center text-sm"
        >
          {{ $t('noVisibleSettingsCategories') }}
        </div>

        <div
          v-for="category in allCategoryComponents"
          v-show="activeCategory?.key === category.key"
          :key="category.key"
          :data-category-key="category.key"
        >
          <component :is="category.component" />
        </div>
      </main>
    </div>

    <SettingsCustomizationDialog v-model="customizationOpen" />
  </div>
</template>

<script setup lang="ts">
import { botSupported } from '@/assembly/fivegpn/bot'
import { dnsSupported } from '@/assembly/fivegpn/dns'
import { interceptionSupported } from '@/assembly/fivegpn/interception'
import CtrlsBar from '@/components/common/CtrlsBar.vue'
import SelectInput from '@/components/common/SelectInput.vue'
import BackendSettings from '@/components/settings/backend/BackendSettings.vue'
import ConnectionsSettings from '@/components/settings/connections/ConnectionsSettings.vue'
import FiveGPNBotSettings from '@/components/settings/fivegpn/FiveGPNBotSettings.vue'
import FiveGPNDnsSettings from '@/components/settings/fivegpn/FiveGPNDnsSettings.vue'
import FiveGPNInterceptionSettings from '@/components/settings/fivegpn/FiveGPNInterceptionSettings.vue'
import ZashboardSettings from '@/components/settings/general/ZashboardSettings.vue'
import OverviewSettings from '@/components/settings/overview/OverviewSettings.vue'
import ProxiesSettings from '@/components/settings/proxies/ProxiesSettings.vue'
import SettingsCustomizationDialog from '@/components/settings/SettingsCustomizationDialog.vue'
import SettingsSearch from '@/components/settings/SettingsSearch.vue'
import { usePaddingForViews } from '@/composables/paddingViews'
import { settingsPaneTransition } from '@/composables/pageTransition'
import { useSettingsSection, visibleSectionKeys } from '@/composables/settingsSection'
import { SETTINGS_CATEGORIES, SETTINGS_MENU_LABELS } from '@/config/settingsItems'
import { SETTINGS_MENU_KEY } from '@/constant'
import { isMiddleScreen, isPWA } from '@/helper/utils'
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CubeTransparentIcon,
  GlobeAltIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  ServerIcon,
  ShieldCheckIcon,
  SignalIcon,
} from '@heroicons/vue/24/outline'
import { useElementSize } from '@vueuse/core'
import type { Component } from 'vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

type CategoryView = {
  key: SETTINGS_MENU_KEY
  label: string
  description: string
  icon: Component
  component: Component
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const scrollContainerRef = ref<HTMLDivElement>()
const { width } = useElementSize(scrollContainerRef)
const { padding } = usePaddingForViews({ offsetTop: 0, offsetBottom: 8 })

const customizationOpen = ref(false)
const mobileSearchOpen = ref(false)
const showSideNavigation = computed(() => !isMiddleScreen.value && width.value >= 900)
const {
  sectionKey: routeSection,
  enterSection,
  exitSection,
  enteredFromMobileIndex,
} = useSettingsSection()

const clearPaneAnimation = () => {
  settingsPaneTransition.value = ''
}

const categoryPresentation: Record<SETTINGS_MENU_KEY, { icon: Component; component: Component }> = {
  [SETTINGS_MENU_KEY.general]: { icon: HomeIcon, component: ZashboardSettings },
  [SETTINGS_MENU_KEY.overview]: { icon: CubeTransparentIcon, component: OverviewSettings },
  [SETTINGS_MENU_KEY.backend]: { icon: ServerIcon, component: BackendSettings },
  [SETTINGS_MENU_KEY.proxies]: { icon: GlobeAltIcon, component: ProxiesSettings },
  [SETTINGS_MENU_KEY.connections]: {
    icon: ArrowsRightLeftIcon,
    component: ConnectionsSettings,
  },
  [SETTINGS_MENU_KEY.fivegpnDns]: { icon: SignalIcon, component: FiveGPNDnsSettings },
  [SETTINGS_MENU_KEY.fivegpnInterception]: {
    icon: ShieldCheckIcon,
    component: FiveGPNInterceptionSettings,
  },
  [SETTINGS_MENU_KEY.fivegpnBot]: { icon: ShieldCheckIcon, component: FiveGPNBotSettings },
}

// 5gpn 的三个分类只在能力发现返回肯定结果后才出现，和对应页面用的是同一道闸：
// DNS 面板改的是解析器文档，对着不提供文档的内核开表单等于打开一个存不了的表；
// 拦截面板还要求引擎装好；Bot 与拦截是彼此独立的子系统，一台网关可能只有其中一个。
// 这里连挂载一起挡掉（而不只是挡导航），否则组件仍会随分类列表挂载并去拉状态。
const isCategorySupported = (key: SETTINGS_MENU_KEY) => {
  switch (key) {
    case SETTINGS_MENU_KEY.fivegpnDns:
      return dnsSupported.value
    case SETTINGS_MENU_KEY.fivegpnInterception:
      return interceptionSupported.value
    case SETTINGS_MENU_KEY.fivegpnBot:
      return botSupported.value
    default:
      return true
  }
}

const allCategoryComponents = computed<CategoryView[]>(() =>
  SETTINGS_CATEGORIES.filter((category) => isCategorySupported(category.key)).map((category) => ({
    ...category,
    ...categoryPresentation[category.key],
  })),
)

const menuItems = computed(() => {
  return visibleSectionKeys.value.flatMap((key) => {
    const category = allCategoryComponents.value.find((item) => item.key === key)
    return category ? [category] : []
  })
})

const activeCategory = computed(() => {
  const key = routeSection.value ?? (!isMiddleScreen.value ? menuItems.value[0]?.key : undefined)
  return menuItems.value.find((item) => item.key === key)
})

const showMobileIndex = computed(() => isMiddleScreen.value && !routeSection.value)
const categorySelectOptions = computed(() =>
  menuItems.value.map((item) => ({
    value: item.key,
    label: t(SETTINGS_MENU_LABELS[item.key]),
  })),
)
const narrowCategoryKey = computed({
  get: () => activeCategory.value?.key ?? menuItems.value[0]?.key ?? SETTINGS_MENU_KEY.general,
  set: (key: SETTINGS_MENU_KEY) => selectSection(key),
})

const normalizeQuery = async () => {
  const legacy = route.query.scrollTo
  if (typeof legacy !== 'string') return
  if (!SETTINGS_CATEGORIES.some((category) => category.key === legacy)) return

  const query: Record<string, string | string[] | null | undefined> = {
    ...route.query,
    section: legacy,
  }
  delete query.scrollTo
  await router.replace({ query })
}

const selectSection = async (key: SETTINGS_MENU_KEY, settingKey?: string) => {
  await enterSection(key, settingKey)
  if (!settingKey) scrollContainerRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

const backToCategories = async () => {
  mobileSearchOpen.value = false
  await exitSection()
  scrollContainerRef.value?.scrollTo({ top: 0 })
}

const revealSetting = async (settingKey: string) => {
  await nextTick()
  requestAnimationFrame(() => {
    const element = document.getElementById(`setting-${settingKey}`)
    if (!element || !scrollContainerRef.value) return

    const containerRect = scrollContainerRef.value.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const top = scrollContainerRef.value.scrollTop + elementRect.top - containerRect.top - 20
    scrollContainerRef.value.scrollTo({ top, behavior: 'smooth' })
    element.classList.remove('highlight-flash')
    element.classList.add('highlight-flash')
    element.addEventListener('animationend', () => element.classList.remove('highlight-flash'), {
      once: true,
    })
    element.focus({ preventScroll: true })
  })
}

const openSetting = async (category: SETTINGS_MENU_KEY, settingKey: string) => {
  await selectSection(category, settingKey)
  await revealSetting(settingKey)
}

const refreshPages = async () => {
  const registrations = await navigator.serviceWorker.getRegistrations()
  for (const registration of registrations) registration.unregister()
  window.location.reload()
}

watch(
  () => [route.query.section, route.query.setting, route.query.scrollTo, menuItems.value],
  async () => {
    if (route.query.scrollTo) {
      await normalizeQuery()
      return
    }
    const settingKey = route.query.setting
    if (typeof settingKey === 'string' && routeSection.value) await revealSetting(settingKey)
  },
  { deep: true },
)

watch(routeSection, () => {
  mobileSearchOpen.value = false
  if (!routeSection.value) enteredFromMobileIndex.value = false
})

watch(
  () => [isMiddleScreen.value, routeSection.value, route.query.scrollTo, menuItems.value],
  async () => {
    if (isMiddleScreen.value || routeSection.value || route.query.scrollTo) return
    const firstCategory = menuItems.value[0]
    if (!firstCategory) return
    await router.replace({
      query: { ...route.query, section: firstCategory.key },
    })
  },
  { deep: true, immediate: true },
)

onMounted(normalizeQuery)
</script>
