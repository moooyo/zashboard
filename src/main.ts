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
// than an uncaught rejection. registerType: 'autoUpdate' is a property of the
// generated sw.js, not of this call, so a plain register still updates itself.
//
// The one failure worth naming is the certificate: on CERT_MODE=debug the panel
// is served with a self-signed pair, and clicking through the browser warning
// does not make a service worker registrable. Everything except offline caching
// works, and nothing here should imply otherwise.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((error) => {
      const untrusted = error instanceof DOMException && error.name === 'SecurityError'
      console.info(
        untrusted
          ? 'Offline caching is off: a service worker needs a trusted certificate, and this panel is served with an untrusted one (CERT_MODE=debug). Everything else is unaffected.'
          : `Offline caching is off: the service worker did not register (${error}).`,
      )
    })
  })
}
