import { can, type Cap } from '@/assembly/backend'
import { featureSupported } from '@/assembly/fivegpn/capabilities'
import { ROUTE_NAME } from '@/constant'

export type ProductFeature = '5gpn-dns' | '5gpn-interception'

export type RouteRequirement = {
  capability?: Cap
  feature?: ProductFeature
}

/**
 * Route requirements are declared once and copied into route meta.
 *
 * Navigation rendering and direct URL guards must never maintain independent
 * allowlists: a page hidden in the sidebar but reachable by URL is still an
 * exposed management surface, while a visible route rejected by the guard is
 * a dead control.
 */
export const ROUTE_REQUIREMENTS: Partial<Record<ROUTE_NAME, RouteRequirement>> = {
  [ROUTE_NAME.rules]: { capability: 'rules' },
  [ROUTE_NAME.tools]: { capability: 'tools' },
  [ROUTE_NAME.fivegpnDns]: { feature: '5gpn-dns' },
  [ROUTE_NAME.fivegpnSetupGuide]: { feature: '5gpn-dns' },
  [ROUTE_NAME.fivegpnExtensions]: { feature: '5gpn-interception' },
  [ROUTE_NAME.fivegpnExtensionHosts]: { feature: '5gpn-interception' },
  [ROUTE_NAME.fivegpnMarketplace]: { feature: '5gpn-interception' },
  [ROUTE_NAME.fivegpnPluginLogs]: { feature: '5gpn-interception' },
}

export const routeMeta = (name: ROUTE_NAME): RouteRequirement => ({
  ...ROUTE_REQUIREMENTS[name],
})

export const routeRequirementSatisfied = (requirement?: RouteRequirement) => {
  if (!requirement) return true
  if (requirement.capability && !can(requirement.capability)) return false
  if (requirement.feature && !featureSupported(requirement.feature).value) return false
  return true
}

export const routeAvailable = (name: ROUTE_NAME) =>
  routeRequirementSatisfied(ROUTE_REQUIREMENTS[name])
