import type { FiveGPNCatalogEntry, FiveGPNCatalogSourceView } from '@/api/fivegpn'

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

export const projectMarketplace = (
  sources: FiveGPNCatalogSourceView[],
  {
    sourceID,
    query,
    sort,
  }: {
    sourceID: string
    query: string
    sort: MarketplaceSort
  },
) => {
  const needle = query.trim().toLowerCase()
  return sources
    .filter((source) => !sourceID || source.id === sourceID)
    .map((source) => {
      const entries = source.entries.filter((entry) => {
        if (!needle) return true
        return [entry.name, entry.id, entry.description, ...(entry.tags ?? [])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      })
      return { ...source, entries: sortEntries(entries, sort) }
    })
}
