import {
  onBeforeUnmount,
  onMounted,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type WatchStopHandle,
} from 'vue'

let activeViewportConsumers = 0

// Keep the app sized to the *visual* viewport (the area not covered by the
// on-screen keyboard) by publishing its height as the `--app-height` CSS var.
//
// iOS Safari never resizes the layout viewport (nor `dvh`/`100vh`) when the
// keyboard opens — it only shrinks the visual viewport and scrolls the page
// under the keyboard, so `position: fixed`/full-height layouts get covered and
// the user has to scroll to reach the bottom. Mirroring `visualViewport.height`
// into a CSS var (the approach Telegram and most "100vh on iOS" fixes use), plus
// pinning the page scroll, makes the whole layout shrink to the visible region
// so normal flex layout keeps everything above the keyboard. On Android/Chromium
// `visualViewport` behaves the same, so this is a single cross-platform path.
export const useViewportHeight = (enabled?: MaybeRefOrGetter<boolean>) => {
  let tracking = false
  let stopEnabledWatch: WatchStopHandle | undefined

  const update = () => {
    const viewport = window.visualViewport
    const height = viewport ? viewport.height : window.innerHeight
    document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`)
    // iOS scrolls the layout viewport to reveal the focused field (offsetTop > 0);
    // the app is already shrunk to fit, so undo that scroll to keep it aligned
    // with the visible region instead of letting content drift below the fold.
    if (viewport && viewport.offsetTop !== 0) window.scrollTo(0, 0)
  }

  const start = () => {
    if (tracking) return
    tracking = true
    activeViewportConsumers++
    update()
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
  }

  const stop = () => {
    if (!tracking) return
    tracking = false
    const viewport = window.visualViewport
    viewport?.removeEventListener('resize', update)
    viewport?.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    activeViewportConsumers = Math.max(0, activeViewportConsumers - 1)
    if (activeViewportConsumers === 0) {
      document.documentElement.style.removeProperty('--app-height')
    }
  }

  onMounted(() => {
    if (enabled === undefined) {
      start()
      return
    }
    stopEnabledWatch = watch(
      () => toValue(enabled),
      (value) => (value ? start() : stop()),
      { immediate: true },
    )
  })

  onBeforeUnmount(() => {
    stopEnabledWatch?.()
    stop()
  })
}
