import type { FiveGPNCatalogEntry } from '@/api/fivegpn'

export type CatalogInstallState = 'not-installed' | 'current' | 'update-available'

export const catalogInstallState = (entry: FiveGPNCatalogEntry): CatalogInstallState => {
  if (!entry.installed_version) return 'not-installed'
  return entry.installed_current ? 'current' : 'update-available'
}
