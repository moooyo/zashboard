import http from 'node:http'

const port = 39001
let revision = 'review-revision-1'
let conflictReturned = false

const runtime = { ready: false, phase: 'disabled' }
const summary = {
  id: 'youtube.cleaner',
  name: 'YouTube Cleaner',
  version: '1.4.0',
  enabled: false,
  capture_hosts: ['www.youtube.com', 'm.youtube.com'],
  capture_dns: 'trust',
  egress_group: 'DIRECT',
  egress_group_required: false,
  setting_count: 0,
  runtime,
}
const currentDetail = {
  ...summary,
  description: 'Removes tracking parameters from YouTube requests.',
  source_url: 'https://old.example.com/youtube.yaml',
  source_digest: 'f'.repeat(64),
  snapshot_digest: '4'.repeat(64),
  network: false,
  persistent_storage: false,
  settings: [],
  actions: [{ id: 'clean', phase: 'request', digest: '1'.repeat(64) }],
  routing_rules: [{ action: 'DIRECT', domain_suffix: 'googlevideo.com', network: 'tcp' }],
}
const candidateDetail = {
  ...summary,
  version: '1.5.0',
  source_url: 'https://example.com/youtube.yaml',
  snapshot_digest: '8f34'.padEnd(64, '0'),
  capture_hosts: ['www.youtube.com', 'm.youtube.com', 'youtubei.googleapis.com'],
  setting_count: 1,
  network: true,
  persistent_storage: true,
  settings: [
    {
      key: 'strip_tracking',
      type: 'boolean',
      label: 'Remove tracking parameters',
      required: false,
      default: true,
      value: true,
    },
  ],
  actions: [
    { id: 'clean', phase: 'request', digest: '2'.repeat(64) },
    { id: 'filter', phase: 'response', digest: '3'.repeat(64) },
  ],
  routing_rules: [
    { action: 'DIRECT', domain_suffix: 'googlevideo.com', network: 'tcp' },
    { action: 'REJECT', domain_keywords: ['doubleclick'], network: 'tcp' },
  ],
}
const snapshot = () => ({
  enabled: true,
  http2: true,
  http3: false,
  modules: [summary],
  execution_order: ['youtube.cleaner'],
  available_egress_groups: ['DIRECT', 'Proxies'],
  active_capture_hosts: [],
  certificate: { ready: true, loaded: true, covers_all_capture_hosts: true, status: 'ready' },
})
const catalog = () => ({
  sources: [
    {
      id: 'io.5gpn.official',
      name: 'Official extensions',
      url: 'https://example.com/index.json',
      enabled: true,
      metadata: { name: 'Official extensions' },
      entries: [
        {
          id: 'youtube.cleaner',
          name: 'YouTube Cleaner',
          version: '1.5.0',
          description: 'Removes tracking parameters and ad routing.',
          installed_version: '1.4.0',
          installed_current: false,
          manifest: { url: 'https://example.com/youtube.yaml', sha256: 'a'.repeat(64) },
          capabilities: {
            captureHostCount: 3,
            actionCount: 2,
            settingCount: 1,
            network: true,
            persistentStorage: true,
            upstreamMappingCount: 0,
            egressGroupRequired: false,
            routingRuleCount: 2,
          },
        },
      ],
    },
  ],
})

const send = (response, status, body) => {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  })
  response.end(JSON.stringify(body))
}

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, {})
  const url = new URL(request.url, `http://127.0.0.1:${port}`)
  if (url.pathname === '/version') return send(response, 200, { version: 'mihomo 5gpn mock' })
  if (url.pathname === '/capabilities') {
    return send(response, 200, {
      controllerApi: 'v1',
      features: { '5gpn-interception': { version: 4, owner: 'mihomo' } },
    })
  }
  if (url.pathname === '/5gpn/interception') {
    return send(response, 200, { snapshot: snapshot(), revision })
  }
  if (url.pathname === '/5gpn/interception/catalog') {
    return send(response, 200, { catalog: catalog(), revision })
  }
  if (url.pathname === '/5gpn/interception/extensions/youtube.cleaner') {
    return setTimeout(() => send(response, 200, { extension: currentDetail, revision }), 450)
  }
  if (
    url.pathname === '/5gpn/interception/catalog/io.5gpn.official/entries/youtube.cleaner/review'
  ) {
    return setTimeout(
      () =>
        send(response, 200, {
          candidate: {
            detail: candidateDetail,
            digest: '8f34'.padEnd(64, '0'),
            installed: '4'.repeat(64),
            installedVersion: '1.4.0',
          },
          url: 'https://example.com/youtube.yaml',
          revision,
        }),
      700,
    )
  }
  if (
    request.method === 'POST' &&
    url.pathname === '/5gpn/interception/catalog/io.5gpn.official/entries/youtube.cleaner/update'
  ) {
    if (!conflictReturned) {
      conflictReturned = true
      revision = 'review-revision-2'
      return send(response, 409, { message: 'revision changed', revision })
    }
    return send(response, 200, { snapshot: snapshot(), revision })
  }
  if (url.pathname === '/configs') return send(response, 200, { mode: 'rule' })
  if (url.pathname === '/proxies') return send(response, 200, { proxies: {} })
  if (url.pathname === '/providers/proxies') return send(response, 200, { providers: {} })
  if (url.pathname === '/rules') return send(response, 200, { rules: [] })
  if (url.pathname === '/connections') return send(response, 200, { connections: [] })
  return send(response, 404, { message: `No mock for ${request.method} ${url.pathname}` })
})

server.listen(port, '127.0.0.1')
