import { MIN_PROXY_CARD_WIDTH, PROXY_CARD_SIZE } from '@/constant'
import type { Backend } from '@/types'
import { useMediaQuery } from '@vueuse/core'
import dayjs from 'dayjs'
import prettyBytes, { type Options } from 'pretty-bytes'

export const isPreferredDark = useMediaQuery('(prefers-color-scheme: dark)')
export const isMiddleScreen = useMediaQuery('(max-width: 768px)')
export const isPWA = (() => {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone
})()

export const prettyBytesHelper = (bytes: number, opts?: Options) => {
  // prettyBytes 对 NaN / Infinity 是抛错的。格式化函数几乎全在渲染函数里调用,
  // 一个脏字段抛出去就会毁掉整棵 vnode 树(而不只是这一格),故就地兜住。
  return prettyBytes(Number.isFinite(bytes) ? bytes : 0, {
    binary: false,
    ...opts,
  })
}

export const fromNow = (timestamp: string | number) => {
  return dayjs(timestamp).fromNow()
}

export const getDashboardSettingsFromStorage = () => {
  const settings: Record<string, string> = {}

  for (const key in localStorage) {
    if (key.startsWith('config/')) {
      settings[key] = localStorage.getItem(key) as string
    }
  }

  return settings
}

export const applyDashboardSettingsToStorage = (settings: Record<string, unknown>) => {
  for (const key in settings) {
    if (key.startsWith('config/')) {
      localStorage.setItem(key, settings[key] as string)
    }
  }
}

export const exportSettings = () => {
  const settings = getDashboardSettingsFromStorage()
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'zashboard-settings'
  a.click()
  URL.revokeObjectURL(url)
}

export const resetSettings = () => {
  const keysToReset = Object.keys(localStorage).filter((key) => {
    return key.startsWith('config/')
  })

  keysToReset.forEach((key) => localStorage.removeItem(key))
  window.location.reload()
}

export const getUrlFromBackend = (end: {
  protocol: string
  host: string
  port: string
  secondaryPath?: string
}) => {
  return `${end.protocol}://${end.host}:${end.port}${end.secondaryPath || ''}`
}

// sing-box 后端复用顶层连接字段作为 gRPC baseUrl(secondaryPath 留空)。
export const getSingboxUrlFromBackend = (
  end: Pick<Backend, 'type' | 'protocol' | 'host' | 'port'>,
) => {
  if (end.type !== 'singbox' || !end.host) return ''
  return `${end.protocol}://${end.host}:${end.port}`
}

export const getSingboxSecret = (end: Pick<Backend, 'type' | 'password'>) =>
  end.type === 'singbox' ? end.password || '' : ''

// 探测 / 诊断打的那个地址:sing-box 走 gRPC baseUrl,其余走 Clash REST 根路径。
export const getBackendProbeUrl = (end: Omit<Backend, 'uuid'>) =>
  end.type === 'singbox' ? getSingboxUrlFromBackend(end) : getUrlFromBackend(end)

export const getLabelFromBackend = (end: Omit<Backend, 'uuid'>) => {
  return end.label || `${end.host}:${end.port}`
}

export const getMinCardWidth = (size: PROXY_CARD_SIZE) => {
  return size === PROXY_CARD_SIZE.LARGE ? MIN_PROXY_CARD_WIDTH.LARGE : MIN_PROXY_CARD_WIDTH.SMALL
}

export const PROXIES_PARENT_CLASS = 'proxies-scrollable-parent'

export const scrollIntoCenter = (el: HTMLElement) => {
  const scrollableParent = findScrollableParent(el)

  if (!scrollableParent) return

  const parentTop = scrollableParent.offsetTop
  const childTop = el.offsetTop

  // 判断可见性只能用布局位置(offsetTop),不能用 getBoundingClientRect:
  // 列表重排时 TransitionGroup 的 FLIP 会给卡片挂 transform,rect 停在动画起点(旧位置,
  // 通常还在视口内),会被误判成"已经可见"而跳过滚动。
  const relativeTop = childTop - parentTop - scrollableParent.scrollTop

  if (relativeTop >= 0 && relativeTop + el.clientHeight <= scrollableParent.clientHeight) return

  const centerOffset =
    childTop - parentTop - scrollableParent.clientHeight / 2 + el.clientHeight / 2

  scrollableParent.scrollTo({
    top: centerOffset,
    behavior: 'smooth',
  })
}

export const findScrollableParent = (el: HTMLElement | null): HTMLElement | null => {
  const parent = el?.parentElement

  if (
    parent?.classList.contains(PROXIES_PARENT_CLASS) &&
    parent.scrollHeight > parent.clientHeight
  ) {
    return parent
  }

  return parent ? findScrollableParent(parent) : null
}

// getBackendFromUrl() 及其 getProtocolFromQuery() 辅助函数已被移除,不要从上游合回来。
// 它把任意 query 里的 hostname/secret 直接当作后端凭据接受(含明文 http 与跨源目标),
// 正是 5gpn 要关掉的那条路径。凭据只从 `/setup` hash 片段进入,并由
// src/helper/setupHandoff.ts 强制 HTTPS、同源与一次性擦除。
