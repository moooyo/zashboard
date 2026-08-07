const LOCATION_SEARCH_MAX_BYTES = 256

export const locationSearchQueryTooLong = (query: string) =>
  new TextEncoder().encode(query).length > LOCATION_SEARCH_MAX_BYTES

export const hasVisibleMapIntersection = (entries: ReadonlyArray<{ isIntersecting: boolean }>) =>
  entries.some((entry) => entry.isIntersecting)

export const tileBatchHasFailure = (failedTiles: number) => failedTiles > 0
