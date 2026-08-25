import type { FiveGPNCatalogEntry, FiveGPNCatalogView } from '@/api/fivegpn'

export type MarketplaceSort = 'catalog' | 'name' | 'id' | 'version'

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })

const sortEntries = (entries: FiveGPNCatalogEntry[], sort: MarketplaceSort) => {
  if (sort === 'catalog') return entries
  const value = (entry: FiveGPNCatalogEntry) => {
    if (sort === 'name') return entry.name || entry.id
    if (sort === 'version') return entry.version ?? ''
    return entry.id
  }
  return [...entries].sort((left, right) => {
    return compareText(value(left), value(right)) || compareText(left.id, right.id)
  })
}

/**
 * Project the one compiled-in index into the visible entry list.
 *
 * `entries` is guarded rather than dereferenced directly: with a single index,
 * a response that omits the array would otherwise blank the whole page with no
 * error to explain it.
 */
export const projectMarketplace = (
  catalog: FiveGPNCatalogView | null,
  {
    query,
    sort,
  }: {
    query: string
    sort: MarketplaceSort
  },
) => {
  const needle = query.trim().toLowerCase()
  const entries = (catalog?.entries ?? []).filter((entry) => {
    if (!needle) return true
    return [entry.name, entry.id, entry.description, ...(entry.tags ?? [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle))
  })
  return sortEntries(entries, sort)
}
