import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  compactReviewRoutingRule,
  extensionReviewChanges,
  mergeReviewDraft,
} from '../src/helper/fivegpnExtensionReview.ts'
import {
  findFlatLocationSettings,
  invalidFlatLocationKeys,
  readFlatLocationValue,
  writeFlatLocationValue,
} from '../src/helper/fivegpnExtensionSettings.ts'

const setting = (key, type, required = true) => ({ key, type, required })

test('mixed text and number coordinates round-trip without losing zero', () => {
  const settings = [
    setting('longitude', 'text'),
    setting('latitude', 'number'),
    setting('accuracy', 'text'),
  ]
  const group = findFlatLocationSettings(settings)
  assert.ok(group)

  assert.deepEqual(readFlatLocationValue(group, { longitude: '0', latitude: 0, accuracy: '25' }), {
    longitude: 0,
    latitude: 0,
    accuracy: 25,
  })
  assert.deepEqual(
    writeFlatLocationValue(group, {}, { longitude: 0, latitude: -0.5, accuracy: 30 }),
    { longitude: '0', latitude: -0.5, accuracy: '30' },
  )
  assert.deepEqual(
    [
      ...invalidFlatLocationKeys(group, { longitude: 'not-a-number', latitude: 0, accuracy: '0' }),
    ].sort(),
    ['accuracy', 'longitude'],
  )
})

test('flat coordinates support an omitted accuracy field with a local default', () => {
  const group = findFlatLocationSettings([
    setting('Longitude', 'number'),
    setting('Latitude', 'text'),
  ])
  assert.ok(group)
  assert.deepEqual(readFlatLocationValue(group, { Longitude: 12, Latitude: '34' }), {
    longitude: 12,
    latitude: 34,
    accuracy: 25,
  })
  assert.deepEqual(
    writeFlatLocationValue(group, { keep: true }, { longitude: 0, latitude: 0, accuracy: 50 }),
    { keep: true, Longitude: 0, Latitude: '0' },
  )
})

test('interception v4 exposes reviewed source identity and transactional runtime state', () => {
  const api = readFileSync(new URL('../src/api/fivegpn.ts', import.meta.url), 'utf8')
  const assembly = readFileSync(
    new URL('../src/assembly/fivegpn/interception.ts', import.meta.url),
    'utf8',
  )
  const capabilities = readFileSync(
    new URL('../src/assembly/fivegpn/capabilities.ts', import.meta.url),
    'utf8',
  )
  const page = readFileSync(
    new URL('../src/views/FiveGPNExtensionsPage.vue', import.meta.url),
    'utf8',
  )
  const editor = readFileSync(
    new URL('../src/components/fivegpn/FiveGPNExtensionSettingsEditor.vue', import.meta.url),
    'utf8',
  )
  const reviewDialog = readFileSync(
    new URL('../src/components/fivegpn/FiveGPNExtensionReviewDialog.vue', import.meta.url),
    'utf8',
  )
  const dialog = readFileSync(
    new URL('../src/components/common/DialogWrapper.vue', import.meta.url),
    'utf8',
  )

  assert.match(api, /runtime:\s*FiveGPNModuleRuntime/)
  assert.match(api, /snapshot_digest:\s*string/)
  assert.match(api, /digest:\s*string\s+url:\s*string/)
  assert.match(api, /setting_count:\s*number/)
  assert.match(api, /extensions\/\$\{encodeURIComponent\(id\)\}\/settings`/)
  assert.doesNotMatch(api, /settings\/\$\{encodeURIComponent\(key\)\}/)
  assert.match(assembly, /controller\?\.abort\(\)[\s\S]*const gen = \+\+generation/)
  assert.match(assembly, /expectedRevision && expectedRevision !== interceptionRevision\.value/)
  assert.match(assembly, /writeQueues\.get\(requestedUuid\)/)
  assert.match(assembly, /writeQueues\.set\(requestedUuid, tail\)/)
  assert.match(assembly, /url: candidate\.detail\.source_url \?\? ''/)
  assert.match(assembly, /Math\.min\(lifecycleDelay \* 2, 5000\)/)
  const pendingProjection = assembly.match(
    /const certificatePending = \(\) =>(?<body>[\s\S]*?)const scheduleLifecyclePoll/,
  )
  assert.match(pendingProjection?.groups?.body ?? '', /certificate_pending/)
  assert.match(pendingProjection?.groups?.body ?? '', /certificate\.status === 'pending'/)
  assert.doesNotMatch(pendingProjection?.groups?.body ?? '', /armed/)
  assert.match(assembly, /catalogRevision\.value = data\.revision/)
  assert.match(page, /setCatalogSources\(sources, baselineRevision\)/)
  assert.match(capabilities, /'5gpn-interception': 4/)
  assert.match(page, /@change="requestToggle\(module, \$event\)"/)
  assert.match(reviewDialog, /fivegpnNetworkGrantWarning/)
  assert.match(page, /fivegpnUpdateAndKeepEnabled/)
  assert.match(page, /reviewConflict/)
  assert.match(page, /result\.candidate\.installed === result\.candidate\.digest/)
  assert.match(page, /result\.detail\.enabled/)
  assert.match(page, /authorizationRevision/)
  assert.match(page, /authorizationDetail\.value\?\.snapshot_digest/)
  assert.match(page, /setDifferenceState\(\[\], reloading, result\.detail\.snapshot_digest\)/)
  assert.match(page, /capture-dns:\$\{reviewDetail\.value\?\.capture_dns/)
  assert.match(page, /execution-position:\$\{reviewExecutionPosition\.value\}/)
  assert.match(page, /editingRevision/)
  assert.match(page, /candidateRevision/)
  assert.match(editor, /conflictMessage/)
  assert.match(editor, /location\.accuracy\.type === 'text' \? '25' : 25/)
  assert.match(reviewDialog, /loading && !detail/)
  assert.match(reviewDialog, /mobile-sheet/)
  assert.match(reviewDialog, /<template #footer>/)
  assert.match(reviewDialog, /fivegpnReloadAndReview/)
  assert.match(reviewDialog, /detail\.source_url/)
  assert.match(reviewDialog, /fivegpnExactActions/)
  assert.match(reviewDialog, /detail\.upstream_mappings/)
  assert.match(reviewDialog, /detail\.capture_dns/)
  assert.match(reviewDialog, /executionPosition/)
  assert.match(reviewDialog, /<details class="max-w-\[65%\].*md:hidden">/)
  assert.match(reviewDialog, /<details class="md:hidden">/)
  assert.match(reviewDialog, /useViewportHeight\(open\)/)
  assert.match(reviewDialog, /\{\{ digest \|\| '—' \}\}/)
  assert.doesNotMatch(reviewDialog, /shortDigest/)
  assert.match(reviewDialog, /setting\.value !== undefined \? setting\.value : setting\.default/)
  assert.match(assembly, /cancelInterceptionInspection/)
  assert.match(assembly, /response\.status \?\? response\.response\?\.status/)
  assert.match(assembly, /responseData<\{ message\?: string \}>\(response\)/)
  assert.match(dialog, /restoreFocusTo/)
  assert.match(dialog, /acquireModalLock/)
  assert.match(dialog, /historyEntry/)
  assert.match(dialog, /restoreFromHistory/)
  assert.match(dialog, /historyPushed = true\s+isOpen\.value = true/)
  assert.match(page, /reviewing \|\| busy \|\| sourceBusy \|\| \(!importUrl && !importContent\)/)
  assert.doesNotMatch(page, /changed since you reviewed\|catalog and the publisher have diverged/)
  assert.match(
    page,
    /const catalogLoad = refreshCatalog\(\)[\s\S]*await refreshInterception\(\)[\s\S]*startInterceptionLifecyclePolling\(\)[\s\S]*await catalogLoad/,
  )
})

test('review differences and typed drafts survive a revision reload safely', () => {
  const before = {
    capture_hosts: ['www.example.com'],
    snapshot_digest: 'candidate-digest-1',
    routing_rules: [],
    network: false,
    persistent_storage: false,
    egress_group_required: false,
    settings: [{ key: 'region', type: 'select' }],
  }
  const after = {
    ...before,
    capture_hosts: ['www.example.com', 'api.example.com'],
    network: true,
    settings: [
      { key: 'region', type: 'select', required: true, options: ['cn', 'hk'], value: 'cn' },
      { key: 'strip_tracking', type: 'boolean', required: false, default: true },
    ],
  }

  assert.deepEqual(
    extensionReviewChanges(before, after).map((change) => change.id),
    ['hosts-added', 'network-grant', 'settings-added', 'settings-changed'],
  )
  assert.deepEqual(mergeReviewDraft(after.settings, { region: 'hk', removed: 'value' }), {
    region: 'hk',
    strip_tracking: true,
  })
  assert.deepEqual(mergeReviewDraft(after.settings, { region: 'invalid' }), {
    region: 'cn',
    strip_tracking: true,
  })

  const sameCountChanges = extensionReviewChanges(
    {
      ...after,
      routing_rules: [{ action: 'DIRECT', domain_suffix: 'old.example' }],
    },
    {
      ...after,
      routing_rules: [{ action: 'REJECT', domain_suffix: 'new.example' }],
      settings: [
        { key: 'region', type: 'select', required: true, options: ['cn', 'us'], value: 'cn' },
        ...after.settings.slice(1),
      ],
    },
    'candidate-digest-2',
  )
  assert.deepEqual(
    sameCountChanges.map((change) => change.id),
    ['routing-rules', 'settings-changed'],
  )
  assert.notEqual(
    JSON.stringify(sameCountChanges[0]),
    JSON.stringify(
      extensionReviewChanges(
        { ...after, routing_rules: [] },
        { ...after, routing_rules: [{ action: 'DIRECT', domain_suffix: 'old.example' }] },
      )[0],
    ),
  )
  assert.deepEqual(extensionReviewChanges(after, after, 'candidate-digest-2'), [
    { id: 'code-only', fingerprint: 'candidate-digest-2' },
  ])
  assert.deepEqual(extensionReviewChanges(after, after, 'candidate-digest-1'), [])
  assert.equal(
    compactReviewRoutingRule({
      action: 'DIRECT',
      domain_suffix: 'googlevideo.com',
      network: 'tcp',
    }),
    'DIRECT · *.googlevideo.com · tcp',
  )
  assert.equal(
    compactReviewRoutingRule({
      action: 'REJECT',
      domain_suffix: 'example.com',
      domain_keywords: ['ads', 'tracking'],
      all_domain_keywords: ['prod', 'video'],
      network: 'tcp',
    }),
    'REJECT · *.example.com & any(ads|tracking) & all(prod&video) · tcp',
  )
  assert.deepEqual(
    extensionReviewChanges(
      { ...after, actions: [{ id: 'rewrite', phase: 'request', digest: 'old' }] },
      { ...after, actions: [{ id: 'rewrite', phase: 'response', digest: 'new' }] },
      'candidate-digest-3',
    ).map((change) => change.id),
    ['actions'],
  )
  assert.deepEqual(
    extensionReviewChanges(
      {
        ...after,
        upstream_mappings: [
          { pattern: 'www.example.com', target: 'old.example.net', resolver: false },
        ],
      },
      {
        ...after,
        upstream_mappings: [
          { pattern: 'www.example.com', target: 'new.example.net', resolver: false },
        ],
      },
      'candidate-digest-4',
    ).map((change) => change.id),
    ['upstream-mappings'],
  )
  assert.deepEqual(
    extensionReviewChanges(
      { ...after, source_url: 'https://old.example/extension.yaml' },
      { ...after, source_url: 'https://new.example/extension.yaml' },
      'candidate-digest-5',
    ).map((change) => change.id),
    ['source'],
  )
})

test('every installed extension has a non-empty egress selector', () => {
  const api = readFileSync(new URL('../src/api/fivegpn.ts', import.meta.url), 'utf8')
  const page = readFileSync(
    new URL('../src/views/FiveGPNExtensionsPage.vue', import.meta.url),
    'utf8',
  )
  const settings = readFileSync(
    new URL('../src/components/settings/fivegpn/FiveGPNInterceptionSettings.vue', import.meta.url),
    'utf8',
  )

  assert.match(api, /egress_group:\s*string/u)
  assert.doesNotMatch(api, /egress_group\?:/u)
  assert.doesNotMatch(page, /fivegpnNoBinding|fivegpnUnboundEgress/u)
  const egressSelect = page.match(
    /<select[\s\S]*?:value="module\.egress_group"[\s\S]*?<\/select>/u,
  )?.[0]
  assert.ok(egressSelect, 'the installed-extension egress selector is missing')
  assert.doesNotMatch(egressSelect, /<option value="">/u)
  assert.match(page, /!egressAvailable\(module\.egress_group\)/u)
  assert.match(page, /:value="module\.egress_group"[\s\S]*disabled/u)
  assert.match(page, /if \(!group\) return/u)
  assert.match(settings, /available_egress_groups[\s\S]*includes\(m\.egress_group\)/u)
})
