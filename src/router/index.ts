import { ROUTE_NAME } from '@/constant'
import { renderRoutes } from '@/helper'
import { managementRouteDecision } from '@/helper/navigationGuard'
import '@/helper/setupHandoffBootstrap'
import { i18n } from '@/i18n'
import { language } from '@/store/settings'
import { activeBackend } from '@/store/setup'
import ConnectionsPage from '@/views/ConnectionsPage.vue'
import HomePage from '@/views/HomePage.vue'
import LogsPage from '@/views/LogsPage.vue'
import OverviewPage from '@/views/OverviewPage.vue'
import ProxiesPage from '@/views/ProxiesPage.vue'
import RulesPage from '@/views/RulesPage.vue'
import SettingsPage from '@/views/SettingsPage.vue'
import SetupPage from '@/views/SetupPage.vue'
import { useTitle } from '@vueuse/core'
import { watch } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { routeMeta, routeRequirementSatisfied, type RouteRequirement } from './requirements'

declare module 'vue-router' {
  interface RouteMeta {
    capability?: RouteRequirement['capability']
    feature?: RouteRequirement['feature']
  }
}

const childrenRouter = [
  {
    path: 'proxies',
    name: ROUTE_NAME.proxies,
    component: ProxiesPage,
    meta: routeMeta(ROUTE_NAME.proxies),
  },
  {
    path: 'overview',
    name: ROUTE_NAME.overview,
    component: OverviewPage,
    meta: routeMeta(ROUTE_NAME.overview),
  },
  {
    path: 'connections',
    name: ROUTE_NAME.connections,
    component: ConnectionsPage,
    meta: routeMeta(ROUTE_NAME.connections),
  },
  {
    path: 'logs',
    name: ROUTE_NAME.logs,
    component: LogsPage,
    meta: routeMeta(ROUTE_NAME.logs),
  },
  {
    path: 'rules',
    name: ROUTE_NAME.rules,
    component: RulesPage,
    meta: routeMeta(ROUTE_NAME.rules),
  },
  {
    path: '5gpn-setup-guide',
    name: ROUTE_NAME.fivegpnSetupGuide,
    component: () => import('@/views/FiveGPNSetupGuidePage.vue'),
    meta: routeMeta(ROUTE_NAME.fivegpnSetupGuide),
  },
  {
    path: '5gpn-dns',
    name: ROUTE_NAME.fivegpnDns,
    component: () => import('@/views/FiveGPNDnsPage.vue'),
    meta: routeMeta(ROUTE_NAME.fivegpnDns),
  },
  {
    path: 'extensions',
    name: ROUTE_NAME.fivegpnExtensions,
    component: () => import('@/views/FiveGPNExtensionsPage.vue'),
    meta: routeMeta(ROUTE_NAME.fivegpnExtensions),
  },
  {
    path: 'extensions/hosts',
    name: ROUTE_NAME.fivegpnExtensionHosts,
    component: () => import('@/views/FiveGPNExtensionHostsPage.vue'),
    meta: routeMeta(ROUTE_NAME.fivegpnExtensionHosts),
  },
  {
    path: 'marketplace',
    name: ROUTE_NAME.fivegpnMarketplace,
    component: () => import('@/views/FiveGPNMarketplacePage.vue'),
    meta: routeMeta(ROUTE_NAME.fivegpnMarketplace),
  },
  {
    path: 'plugin-logs',
    name: ROUTE_NAME.fivegpnPluginLogs,
    component: () => import('@/views/FiveGPNPluginLogsPage.vue'),
    meta: routeMeta(ROUTE_NAME.fivegpnPluginLogs),
  },
  {
    path: 'tools',
    name: ROUTE_NAME.tools,
    component: () => import('@/views/ToolsPage.vue'),
    meta: routeMeta(ROUTE_NAME.tools),
  },
  {
    path: 'settings',
    name: ROUTE_NAME.settings,
    component: SettingsPage,
    meta: routeMeta(ROUTE_NAME.settings),
  },
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: ROUTE_NAME.proxies,
      component: HomePage,
      children: childrenRouter,
    },
    {
      path: '/setup',
      name: ROUTE_NAME.setup,
      component: SetupPage,
    },
    {
      path: '/:catchAll(.*)',
      redirect: ROUTE_NAME.proxies,
    },
  ],
})

const title = useTitle('zashboard')
const setTitleByName = (name: string | symbol | undefined) => {
  if (typeof name === 'string' && activeBackend.value) {
    const backend = activeBackend.value
    const prefix = backend.label || `${backend.host}:${backend.port}`
    title.value = `${prefix} | ${i18n.global.t(name)}`
  } else {
    title.value = 'zashboard'
  }
}

router.beforeEach((to, from) => {
  const toIndex = renderRoutes.value.findIndex((item) => item === to.name)
  const fromIndex = renderRoutes.value.findIndex((item) => item === from.name)

  if (toIndex === 0 && fromIndex === renderRoutes.value.length - 1) {
    to.meta.transition = 'slide-left'
  } else if (toIndex === renderRoutes.value.length - 1 && fromIndex === 0) {
    to.meta.transition = 'slide-right'
  } else if (toIndex !== fromIndex) {
    to.meta.transition = toIndex < fromIndex ? 'slide-right' : 'slide-left'
  }

  return managementRouteDecision({
    hasBackend: Boolean(activeBackend.value),
    isSetup: to.name === ROUTE_NAME.setup,
    requirementSatisfied: routeRequirementSatisfied(to.meta),
    setupRoute: ROUTE_NAME.setup,
    fallbackRoute: ROUTE_NAME.proxies,
  })
})

router.afterEach((to) => {
  setTitleByName(to.name)
})

watch([language, activeBackend], () => {
  setTimeout(() => {
    setTitleByName(router.currentRoute.value.name)
  })
})

// If a backend switch or capability probe invalidates the current page, leave
// the management surface immediately instead of displaying stale controls.
watch(renderRoutes, () => {
  if (!routeRequirementSatisfied(router.currentRoute.value.meta)) {
    void router.replace({ name: ROUTE_NAME.proxies })
  }
})

export default router
