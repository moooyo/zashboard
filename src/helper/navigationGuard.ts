export type NavigationDecision = true | { name: string }

/**
 * Decide a direct route before Vue confirms it.
 *
 * Returning a replacement location is essential. Starting a second
 * `router.push` from inside a guard races the original navigation and can let
 * the guarded page commit for one frame or win entirely.
 */
export const managementRouteDecision = ({
  hasBackend,
  isSetup,
  requirementSatisfied,
  setupRoute,
  fallbackRoute,
}: {
  hasBackend: boolean
  isSetup: boolean
  requirementSatisfied: boolean
  setupRoute: string
  fallbackRoute: string
}): NavigationDecision => {
  if (!hasBackend && !isSetup) return { name: setupRoute }
  if (!requirementSatisfied) return { name: fallbackRoute }
  return true
}
