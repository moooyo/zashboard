import { ref } from 'vue'

export const openModalCount = ref(0)
let rootAlreadyLocked = false

export const acquireModalLock = () => {
  if (openModalCount.value === 0 && typeof document !== 'undefined') {
    rootAlreadyLocked = document.documentElement.classList.contains('overflow-hidden')
  }
  openModalCount.value += 1
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('overflow-hidden')
  }

  let released = false
  return () => {
    if (released) return
    released = true
    openModalCount.value = Math.max(0, openModalCount.value - 1)
    if (openModalCount.value === 0) {
      if (typeof document !== 'undefined' && !rootAlreadyLocked) {
        document.documentElement.classList.remove('overflow-hidden')
      }
      rootAlreadyLocked = false
    }
  }
}
