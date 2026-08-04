import { SETTINGS_MENU_KEY } from '@/constant'

export type SettingsCategoryItem = {
  key: string
  label: string
}

export type SettingsCategory = {
  key: SETTINGS_MENU_KEY
  label: string
  items: SettingsCategoryItem[]
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    // DNS policy, upstreams and the resolve diagnostic. They used to live on
    // the gpn-dns page beside the query log, which put configuration and a
    // read-only stream of traffic in the same place and in neither of the two
    // idioms this console otherwise has. The page keeps the log.
    key: SETTINGS_MENU_KEY.gpnDns,
    label: 'gpnDnsSettings',
    items: [
      { key: `${SETTINGS_MENU_KEY.gpnDns}.gpnDnsFallback`, label: 'gpnDnsFallback' },
      { key: `${SETTINGS_MENU_KEY.gpnDns}.gpnDnsRules`, label: 'gpnDnsRules' },
      { key: `${SETTINGS_MENU_KEY.gpnDns}.gpnDnsSubscriptions`, label: 'gpnDnsSubscriptions' },
      { key: `${SETTINGS_MENU_KEY.gpnDns}.gpnDnsGateway`, label: 'gpnDnsGateway' },
      { key: `${SETTINGS_MENU_KEY.gpnDns}.gpnDnsChina`, label: 'gpnDnsChina' },
      { key: `${SETTINGS_MENU_KEY.gpnDns}.gpnDnsTrust`, label: 'gpnDnsTrust' },
      { key: `${SETTINGS_MENU_KEY.gpnDns}.gpnDnsEcs`, label: 'gpnDnsEcs' },
      { key: `${SETTINGS_MENU_KEY.gpnDns}.gpnDnsResolve`, label: 'gpnDnsResolve' },
      { key: `${SETTINGS_MENU_KEY.gpnDns}.gpnDnsFlush`, label: 'gpnDnsFlush' },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.gpnInterception,
    label: 'gpnInterceptionSettings',
    items: [
      { key: `${SETTINGS_MENU_KEY.gpnInterception}.gpnMitmMaster`, label: 'gpnMitmMaster' },
      { key: `${SETTINGS_MENU_KEY.gpnInterception}.gpnHttp2`, label: 'gpnHttp2' },
      { key: `${SETTINGS_MENU_KEY.gpnInterception}.gpnHttp3`, label: 'gpnHttp3' },
      { key: `${SETTINGS_MENU_KEY.gpnInterception}.gpnModules`, label: 'gpnModules' },
      { key: `${SETTINGS_MENU_KEY.gpnInterception}.gpnCaptureHosts`, label: 'gpnCaptureHosts' },
      { key: `${SETTINGS_MENU_KEY.gpnInterception}.gpnUnboundEgress`, label: 'gpnUnboundEgress' },
      {
        key: `${SETTINGS_MENU_KEY.gpnInterception}.gpnCertificateExpiry`,
        label: 'gpnCertificateExpiry',
      },
      {
        key: `${SETTINGS_MENU_KEY.gpnInterception}.gpnInterceptionRefresh`,
        label: 'gpnInterceptionRefresh',
      },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.gpnBot,
    label: 'gpnBotSettings',
    items: [
      { key: `${SETTINGS_MENU_KEY.gpnBot}.gpnBotEnabled`, label: 'gpnBotEnabled' },
      { key: `${SETTINGS_MENU_KEY.gpnBot}.gpnBotState`, label: 'gpnBotState' },
      { key: `${SETTINGS_MENU_KEY.gpnBot}.gpnBotToken`, label: 'gpnBotToken' },
      { key: `${SETTINGS_MENU_KEY.gpnBot}.gpnBotAdmins`, label: 'gpnBotAdmins' },
      { key: `${SETTINGS_MENU_KEY.gpnBot}.gpnBotAlerts`, label: 'gpnBotAlerts' },
      { key: `${SETTINGS_MENU_KEY.gpnBot}.gpnBotSave`, label: 'gpnBotSave' },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.backend,
    label: 'backendSettings',
    items: [
      { key: `${SETTINGS_MENU_KEY.backend}.backendSwitch`, label: 'backend' },
      { key: `${SETTINGS_MENU_KEY.backend}.upgradeCore`, label: 'upgradeCore' },
      { key: `${SETTINGS_MENU_KEY.backend}.restartCore`, label: 'restartCore' },
      { key: `${SETTINGS_MENU_KEY.backend}.reloadConfigs`, label: 'reloadConfigs' },
      { key: `${SETTINGS_MENU_KEY.backend}.updateConfigs`, label: 'updateConfigs' },
      { key: `${SETTINGS_MENU_KEY.backend}.updateGeoDatabase`, label: 'updateGeoDatabase' },
      { key: `${SETTINGS_MENU_KEY.backend}.flushDNSCache`, label: 'flushDNSCache' },
      { key: `${SETTINGS_MENU_KEY.backend}.flushFakeIP`, label: 'flushFakeIP' },
      { key: `${SETTINGS_MENU_KEY.backend}.flushSmartWeights`, label: 'flushSmartWeights' },
      { key: `${SETTINGS_MENU_KEY.backend}.dnsQuery`, label: 'DNSQuery' },
      { key: `${SETTINGS_MENU_KEY.backend}.ports`, label: 'ports' },
      { key: `${SETTINGS_MENU_KEY.backend}.tunMode`, label: 'tunMode' },
      { key: `${SETTINGS_MENU_KEY.backend}.allowLan`, label: 'allowLan' },
      { key: `${SETTINGS_MENU_KEY.backend}.checkCoreUpgrade`, label: 'checkCoreUpgrade' },
      { key: `${SETTINGS_MENU_KEY.backend}.autoUpgradeCore`, label: 'autoUpgradeCore' },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.general,
    label: 'zashboardSettings',
    items: [
      { key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.actions`, label: 'actions' },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.autoSwitchTheme`,
        label: 'autoSwitchTheme',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.defaultTheme`,
        label: 'defaultTheme',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.darkTheme`,
        label: 'darkTheme',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.customBackgroundURL`,
        label: 'customBackgroundURL',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.transparent`,
        label: 'transparent',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.blurIntensity`,
        label: 'blurIntensity',
      },
      { key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.fonts`, label: 'fonts' },
      { key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.emoji`, label: 'emoji' },
      { key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.language`, label: 'language' },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.autoUpgradeDashboard`,
        label: 'autoUpgradeDashboard',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.autoDisconnectIdleUDP`,
        label: 'autoDisconnectIdleUDP',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.autoDisconnectIdleUDPTime`,
        label: 'autoDisconnectIdleUDPTime',
      },
      { key: `${SETTINGS_MENU_KEY.general}.IPInfoAPI`, label: 'IPInfoAPI' },
      {
        key: `${SETTINGS_MENU_KEY.general}.geoipCountryDatabaseURL`,
        label: 'geoipCountryDatabaseURL',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.geoipASNDatabaseURL`,
        label: 'geoipASNDatabaseURL',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.scrollAnimationEffect`,
        label: 'scrollAnimationEffect',
      },
      { key: `${SETTINGS_MENU_KEY.general}.swipeInPages`, label: 'swipeInPages' },
      { key: `${SETTINGS_MENU_KEY.general}.swipeInTabs`, label: 'swipeInTabs' },
      {
        key: `${SETTINGS_MENU_KEY.general}.disablePullToRefresh`,
        label: 'disablePullToRefresh',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.shortcuts`,
        label: 'keyboardShortcuts',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.displayAllFeatures`,
        label: 'displayAllFeatures',
      },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.overview,
    label: 'overviewSettings',
    items: [
      // 这一条对应设置页内嵌概览里的 5gpn DNS 卡片。它和 chartsCard /
      // networkCard 是同一层的东西 —— 都是「内嵌概览里显示哪几张卡」。
      { key: `${SETTINGS_MENU_KEY.overview}.gpnDnsCard`, label: 'gpnDnsCard' },
      { key: `${SETTINGS_MENU_KEY.overview}.overviewCard`, label: 'chartsCard' },
      { key: `${SETTINGS_MENU_KEY.overview}.networkCard`, label: 'networkCard' },
      { key: `${SETTINGS_MENU_KEY.overview}.splitOverviewPage`, label: 'splitOverviewPage' },
      {
        key: `${SETTINGS_MENU_KEY.overview}.autoIPCheckWhenStart`,
        label: 'autoIPCheckWhenStart',
      },
      {
        key: `${SETTINGS_MENU_KEY.overview}.autoConnectionCheckWhenStart`,
        label: 'autoConnectionCheckWhenStart',
      },
      {
        key: `${SETTINGS_MENU_KEY.overview}.showStatisticsWhenSidebarCollapsed`,
        label: 'showStatisticsWhenSidebarCollapsed',
      },
      {
        key: `${SETTINGS_MENU_KEY.overview}.numberOfChartsInSidebar`,
        label: 'numberOfChartsInSidebar',
      },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.proxies,
    label: 'proxySettings',
    items: [
      { key: `${SETTINGS_MENU_KEY.proxies}.speedtestMode`, label: 'speedtestMode' },
      { key: `${SETTINGS_MENU_KEY.proxies}.speedtestUrl`, label: 'speedtestUrl' },
      { key: `${SETTINGS_MENU_KEY.proxies}.speedtestTimeout`, label: 'speedtestTimeout' },
      { key: `${SETTINGS_MENU_KEY.proxies}.lowLatency`, label: 'lowLatencyDesc' },
      { key: `${SETTINGS_MENU_KEY.proxies}.mediumLatency`, label: 'mediumLatencyDesc' },
      { key: `${SETTINGS_MENU_KEY.proxies}.ipv6Test`, label: 'ipv6Test' },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.independentLatencyTest`,
        label: 'independentLatencyTest',
      },
      { key: `${SETTINGS_MENU_KEY.proxies}.groupTestUrls`, label: 'groupTestUrls' },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.proxyFolderMode`,
        label: 'proxyFolderMode',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.twoColumnProxyGroup`,
        label: 'twoColumnProxyGroup',
      },
      { key: `${SETTINGS_MENU_KEY.proxies}.truncateProxyName`, label: 'truncateProxyName' },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.displayGlobalByMode`,
        label: 'displayGlobalByMode',
      },
      { key: `${SETTINGS_MENU_KEY.proxies}.customGlobalNode`, label: 'customGlobalNode' },
      { key: `${SETTINGS_MENU_KEY.proxies}.proxyPreviewType`, label: 'proxyPreviewType' },
      { key: `${SETTINGS_MENU_KEY.proxies}.proxyCardSize`, label: 'proxyCardSize' },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.proxyGroupIconSize`,
        label: 'proxyGroupIconSize',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.proxyGroupIconMargin`,
        label: 'proxyGroupIconMargin',
      },
      { key: `${SETTINGS_MENU_KEY.proxies}.iconSettings`, label: 'icon' },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.connections,
    label: 'connectionSettings',
    items: [
      {
        key: `${SETTINGS_MENU_KEY.connections}.connectionStyle`,
        label: 'connectionStyle',
      },
      {
        key: `${SETTINGS_MENU_KEY.connections}.proxyChainDirection`,
        label: 'proxyChainDirection',
      },
      { key: `${SETTINGS_MENU_KEY.connections}.tableWidthMode`, label: 'tableWidthMode' },
      { key: `${SETTINGS_MENU_KEY.connections}.tableSize`, label: 'tableSize' },
      { key: `${SETTINGS_MENU_KEY.connections}.sourceIPLabels`, label: 'sourceIPLabels' },
    ],
  },
]

/**
 * Returns all item keys for a category (sub-items only, not the category key itself).
 * Use for computing "has any visible item" in a settings section.
 */
export function getItemKeysByCategory(categoryKey: SETTINGS_MENU_KEY): string[] {
  const category = SETTINGS_CATEGORIES.find((c) => c.key === categoryKey)
  return category ? category.items.map((item) => item.key) : []
}

/**
 * Returns the category key plus all item keys for that category.
 * Use when you need both the top-level menu key and all sub-item keys (e.g. getAllSettingKeys).
 */
export function getAllKeysForCategory(categoryKey: SETTINGS_MENU_KEY): string[] {
  const category = SETTINGS_CATEGORIES.find((c) => c.key === categoryKey)
  if (!category) return []
  return [category.key, ...category.items.map((item) => item.key)]
}

/**
 * Returns all setting keys (category keys and item keys) across all categories.
 */
export function getAllSettingKeys(): string[] {
  return SETTINGS_CATEGORIES.flatMap((c) => getAllKeysForCategory(c.key))
}

/** Key map for general settings: label -> full key. Use with useIsSettingVisible(KEY_MAP.item). */
export const GENERAL_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.general)
/** Key map for overview settings. */
export const OVERVIEW_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.overview)
/** Key map for backend settings. */
export const BACKEND_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.backend)
/** Key map for proxies settings. */
export const PROXIES_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.proxies)
/** Key map for connections settings. */
export const CONNECTIONS_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.connections)
/** Key map for 5gpn interception settings. */
export const GPN_DNS_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.gpnDns)
/** Key map for the DNS settings. */
export const GPN_INTERCEPTION_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.gpnInterception)
/** Key map for the Telegram bot settings. */
export const GPN_BOT_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.gpnBot)

function keyMapByLabel(categoryKey: SETTINGS_MENU_KEY): Record<string, string> {
  const category = SETTINGS_CATEGORIES.find((c) => c.key === categoryKey)
  return Object.fromEntries((category?.items ?? []).map((i) => [i.label, i.key]))
}
