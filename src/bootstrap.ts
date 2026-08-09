import './helper/setupHandoffBootstrap'

const media = window.matchMedia('(prefers-color-scheme: dark)')
const favicon = document.getElementById('favicon')

if (favicon instanceof HTMLLinkElement) {
  const updateFavicon = () => {
    favicon.href = media.matches ? './favicon-dark.svg' : './favicon.svg'
  }
  media.addEventListener('change', updateFavicon)
  updateFavicon()
}

// A dynamic boundary guarantees credential scrubbing and navigation capture
// are installed before any application or vue-router module is evaluated.
void import('./main')
