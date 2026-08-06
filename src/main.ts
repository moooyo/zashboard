import '@/api/http'
import '@/helper/dayjs'
import 'tippy.js/animations/scale.css'
import 'tippy.js/dist/tippy.css'
import { createApp } from 'vue'
import App from './App.vue'
import { loadFonts } from './assets/load-fonts'
import './assets/main.css'
import { applyCustomThemes, applyKsuTheme } from './helper'
import { i18n } from './i18n'
import router from './router'

const isEdge = /Edg\//.test(navigator.userAgent)

if (isEdge) {
  const originalReplaceState = history.replaceState
  history.replaceState = function (...args) {
    // Edge only needs the hidden-page scroll snapshot suppressed. Route URL
    // replacements must still run or history state can diverge from the URL.
    if (document.visibilityState === 'hidden' && args.length < 3) return
    return originalReplaceState.apply(this, args)
  }
}

applyCustomThemes()
applyKsuTheme()
loadFonts()

const app = createApp(App)

app.use(router)
app.use(i18n)
app.mount('#app')

// Service worker registration, owned here so its failure is a message rather
// than an uncaught rejection. The generated worker is network-only and exists
// solely to retain the installable PWA shape and retire older Workbox caches.
//
// The one failure worth naming is the certificate: on CERT_MODE=debug the panel
// is served with a self-signed pair, and clicking through the browser warning
// does not make a service worker registrable. The ordinary browser page still
// works, and no runtime behavior depends on the worker.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(
      (worker) => {
        void worker.update().catch((error) => {
          console.info(`The PWA update check did not complete (${error}).`)
        })
      },
      (error) => {
        const untrusted = error instanceof DOMException && error.name === 'SecurityError'
        console.info(
          untrusted
            ? 'The PWA is unavailable: a service worker needs a trusted certificate, and this panel is served with an untrusted one (CERT_MODE=debug). Everything else is unaffected.'
            : `The PWA is unavailable: the service worker did not register (${error}).`,
        )
      },
    )
  })
}
