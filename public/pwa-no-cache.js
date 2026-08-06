// 5gpn keeps Zashboard installable but never serves a cached control plane.
// This activation hook also retires every Workbox cache left by older releases.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))

      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      await Promise.allSettled(
        windows.map((client) => ('navigate' in client ? client.navigate(client.url) : undefined)),
      )
    })(),
  )
})
