<template>
  <Teleport to="#app-content">
    <Transition name="modal">
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
          class="modal-box bg-base-100 relative overflow-hidden p-0 outline-none"
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
          <div
            v-if="isOpen"
            class="max-h-[90dvh] overflow-y-auto max-md:max-h-[70dvh]"
            :class="[noPadding ? 'p-0' : 'p-4', bodyClass]"
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
import { blurIntensity } from '@/store/settings'
import { acquireModalLock } from '@/composables/modalState'
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
/* Dialog transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .modal-backdrop,
.modal-leave-active .modal-backdrop {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-backdrop,
.modal-leave-to .modal-backdrop {
  opacity: 0;
}
.modal-enter-active .modal-box,
.modal-leave-active .modal-box {
  transition: transform 0.2s ease;
}
.modal-enter-from .modal-box,
.modal-leave-to .modal-box {
  transform: scale(0.95);
}

@media (width < 48rem) {
  .mobile-sheet-modal {
    bottom: auto;
    height: var(--app-height, 100dvh);
  }
}
</style>
