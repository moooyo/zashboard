import { SETTINGS_MENU_KEY } from '@/constant'

export type SettingsCategoryItem = {
  key: string
  label: string
  section: string
  keywords?: string[]
  searchEntries?: Array<{ anchorKey: string; label: string }>
}

export type SettingsCategory = {
  key: SETTINGS_MENU_KEY
  label: string
  description: string
  items: SettingsCategoryItem[]
}

export const DEFAULT_SETTINGS_MENU_ORDER = [
  SETTINGS_MENU_KEY.fivegpnDns,
  SETTINGS_MENU_KEY.fivegpnInterception,
  SETTINGS_MENU_KEY.fivegpnBot,
  SETTINGS_MENU_KEY.general,
  SETTINGS_MENU_KEY.overview,
  SETTINGS_MENU_KEY.backend,
  SETTINGS_MENU_KEY.proxies,
  SETTINGS_MENU_KEY.connections,
]

export const SETTINGS_MENU_LABELS: Record<SETTINGS_MENU_KEY, string> = {
  [SETTINGS_MENU_KEY.general]: 'settingsMenuGeneral',
  [SETTINGS_MENU_KEY.backend]: 'settingsMenuBackend',
  [SETTINGS_MENU_KEY.proxies]: 'settingsMenuProxies',
  [SETTINGS_MENU_KEY.connections]: 'settingsMenuConnections',
  [SETTINGS_MENU_KEY.overview]: 'settingsMenuOverview',
  [SETTINGS_MENU_KEY.fivegpnDns]: 'settingsMenuFiveGPNDns',
  [SETTINGS_MENU_KEY.fivegpnInterception]: 'settingsMenuFiveGPNInterception',
  [SETTINGS_MENU_KEY.fivegpnBot]: 'settingsMenuFiveGPNBot',
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    // DNS policy, upstreams and the resolve diagnostic. They used to live on
    // the 5gpn-dns page beside the query log, which put configuration and a
    // read-only stream of traffic in the same place and in neither of the two
    // idioms this console otherwise has. The page keeps the log.
    key: SETTINGS_MENU_KEY.fivegpnDns,
    label: 'fivegpnDnsSettings',
    description: 'settingsDescriptionFiveGPNDns',
    items: [
      {
        key: `${SETTINGS_MENU_KEY.fivegpnDns}.fivegpnDnsFallback`,
        label: 'fivegpnDnsFallback',
        section: 'fivegpnDnsPolicy',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnDns}.fivegpnDnsRules`,
        label: 'fivegpnDnsRules',
        section: 'fivegpnDnsPolicy',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnDns}.fivegpnDnsSubscriptions`,
        label: 'fivegpnDnsSubscriptions',
        section: 'fivegpnDnsPolicy',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnDns}.fivegpnDnsGateway`,
        label: 'fivegpnDnsGateway',
        section: 'fivegpnDnsUpstreams',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnDns}.fivegpnDnsChina`,
        label: 'fivegpnDnsChina',
        section: 'fivegpnDnsUpstreams',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnDns}.fivegpnDnsTrust`,
        label: 'fivegpnDnsTrust',
        section: 'fivegpnDnsUpstreams',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnDns}.fivegpnDnsEcs`,
        label: 'fivegpnDnsEcs',
        section: 'fivegpnDnsUpstreams',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnDns}.fivegpnDnsResolve`,
        label: 'fivegpnDnsResolve',
        section: 'fivegpnDnsDiagnose',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnDns}.fivegpnDnsFlush`,
        label: 'fivegpnDnsFlush',
        section: 'fivegpnDnsDiagnose',
      },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.fivegpnInterception,
    label: 'fivegpnInterceptionSettings',
    description: 'settingsDescriptionFiveGPNInterception',
    items: [
      {
        key: `${SETTINGS_MENU_KEY.fivegpnInterception}.fivegpnMitmMaster`,
        label: 'fivegpnMitmMaster',
        section: 'fivegpnInterceptionSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnInterception}.fivegpnHttp2`,
        label: 'fivegpnHttp2',
        section: 'fivegpnInterceptionSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnInterception}.fivegpnHttp3`,
        label: 'fivegpnHttp3',
        section: 'fivegpnInterceptionSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnInterception}.fivegpnModules`,
        label: 'fivegpnModules',
        section: 'fivegpnInterceptionSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnInterception}.fivegpnCaptureHosts`,
        label: 'fivegpnCaptureHosts',
        section: 'fivegpnInterceptionSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnInterception}.fivegpnUnavailableEgress`,
        label: 'fivegpnUnavailableEgressLabel',
        section: 'fivegpnInterceptionSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnInterception}.fivegpnCertificateExpiry`,
        label: 'fivegpnCertificateExpiry',
        section: 'fivegpnInterceptionSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnInterception}.fivegpnInterceptionRefresh`,
        label: 'fivegpnInterceptionRefresh',
        section: 'fivegpnInterceptionSettings',
      },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.fivegpnBot,
    label: 'fivegpnBotSettings',
    description: 'settingsDescriptionFiveGPNBot',
    items: [
      {
        key: `${SETTINGS_MENU_KEY.fivegpnBot}.fivegpnBotEnabled`,
        label: 'fivegpnBotEnabled',
        section: 'fivegpnBotSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnBot}.fivegpnBotState`,
        label: 'fivegpnBotState',
        section: 'fivegpnBotSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnBot}.fivegpnBotToken`,
        label: 'fivegpnBotToken',
        section: 'fivegpnBotSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnBot}.fivegpnBotAdmins`,
        label: 'fivegpnBotAdmins',
        section: 'fivegpnBotSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnBot}.fivegpnBotAlerts`,
        label: 'fivegpnBotAlerts',
        section: 'fivegpnBotSettings',
      },
      {
        key: `${SETTINGS_MENU_KEY.fivegpnBot}.fivegpnBotSave`,
        label: 'fivegpnBotSave',
        section: 'fivegpnBotSettings',
      },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.backend,
    label: 'backendSettings',
    description: 'settingsDescriptionBackend',
    items: [
      {
        key: `${SETTINGS_MENU_KEY.backend}.backendSwitch`,
        label: 'backend',
        section: 'settingsSectionCurrentBackend',
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.restartCore`,
        label: 'restartCore',
        section: 'settingsSectionCoreOperations',
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.reloadConfigs`,
        label: 'reloadConfigs',
        section: 'settingsSectionCoreOperations',
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.updateConfigs`,
        label: 'updateConfigs',
        section: 'settingsSectionCoreOperations',
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.updateGeoDatabase`,
        label: 'updateGeoDatabase',
        section: 'settingsSectionCoreOperations',
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.flushDNSCache`,
        label: 'flushDNSCache',
        section: 'settingsSectionCoreOperations',
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.flushFakeIP`,
        label: 'flushFakeIP',
        section: 'settingsSectionCoreOperations',
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.flushSmartWeights`,
        label: 'flushSmartWeights',
        section: 'settingsSectionCoreOperations',
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.dnsQuery`,
        label: 'DNSQuery',
        section: 'settingsSectionDiagnostics',
        keywords: ['dns'],
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.ports`,
        label: 'ports',
        section: 'settingsSectionNetworkListening',
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.tunMode`,
        label: 'tunMode',
        section: 'settingsSectionNetworkListening',
      },
      {
        key: `${SETTINGS_MENU_KEY.backend}.allowLan`,
        label: 'allowLan',
        section: 'settingsSectionNetworkListening',
      },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.general,
    label: 'zashboardSettings',
    description: 'settingsDescriptionGeneral',
    items: [
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.actions`,
        label: 'actions',
        section: 'settingsSectionApplication',
        searchEntries: [
          {
            anchorKey: `${SETTINGS_MENU_KEY.general}.zashboardSettings.actions`,
            label: 'dashboardSettings',
          },
        ],
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.autoSwitchTheme`,
        label: 'autoSwitchTheme',
        section: 'appearance',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.defaultTheme`,
        label: 'defaultTheme',
        section: 'appearance',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.darkTheme`,
        label: 'darkTheme',
        section: 'appearance',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.customBackgroundURL`,
        label: 'customBackgroundURL',
        section: 'appearance',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.transparent`,
        label: 'transparent',
        section: 'appearance',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.blurIntensity`,
        label: 'blurIntensity',
        section: 'appearance',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.emoji`,
        label: 'emoji',
        section: 'appearance',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.zashboardSettings.language`,
        label: 'language',
        section: 'settingsSectionApplication',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.autoDisconnectIdleUDP`,
        label: 'autoDisconnectIdleUDP',
        section: 'settingsSectionNetworkData',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.autoDisconnectIdleUDPTime`,
        label: 'autoDisconnectIdleUDPTime',
        section: 'settingsSectionNetworkData',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.IPInfoAPI`,
        label: 'IPInfoAPI',
        section: 'settingsSectionNetworkData',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.geoipCountryDatabaseURL`,
        label: 'geoipCountryDatabaseURL',
        section: 'settingsSectionNetworkData',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.geoipASNDatabaseURL`,
        label: 'geoipASNDatabaseURL',
        section: 'settingsSectionNetworkData',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.scrollAnimationEffect`,
        label: 'scrollAnimationEffect',
        section: 'settingsSectionInteraction',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.swipeInPages`,
        label: 'swipeInPages',
        section: 'settingsSectionInteraction',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.swipeInTabs`,
        label: 'swipeInTabs',
        section: 'settingsSectionInteraction',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.disablePullToRefresh`,
        label: 'disablePullToRefresh',
        section: 'settingsSectionInteraction',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.shortcuts`,
        label: 'keyboardShortcuts',
        section: 'settingsSectionInteraction',
      },
      {
        key: `${SETTINGS_MENU_KEY.general}.displayAllFeatures`,
        label: 'displayAllFeatures',
        section: 'settingsSectionInteraction',
      },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.overview,
    label: 'overviewSettings',
    description: 'settingsDescriptionOverview',
    items: [
      // This entry controls the 5gpn DNS card in the overview embedded on the
      // Settings page. It is a peer of chartsCard and networkCard.
      {
        key: `${SETTINGS_MENU_KEY.overview}.fivegpnDnsCard`,
        label: 'fivegpnDnsCard',
        section: 'settingsSectionCardsLayout',
      },
      {
        key: `${SETTINGS_MENU_KEY.overview}.overviewCard`,
        label: 'chartsCard',
        section: 'settingsSectionCardsLayout',
      },
      {
        key: `${SETTINGS_MENU_KEY.overview}.networkCard`,
        label: 'networkCard',
        section: 'settingsSectionCardsLayout',
      },
      {
        key: `${SETTINGS_MENU_KEY.overview}.splitOverviewPage`,
        label: 'splitOverviewPage',
        section: 'settingsSectionCardsLayout',
      },
      {
        key: `${SETTINGS_MENU_KEY.overview}.autoIPCheckWhenStart`,
        label: 'autoIPCheckWhenStart',
        section: 'settingsSectionStartupChecks',
      },
      {
        key: `${SETTINGS_MENU_KEY.overview}.autoConnectionCheckWhenStart`,
        label: 'autoConnectionCheckWhenStart',
        section: 'settingsSectionStartupChecks',
      },
      {
        key: `${SETTINGS_MENU_KEY.overview}.showStatisticsWhenSidebarCollapsed`,
        label: 'showStatisticsWhenSidebarCollapsed',
        section: 'settingsSectionDesktopSidebar',
      },
      {
        key: `${SETTINGS_MENU_KEY.overview}.numberOfChartsInSidebar`,
        label: 'numberOfChartsInSidebar',
        section: 'settingsSectionDesktopSidebar',
      },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.proxies,
    label: 'proxySettings',
    description: 'settingsDescriptionProxies',
    items: [
      {
        key: `${SETTINGS_MENU_KEY.proxies}.speedtestMode`,
        label: 'speedtestMode',
        section: 'latency',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.speedtestUrl`,
        label: 'speedtestUrl',
        section: 'latency',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.speedtestTimeout`,
        label: 'speedtestTimeout',
        section: 'latency',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.lowLatency`,
        label: 'lowLatencyDesc',
        section: 'latency',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.mediumLatency`,
        label: 'mediumLatencyDesc',
        section: 'latency',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.ipv6Test`,
        label: 'ipv6Test',
        section: 'latency',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.independentLatencyTest`,
        label: 'independentLatencyTest',
        section: 'latency',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.groupTestUrls`,
        label: 'groupTestUrls',
        section: 'latency',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.proxyFolderMode`,
        label: 'proxyFolderMode',
        section: 'settingsSectionProxyDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.twoColumnProxyGroup`,
        label: 'twoColumnProxyGroup',
        section: 'settingsSectionProxyDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.truncateProxyName`,
        label: 'truncateProxyName',
        section: 'settingsSectionProxyDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.displayGlobalByMode`,
        label: 'displayGlobalByMode',
        section: 'settingsSectionProxyDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.customGlobalNode`,
        label: 'customGlobalNode',
        section: 'settingsSectionProxyDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.proxyPreviewType`,
        label: 'proxyPreviewType',
        section: 'settingsSectionProxyDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.proxyCardSize`,
        label: 'proxyCardSize',
        section: 'settingsSectionProxyDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.proxyGroupIconSize`,
        label: 'proxyGroupIconSize',
        section: 'settingsSectionProxyAdvanced',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.proxyGroupIconMargin`,
        label: 'proxyGroupIconMargin',
        section: 'settingsSectionProxyAdvanced',
      },
      {
        key: `${SETTINGS_MENU_KEY.proxies}.iconSettings`,
        label: 'icon',
        section: 'settingsSectionProxyAdvanced',
      },
    ],
  },
  {
    key: SETTINGS_MENU_KEY.connections,
    label: 'connectionSettings',
    description: 'settingsDescriptionConnections',
    items: [
      {
        key: `${SETTINGS_MENU_KEY.connections}.connectionStyle`,
        label: 'connectionStyle',
        section: 'settingsSectionConnectionDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.connections}.proxyChainDirection`,
        label: 'proxyChainDirection',
        section: 'settingsSectionConnectionDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.connections}.tableWidthMode`,
        label: 'tableWidthMode',
        section: 'settingsSectionConnectionDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.connections}.tableSize`,
        label: 'tableSize',
        section: 'settingsSectionConnectionDisplay',
      },
      {
        key: `${SETTINGS_MENU_KEY.connections}.resolveClientHostname`,
        label: 'resolveClientHostname',
        section: 'settingsSectionClientIdentity',
      },
      {
        key: `${SETTINGS_MENU_KEY.connections}.sourceIPLabels`,
        label: 'sourceIPLabels',
        section: 'settingsSectionClientIdentity',
      },
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
/** Key map for the DNS settings. */
export const FIVEGPN_DNS_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.fivegpnDns)
/** Key map for 5gpn interception settings. */
export const FIVEGPN_INTERCEPTION_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.fivegpnInterception)
/** Key map for the Telegram bot settings. */
export const FIVEGPN_BOT_ITEM_KEYS = keyMapByLabel(SETTINGS_MENU_KEY.fivegpnBot)

function keyMapByLabel(categoryKey: SETTINGS_MENU_KEY): Record<string, string> {
  const category = SETTINGS_CATEGORIES.find((c) => c.key === categoryKey)
  return Object.fromEntries((category?.items ?? []).map((i) => [i.label, i.key]))
}
