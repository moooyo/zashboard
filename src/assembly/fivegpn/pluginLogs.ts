import type { FiveGPNEngineLog, FiveGPNEngineLogPage } from '@/api/fivegpn'
import { fetchEngineLogsAPI } from '@/api/fivegpn'
import { responseData, responseMessage, responseStatus } from '@/api/response'
import {
  mergePluginLogPage,
  pluginLogsAfter,
  pluginLogsSince,
  type PluginLogWatermark,
  validPluginLogPage,
} from '@/helper/pluginLogState'
import { SingleFlightRequest } from '@/helper/singleFlightRequest'
import {
  activeBackendSession,
  backendSessionIsCurrent,
  captureBackendSession,
} from '@/store/setup'
import { debounce } from 'lodash'
import { computed, ref, shallowRef, watch } from 'vue'

const POLL_INTERVAL = 2000
const LOG_LIMIT = 1000

export const pluginLogRing = shallowRef<FiveGPNEngineLog[]>([])
export const pluginLogError = ref('')
export const pluginLogDropped = ref('0')
export const pluginLogStreamReset = ref(false)
export const pluginLogsPaused = ref(false)
export const pluginLogSearchInput = ref('')
const pluginLogSearch = ref('')
export const pluginLogExtension = ref('')
export const pluginLogLevel = ref('')

const streamID = ref('')
const cursor = ref('0')
const frozenRing = shallowRef<FiveGPNEngineLog[]>([])
const frozenStreamID = ref('')
const frozenSeq = ref('0')
const watermark = ref<PluginLogWatermark | null>(null)
const undoWatermark = ref<PluginLogWatermark | null | undefined>(undefined)
const request = new SingleFlightRequest<FiveGPNEngineLogPage>()
let timer: ReturnType<typeof setInterval> | undefined
let consumers = 0

const commitPluginLogSearch = debounce((value: string) => {
  pluginLogSearch.value = value
}, 200)

watch(pluginLogSearchInput, (value) => commitPluginLogSearch(value))

const cancelPluginLogSearch = () => {
  commitPluginLogSearch.cancel()
  pluginLogSearch.value = pluginLogSearchInput.value
}

const displayRing = computed(() => (pluginLogsPaused.value ? frozenRing.value : pluginLogRing.value))
export const pluginLogDisplayStreamID = computed(() =>
  pluginLogsPaused.value ? frozenStreamID.value : streamID.value,
)

export const pluginLogBufferedCount = computed(() =>
  pluginLogsPaused.value
    ? pluginLogsSince({
        entries: pluginLogRing.value,
        liveStreamID: streamID.value,
        frozenStreamID: frozenStreamID.value,
        frozenSeq: frozenSeq.value,
      })
    : 0,
)

export const pluginLogPausedStreamChanged = computed(
  () =>
    pluginLogsPaused.value &&
    Boolean(frozenStreamID.value) &&
    frozenStreamID.value !== streamID.value,
)

export const pluginLogCanUndoClear = computed(() => undoWatermark.value !== undefined)

export const visiblePluginLogs = computed(() => {
  const search = pluginLogSearch.value.trim().toLowerCase()
  return pluginLogsAfter(displayRing.value, pluginLogDisplayStreamID.value, watermark.value).filter(
    (entry) => {
      if (pluginLogExtension.value && entry.extension !== pluginLogExtension.value) return false
      if (pluginLogLevel.value && entry.level !== pluginLogLevel.value) return false
      if (!search) return true
      return [entry.message, entry.extension, entry.action, entry.phase, entry.url, entry.script_digest]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    },
  )
})

export const pluginLogExtensions = computed(() =>
  [...new Set(pluginLogRing.value.map((entry) => entry.extension).filter(Boolean) as string[])].sort(),
)

export const refreshPluginLogs = async () => {
  const session = captureBackendSession()
  if (!session) return
  const requestedStreamID = streamID.value
  const requestedAfter = cursor.value
  let catchUp = false
  await request.run(
    async (signal) => {
      const res = await fetchEngineLogsAPI(
        {
          limit: LOG_LIMIT,
          ...(requestedStreamID
            ? { stream_id: requestedStreamID, after: requestedAfter }
            : {}),
        },
        signal,
      )
      const status = responseStatus(res)
      const data = responseData<FiveGPNEngineLogPage>(res)
      if (status !== 200 || !data) {
        throw new Error(responseMessage(res) || `plugin logs returned ${status}`)
      }
      if (!validPluginLogPage(data)) throw new Error('plugin logs returned an invalid cursor page')
      return data
    },
    (page) => {
      if (!backendSessionIsCurrent(session)) return
      const merged = mergePluginLogPage({
        entries: pluginLogRing.value,
        streamID: requestedStreamID,
        page,
        limit: LOG_LIMIT,
      })
      const changedStream = Boolean(requestedStreamID) && merged.reset
      pluginLogRing.value = merged.entries
      streamID.value = merged.streamID
      cursor.value = merged.cursor
      if (changedStream) pluginLogDropped.value = '0'
      if (merged.dropped !== '0') pluginLogDropped.value = merged.dropped
      if (changedStream) {
        pluginLogStreamReset.value = true
        if (!pluginLogsPaused.value) {
          watermark.value = null
          undoWatermark.value = undefined
        }
      }
      pluginLogError.value = ''
      catchUp = merged.hasMore && merged.cursor !== requestedAfter
    },
    (error) => {
      if (!backendSessionIsCurrent(session)) return
      pluginLogError.value = responseMessage(error) || String(error)
    },
  )
  if (catchUp && backendSessionIsCurrent(session)) void refreshPluginLogs()
}

export const setPluginLogsPaused = (paused: boolean) => {
  if (paused === pluginLogsPaused.value) return
  if (paused) {
    frozenRing.value = pluginLogRing.value.slice()
    frozenStreamID.value = streamID.value
    frozenSeq.value = cursor.value
  }
  pluginLogsPaused.value = paused
  if (!paused) {
    frozenRing.value = []
    frozenStreamID.value = ''
    frozenSeq.value = '0'
    if (watermark.value && watermark.value.streamID !== streamID.value) {
      watermark.value = null
      undoWatermark.value = undefined
    }
  }
}

export const clearPluginLogView = () => {
  const last = pluginLogsAfter(
    displayRing.value,
    pluginLogDisplayStreamID.value,
    watermark.value,
  ).at(-1)
  if (!last || !pluginLogDisplayStreamID.value) return
  undoWatermark.value = watermark.value
  watermark.value = { streamID: pluginLogDisplayStreamID.value, seq: last.seq }
}

export const undoPluginLogClear = () => {
  if (undoWatermark.value === undefined) return
  watermark.value = undoWatermark.value
  undoWatermark.value = undefined
}

export const startPluginLogPolling = () => {
  consumers += 1
  if (timer) return
  void refreshPluginLogs()
  timer = setInterval(() => void refreshPluginLogs(), POLL_INTERVAL)
}

export const stopPluginLogPolling = () => {
  if (consumers === 0) return
  consumers -= 1
  if (consumers > 0 || !timer) return
  clearInterval(timer)
  timer = undefined
  request.cancel()
  cancelPluginLogSearch()
}

const resetForBackend = () => {
  request.cancel()
  pluginLogRing.value = []
  streamID.value = ''
  cursor.value = '0'
  frozenRing.value = []
  frozenStreamID.value = ''
  frozenSeq.value = '0'
  watermark.value = null
  undoWatermark.value = undefined
  pluginLogError.value = ''
  pluginLogDropped.value = '0'
  pluginLogStreamReset.value = false
  pluginLogsPaused.value = false
  commitPluginLogSearch.cancel()
  pluginLogSearchInput.value = ''
  pluginLogSearch.value = ''
  if (consumers > 0) void refreshPluginLogs()
}

watch(activeBackendSession, (session, previous) => {
  if (session?.epoch !== previous?.epoch) resetForBackend()
})
