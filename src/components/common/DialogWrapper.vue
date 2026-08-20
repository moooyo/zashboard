<template>
  <Teleport to="#app-content">
    <!--
      :duration 必须显式给：Vue 只测量根元素上的 transition，而移动端抽屉的滑入
      (0.35s) 比遮罩淡出 (0.25s) 长，自动推断会在 0.25s 就掐断离场动画。
    -->
    <Transition
      name="modal"
      :duration="350"
    >
      <div
        v-show="isOpen"
        ref="backdropRef"
        class="modal modal-open"
        :class="mobileSheet && 'mobile-sheet-modal max-md:items-end max-md:justify-items-stretch'"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        @keydown="handleKeydown"
      >
        <!-- Backdrop -->
        <div
          class="modal-backdrop w-screen"
          aria-hidden="true"
          @click="closeOnBackdrop && close()"
        />

        <!-- Dialog surface -->
        <div
          ref="modalBoxRef"
          class="modal-box bg-base-100 relative flex flex-col overflow-hidden p-0 outline-none max-md:max-h-[85dvh] max-md:min-h-[calc(var(--dialog-viewport-height,100dvh)*0.4)]"
          :class="[
            blurIntensity < 5 && 'backdrop-blur-sm!',
            mobileSheet &&
              'max-md:m-0 max-md:w-full max-md:max-w-none max-md:rounded-t-xl max-md:rounded-b-none',
            boxClass,
          ]"
          tabindex="-1"
          @click.stop
          @keydown.enter.self="enter"
        >
          <div
            v-if="title && isOpen"
            :id="titleId"
            class="border-base-content/10 relative shrink-0 border-b px-4 py-2 text-base font-bold"
          >
            {{ title }}
            <slot name="title-right" />
            <button
              type="button"
              class="btn btn-circle btn-ghost btn-xs absolute top-2 right-2"
              aria-label="close"
              :disabled="closeDisabled"
              @click="close"
            >
              <XMarkIcon class="h-4 w-4" />
            </button>
          </div>
          <!--
            高度区间在移动端由 .modal-box 统一约束（见上面的 max-h-[85dvh] / min-h 40%），
            这里只负责吃掉剩余空间；桌面端维持原本加在滚动容器上的 90dvh 不变。
            下限跟 --dialog-viewport-height 走而不是 dvh：内容很少的抽屉也不至于矮成一条，
            软键盘弹起时又不会撑破 .modal 的可视高度。
            safe-area 补在滚动容器的 padding 上而不是 .modal-box 上，这样最后一条内容能
            滚到 home indicator 上方，抽屉背景仍然铺满到屏幕物理下缘。
          -->
          <div
            v-if="isOpen"
            class="min-h-0 overflow-y-auto max-md:flex-1 md:max-h-[90dvh]"
            :class="[
              noPadding
                ? 'p-0 max-md:pb-[env(safe-area-inset-bottom)]'
                : 'p-4 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]',
              bodyClass,
            ]"
          >
            <slot />
          </div>
          <div
            v-if="isOpen && $slots.footer"
            class="border-base-content/10 shrink-0 border-t"
            :class="footerClass"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useDialogOpenState } from '@/composables/dialog'
import { acquireModalLock } from '@/composables/modalState'
import { blurIntensity } from '@/store/settings'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import { nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'

const isOpen = defineModel<boolean>()
const props = withDefaults(
  defineProps<{
    noPadding?: boolean
    boxClass?: string
    bodyClass?: string
    footerClass?: string
    title?: string
    mobileSheet?: boolean
    closeOnBackdrop?: boolean
    closeOnEscape?: boolean
    historyEntry?: boolean
    historyKey?: string
    restoreFromHistory?: boolean
    closeDisabled?: boolean
  }>(),
  {
    closeOnBackdrop: true,
    closeOnEscape: true,
    restoreFromHistory: true,
  },
)
const emits = defineEmits<{
  (e: 'enter'): void
  (e: 'close'): void
}>()

const modalBoxRef = ref<HTMLDivElement | undefined>(undefined)
const componentId = useId()
const titleId = `dialog-title-${componentId}`
const historyMarker = props.historyKey || `dialog-${componentId}`
let restoreFocusTo: HTMLElement | null = null
let releaseModalLock: (() => void) | undefined
let historyPushed = false
let mounted = false
let restoringHistory = false
let removingHistory = false

// 记账「当前有几个弹窗打开着」，并在打开期间跟踪可视视口高度（软键盘）。
useDialogOpenState(isOpen)

watch(
  isOpen,
  async (val) => {
    if (val) {
      restoreFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
      releaseModalLock?.()
      releaseModalLock = acquireModalLock()
      await nextTick()
      requestAnimationFrame(() => {
        const box = modalBoxRef.value
        if (box && !box.contains(document.activeElement)) box.focus()
      })
      return
    }
    releaseModalLock?.()
    releaseModalLock = undefined
    const target = restoreFocusTo
    restoreFocusTo = null
    requestAnimationFrame(() => target?.focus({ preventScroll: true }))
  },
  { immediate: true },
)

onUnmounted(() => releaseModalLock?.())

const pushHistoryEntry = () => {
  if (!props.historyEntry || historyPushed || removingHistory || typeof window === 'undefined') {
    return
  }
  window.history.pushState({ ...window.history.state, zashboardDialog: historyMarker }, '')
  historyPushed = true
}

const removeHistoryEntry = () => {
  if (!historyPushed || typeof window === 'undefined') return
  historyPushed = false
  if (window.history.state?.zashboardDialog === historyMarker) {
    removingHistory = true
    window.history.back()
  }
}

const handlePopState = (event: PopStateEvent) => {
  if (removingHistory) {
    removingHistory = false
    if (isOpen.value) pushHistoryEntry()
    return
  }
  if (restoringHistory) {
    restoringHistory = false
    return
  }
  if (!historyPushed || !isOpen.value) {
    if (event.state?.zashboardDialog === historyMarker) {
      if (props.restoreFromHistory) {
        historyPushed = true
        isOpen.value = true
      } else {
        window.history.replaceState({ ...event.state, zashboardDialog: undefined }, '')
      }
    }
    return
  }
  if (props.closeDisabled) {
    restoringHistory = true
    window.history.forward()
    return
  }
  historyPushed = false
  isOpen.value = false
  emits('close')
}

onMounted(() => {
  mounted = true
  window.addEventListener('popstate', handlePopState)
  if (!isOpen.value && window.history.state?.zashboardDialog === historyMarker) {
    window.history.replaceState({ ...window.history.state, zashboardDialog: undefined }, '')
  }
  if (isOpen.value) pushHistoryEntry()
})

watch(isOpen, (open) => {
  if (!mounted) return
  if (open) pushHistoryEntry()
  else removeHistoryEntry()
})

watch(
  () => props.closeDisabled,
  async (disabled) => {
    if (!disabled || !isOpen.value) return
    await nextTick()
    const box = modalBoxRef.value
    const active = document.activeElement
    if (box && (!active || !box.contains(active) || active.hasAttribute('disabled'))) box.focus()
  },
)

onUnmounted(() => {
  mounted = false
  removeHistoryEntry()
  window.removeEventListener('popstate', handlePopState)
})

function close() {
  if (props.closeDisabled) return
  isOpen.value = false
  emits('close')
}
function enter() {
  emits('enter')
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (props.closeOnEscape) close()
    return
  }
  if (event.key !== 'Tab' || !modalBoxRef.value) return
  const focusable = [...modalBoxRef.value.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => element.offsetParent !== null,
  )
  if (!focusable.length) {
    event.preventDefault()
    modalBoxRef.value.focus()
    return
  }
  const first = focusable[0]
  const last = focusable.at(-1)!
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === modalBoxRef.value)
  ) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<style scoped>
/*
 * 动效按项目约定本该集中在 assets/styles/utilities/motion.css，这里是有意保留的例外
 * （motion.css 文件头有对应说明）：过渡类和模板耦合紧，拆开反而更难改。
 * 曲线沿用项目统一的 cubic-bezier(0.32, 0.72, 0, 1)。
 */

/* 遮罩淡入淡出 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease-out;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* 桌面端居中卡片：缩放淡入 */
.modal-enter-active .modal-box,
.modal-leave-active .modal-box {
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}
.modal-enter-from .modal-box,
.modal-leave-to .modal-box {
  transform: scale(0.95);
}

/* 移动端底部抽屉：从屏幕下缘滑入，时长与曲线和路由切换保持一致 */
@media (width < 48rem) {
  .modal-enter-from .modal-box,
  .modal-leave-to .modal-box {
    transform: translateY(100%);
  }

  /*
   * mobileSheet 让弹窗贴住屏幕下缘（见模板里的 max-md:items-end）。高度改跟
   * --dialog-viewport-height 走：软键盘弹起时抽屉整体收进可视区，
   * 没有弹窗视口跟踪时退回终端用的 --app-height，最后才是 100dvh。
   */
  .mobile-sheet-modal {
    bottom: auto;
    height: var(--dialog-viewport-height, var(--app-height, 100dvh));
  }
}

/* 降级为纯淡入淡出：去掉位移与缩放，保留 opacity 以免弹窗瞬间闪现/残留 */
@media (prefers-reduced-motion: reduce) {
  .modal-enter-active .modal-box,
  .modal-leave-active .modal-box {
    transition: none;
  }
  .modal-enter-from .modal-box,
  .modal-leave-to .modal-box {
    transform: none;
  }
}
</style>
