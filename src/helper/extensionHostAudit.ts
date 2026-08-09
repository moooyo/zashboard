import type { FiveGPNModuleSummary } from '@/api/fivegpn'

export const canonicalAuditHost = (value: string) =>
  value.trim().toLowerCase().replace(/\.+$/, '')

export const capturePatternMatches = (pattern: string, input: string) => {
  const host = canonicalAuditHost(input)
  const normalized = canonicalAuditHost(pattern)
  if (!host || !normalized) return false
  if (!normalized.startsWith('*.')) return host === normalized
  const suffix = normalized.slice(2)
  return host !== suffix && host.endsWith(`.${suffix}`)
}

export const orderedExtensionModules = (
  modules: FiveGPNModuleSummary[],
  executionOrder: string[],
) => {
  const byID = new Map(modules.map((module) => [module.id, module]))
  const ordered: FiveGPNModuleSummary[] = []
  for (const id of executionOrder) {
    const module = byID.get(id)
    if (!module) continue
    ordered.push(module)
    byID.delete(id)
  }
  return [...ordered, ...byID.values()]
}

export const extensionEgressWinner = (
  modules: FiveGPNModuleSummary[],
  executionOrder: string[],
  input: string,
) =>
  // This is the configured first-match owner. Runtime readiness is a separate
  // fail-closed projection and must be shown alongside the binding.
  orderedExtensionModules(modules, executionOrder).find(
    (module) =>
      module.enabled && module.capture_hosts.some((pattern) => capturePatternMatches(pattern, input)),
  )
