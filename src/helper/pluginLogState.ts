import type { FiveGPNEngineLog, FiveGPNEngineLogPage } from '@/api/fivegpn'

const DECIMAL_CURSOR = /^(0|[1-9]\d*)$/
const MAX_UINT64_CURSOR = '18446744073709551615'

export type PluginLogWatermark = {
  streamID: string
  seq: string
}

export const toggleExpandedPluginLog = (current: string, selected: string) =>
  current === selected ? '' : selected

const compareDecimalCursor = (left: string, right: string) => {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  if (left === right) return 0
  return left < right ? -1 : 1
}

export const validPluginLogCursor = (value: unknown): value is string =>
  typeof value === 'string' &&
  DECIMAL_CURSOR.test(value) &&
  (value.length < MAX_UINT64_CURSOR.length ||
    (value.length === MAX_UINT64_CURSOR.length && value <= MAX_UINT64_CURSOR))

export const pluginLogsAfter = (
  entries: FiveGPNEngineLog[],
  streamID: string,
  watermark: PluginLogWatermark | null,
) => {
  if (!watermark || watermark.streamID !== streamID) return entries
  const index = entries.findIndex((entry) => entry.seq === watermark.seq)
  // If the ring evicted the marker, every retained entry is newer.
  return index < 0 ? entries : entries.slice(index + 1)
}

export const pluginLogsSince = ({
  entries,
  liveStreamID,
  frozenStreamID,
  frozenSeq,
}: {
  entries: FiveGPNEngineLog[]
  liveStreamID: string
  frozenStreamID: string
  frozenSeq: string
}) => {
  if (!liveStreamID || liveStreamID !== frozenStreamID || !frozenSeq) return entries.length
  const index = entries.findIndex((entry) => entry.seq === frozenSeq)
  return index < 0 ? entries.length : entries.length - index - 1
}

export const validPluginLogPage = (page: FiveGPNEngineLogPage) => {
  if (!page || typeof page.stream_id !== 'string' || !page.stream_id || page.stream_id.length > 128) {
    return false
  }
  if (!Array.isArray(page.logs) || page.logs.length > 1000) return false
  if (
    ![page.oldest_seq, page.latest_seq, page.dropped].every(
      (value) => validPluginLogCursor(value),
    )
  ) {
    return false
  }
  if (typeof page.reset !== 'boolean') return false
  if ((page.oldest_seq === '0') !== (page.latest_seq === '0')) return false
  if (compareDecimalCursor(page.oldest_seq, page.latest_seq) > 0) return false
  let previous = '0'
  for (const entry of page.logs) {
    if (!validPluginLogCursor(entry.seq)) return false
    if (compareDecimalCursor(entry.seq, previous) <= 0) return false
    if (page.oldest_seq !== '0' && compareDecimalCursor(entry.seq, page.oldest_seq) < 0) {
      return false
    }
    if (compareDecimalCursor(entry.seq, page.latest_seq) > 0) return false
    previous = entry.seq
  }
  return true
}

export const mergePluginLogPage = ({
  entries,
  streamID,
  page,
  limit,
}: {
  entries: FiveGPNEngineLog[]
  streamID: string
  page: FiveGPNEngineLogPage
  limit: number
}) => {
  const reset = !streamID || page.reset || page.stream_id !== streamID
  const known = new Set(reset ? [] : entries.map((entry) => entry.seq))
  const merged = reset ? page.logs : [...entries, ...page.logs.filter((entry) => !known.has(entry.seq))]
  return {
    entries: merged.slice(-limit),
    streamID: page.stream_id,
    cursor: page.logs.length === limit ? page.logs.at(-1)!.seq : page.latest_seq,
    dropped: page.dropped,
    reset,
    hasMore: page.logs.length === limit,
  }
}
