import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  compactReviewActionMatcher,
  compactReviewRoutingRule,
  extensionReviewChanges,
  mergeReviewDraft,
  reviewContractMatches,
  withReviewContract,
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
  assert.deepEqual(Object.keys(group).sort(), ['accuracy', 'latitude', 'longitude'])

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

test('review confirmation accepts only the locally understood contract', () => {
  assert.equal(reviewContractMatches(7, 7), true)
  for (const value of [undefined, null, 6, 8, '7']) {
    assert.equal(reviewContractMatches(value, 7), false)
  }

  let writes = 0
  for (const value of [undefined, null, 6, 8, '7']) {
    assert.equal(
      withReviewContract(value, 7, () => {
        writes += 1
        return 'written'
      }),
      undefined,
    )
  }
  assert.equal(writes, 0)
  assert.equal(
    withReviewContract(7, 7, () => {
      writes += 1
      return 'written'
    }),
    'written',
  )
  assert.equal(writes, 1)
})

test('interception v7 keeps installed, marketplace, and review responsibilities explicit', () => {
  const api = readFileSync(new URL('../src/api/fivegpn.ts', import.meta.url), 'utf8')
  const assembly = readFileSync(
    new URL('../src/assembly/fivegpn/interception.ts', import.meta.url),
    'utf8',
  )
  const capabilities = readFileSync(
    new URL('../src/assembly/fivegpn/capabilities.ts', import.meta.url),
    'utf8',
  )
  const installedPage = readFileSync(
    new URL('../src/views/FiveGPNExtensionsPage.vue', import.meta.url),
    'utf8',
  )
  const marketplacePage = readFileSync(
    new URL('../src/views/FiveGPNMarketplacePage.vue', import.meta.url),
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
  const actionReviewCard = readFileSync(
    new URL('../src/components/fivegpn/FiveGPNActionReviewCard.vue', import.meta.url),
    'utf8',
  )
  const dialog = readFileSync(
    new URL('../src/components/common/DialogWrapper.vue', import.meta.url),
    'utf8',
  )
  const response = readFileSync(new URL('../src/api/response.ts', import.meta.url), 'utf8')

  assert.match(api, /runtime:\s*FiveGPNModuleRuntime/u)
  assert.match(api, /snapshot_digest:\s*string/u)
  assert.match(api, /FiveGPNModuleDetail[\s\S]*review_contract\?:\s*number/u)
  assert.match(api, /review_contract:\s*FiveGPNReviewContract/u)
  assert.match(api, /kind:\s*'script'/u)
  assert.doesNotMatch(api, /FiveGPNActionSummary/u)
  assert.match(api, /review_digest:\s*string/u)
  assert.match(api, /source_kind:\s*'url'/u)
  assert.match(api, /kind:\s*'empty' \| 'text' \| 'base64'/u)
  assert.match(api, /value_map\?:\s*Record<string, Record<string, string>>/u)
  assert.match(api, /status:\s*0 \| 302 \| 307/u)
  assert.match(api, /action:\s*'reject' \| 'direct'/u)
  assert.match(api, /network\?:\s*'tcp' \| 'udp'/u)
  assert.match(api, /digest:\s*string\s+url:\s*string/u)
  assert.match(api, /setting_count:\s*number/u)
  assert.match(api, /encodeURIComponent\(id\).*\/settings/su)
  assert.doesNotMatch(api, /encodeURIComponent\(key\).*\/settings/su)
  assert.match(api, /seq:\s*string/u)
  assert.match(api, /stream_id:\s*string/u)
  assert.match(api, /after\?:\s*string/u)

  assert.match(assembly, /const sessionKey = String\(requestedSession\.epoch\)/u)
  assert.match(assembly, /writeQueues\.get\(sessionKey\)/u)
  assert.match(assembly, /expectedRevision && expectedRevision !== interceptionRevision\.value/u)
  assert.match(assembly, /Math\.min\(lifecycleDelay \* 2, 5000\)/u)
  const pendingProjection = assembly.match(
    /const certificatePending = \(\) =>(?<body>[\s\S]*?)const scheduleLifecyclePoll/u,
  )
  assert.match(pendingProjection?.groups?.body ?? '', /certificate_pending/u)
  assert.match(pendingProjection?.groups?.body ?? '', /certificate\.status === 'pending'/u)
  assert.doesNotMatch(pendingProjection?.groups?.body ?? '', /armed/u)
  assert.match(capabilities, /'5gpn-interception': 7/u)
  assert.match(api, /FIVEGPN_REVIEW_CONTRACT = 7 as const/u)
  assert.match(assembly, /review_contract: FIVEGPN_REVIEW_CONTRACT/u)
  assert.match(
    assembly,
    /putInterceptionOrderAPI\(\{[\s\S]*review_contract: FIVEGPN_REVIEW_CONTRACT/u,
  )
  assert.match(
    assembly,
    /withReviewContract\(reviewContract, FIVEGPN_REVIEW_CONTRACT,[\s\S]*return request \?\? Promise\.resolve/u,
  )
  assert.ok((assembly.match(/withReviewContract\(/gu) ?? []).length >= 3)
  assert.ok((assembly.match(/candidate\.detail\.review_contract/gu) ?? []).length >= 2)
  assert.match(assembly, /enabled: true, review_contract: FIVEGPN_REVIEW_CONTRACT/u)
  assert.doesNotMatch(assembly, /enabled: true, review_contract: reviewContract/u)
  assert.match(assembly, /\{ revision, enabled: false \}/u)
  assert.match(assembly, /installExtensionAPI\([\s\S]*review_contract: FIVEGPN_REVIEW_CONTRACT/u)
  assert.match(
    assembly,
    /applyCatalogUpdateAPI\([\s\S]*catalogUpdateBody\([\s\S]*review_contract: FIVEGPN_REVIEW_CONTRACT/u,
  )
  assert.match(
    installedPage,
    /authorizationRevision\.value,[\s\S]*detail\.review_contract,[\s\S]*actionController\.signal/u,
  )
  assert.match(
    installedPage,
    /reviewContractMatches\(result\.candidate\.detail\.review_contract, FIVEGPN_REVIEW_CONTRACT\)/u,
  )
  assert.match(
    installedPage,
    /reviewContractMatches\(result\.detail\.review_contract, FIVEGPN_REVIEW_CONTRACT\)/u,
  )
  assert.match(installedPage, /fivegpnReviewContractChanged/u)
  assert.match(
    installedPage,
    /const reviewDetail = computed\([\s\S]*reviewContractMatches\(detail\.review_contract, FIVEGPN_REVIEW_CONTRACT\)/u,
  )
  assert.match(api, /\/5gpn\/interception\/location\/search/u)

  assert.match(installedPage, /@change="requestToggle\(module, \$event\)"/u)
  assert.match(installedPage, /fivegpnMarketplaceUpdateOnly/u)
  assert.doesNotMatch(installedPage, /setCatalogSources|applyCatalogUpdate/u)
  assert.match(installedPage, /authorizationRevision/u)
  assert.match(installedPage, /authorizationDetail\.value\?\.snapshot_digest/u)
  assert.match(installedPage, /reviewCaptureDNSDifferenceKey/u)
  assert.match(installedPage, /reviewPositionDifferenceKey/u)
  assert.match(installedPage, /editingRevision/u)
  assert.match(installedPage, /candidateRevision/u)

  assert.match(marketplacePage, /setCatalogSources\(sources, revision\)/u)
  assert.match(marketplacePage, /catalogInstallState\(entry\) === 'current'/u)
  assert.match(marketplacePage, /reviewedURL\.value = result\.url/u)
  assert.match(marketplacePage, /applyCatalogUpdate[\s\S]*reviewedURL\.value/u)
  assert.match(
    marketplacePage,
    /reviewContractMatches\(result\.candidate\.detail\.review_contract, FIVEGPN_REVIEW_CONTRACT\)/u,
  )
  assert.match(
    marketplacePage,
    /result\.installedDetail[\s\S]*reviewContractMatches\(result\.installedDetail\.review_contract, FIVEGPN_REVIEW_CONTRACT\)/u,
  )
  assert.match(marketplacePage, /:detail="reviewDetail"/u)
  assert.match(marketplacePage, /fivegpnReviewContractChanged/u)
  assert.match(marketplacePage, /source\.name \|\| source\.id/u)

  assert.match(editor, /conflictMessage/u)
  assert.match(editor, /location\.accuracy\.type === 'text' \? '25' : 25/u)
  assert.match(reviewDialog, /fivegpnNetworkGrantWarning/u)
  assert.match(reviewDialog, /loading && !detail/u)
  assert.match(reviewDialog, /mobile-sheet/u)
  assert.match(reviewDialog, /<template #footer>/u)
  assert.match(reviewDialog, /fivegpnReloadAndReview/u)
  assert.match(reviewDialog, /reviewedSource \|\| detail\.source_url/u)
  assert.match(reviewDialog, /fivegpnActionReviewSummary/u)
  assert.match(reviewDialog, /FiveGPNActionReviewCard/u)
  assert.match(reviewDialog, /fivegpnPublisherEgressMetadata/u)
  assert.doesNotMatch(reviewDialog, /JSON\.stringify\(action\)/u)
  assert.match(actionReviewCard, /action\.id/u)
  assert.match(actionReviewCard, /action\.phase/u)
  assert.match(actionReviewCard, /action\.kind/u)
  assert.match(actionReviewCard, /compactReviewActionMatcher/u)
  assert.match(actionReviewCard, /v-if="expanded"/u)
  assert.match(actionReviewCard, /fivegpnActionBodyMode/u)
  assert.match(actionReviewCard, /fivegpnActionPhaseRequest/u)
  assert.match(actionReviewCard, /fivegpnActionKindReplaceBody/u)
  assert.match(actionReviewCard, /parsed\.protocol === 'https:'/u)
  assert.match(actionReviewCard, /rel="noopener noreferrer"/u)
  assert.match(actionReviewCard, /fivegpnActionRewriteInPlace/u)
  assert.match(actionReviewCard, /\$\{key\}\[\$\{value\}\]=\$\{replacement\}/u)
  assert.doesNotMatch(actionReviewCard, /class="btn/u)
  assert.match(actionReviewCard, /code_digest/u)
  assert.match(actionReviewCard, /review_digest/u)
  assert.doesNotMatch(actionReviewCard, /JSON\.stringify/u)
  assert.match(reviewDialog, /detail\.upstream_mappings/u)
  assert.match(reviewDialog, /detail\.capture_dns/u)
  assert.match(reviewDialog, /executionPosition/u)
  assert.match(reviewDialog, /useViewportHeight\(open\)/u)
  assert.doesNotMatch(reviewDialog, /shortDigest/u)
  assert.match(assembly, /cancelInterceptionInspection/u)
  assert.match(response, /export const responseStatus/u)
  assert.match(response, /export const responseData/u)
  assert.match(dialog, /restoreFocusTo/u)
  assert.match(dialog, /acquireModalLock/u)
  assert.match(dialog, /historyEntry/u)
  assert.match(dialog, /restoreFromHistory/u)
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
      routing_rules: [{ action: 'direct', domain_suffix: 'old.example' }],
    },
    {
      ...after,
      routing_rules: [{ action: 'reject', domain_suffix: 'new.example' }],
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
        { ...after, routing_rules: [{ action: 'direct', domain_suffix: 'old.example' }] },
      )[0],
    ),
  )
  assert.deepEqual(extensionReviewChanges(after, after, 'candidate-digest-2'), [
    { id: 'code-only', fingerprint: 'candidate-digest-2' },
  ])
  assert.deepEqual(extensionReviewChanges(after, after, 'candidate-digest-1'), [])
  assert.equal(
    compactReviewRoutingRule({
      action: 'direct',
      domain_suffix: 'googlevideo.com',
      network: 'tcp',
    }),
    'DIRECT · *.googlevideo.com · tcp',
  )
  assert.equal(
    compactReviewRoutingRule({
      action: 'reject',
      domain_suffix: 'example.com',
      domain_keywords: ['ads', 'tracking'],
      all_domain_keywords: ['prod', 'video'],
      network: 'tcp',
    }),
    'REJECT · *.example.com & any(ads|tracking) & all(prod&video) · tcp',
  )
  const actionBase = {
    phase: 'request',
    body_mode: 'none',
    timeout_ms: 1000,
    max_body_bytes: 1024,
  }
  const oldRewrite = {
    ...actionBase,
    id: 'rewrite',
    kind: 'rewrite',
    review_digest: 'review-old',
    rewrite: { pattern: '^http:', to: 'https:', status: 0 },
  }
  const stableHeaders = {
    ...actionBase,
    id: 'headers',
    kind: 'headers',
    review_digest: 'review-headers',
    headers: { remove: ['X-Tracking'] },
  }
  const newMock = {
    ...actionBase,
    id: 'mock',
    kind: 'mock',
    review_digest: 'review-mock',
    mock: {
      status: 200,
      body: { kind: 'empty', bytes: 0, sha256: '0'.repeat(64) },
    },
  }
  const actionChanges = extensionReviewChanges(
    { ...after, actions: [oldRewrite, stableHeaders] },
    {
      ...after,
      actions: [stableHeaders, { ...oldRewrite, review_digest: 'review-new' }, newMock],
    },
    'candidate-digest-3',
  )
  assert.deepEqual(
    actionChanges.map((change) => change.id),
    ['action-added', 'action-changed', 'actions-reordered'],
  )
  assert.equal(actionChanges[1].action_id, 'rewrite')
  assert.deepEqual(
    extensionReviewChanges(
      { ...after, actions: [oldRewrite, stableHeaders] },
      { ...after, actions: [stableHeaders] },
      'candidate-digest-4',
    ).map((change) => change.id),
    ['action-removed'],
  )
  assert.equal(
    compactReviewActionMatcher({
      ...oldRewrite,
      hosts: ['api.example.com'],
      schemes: ['https'],
      methods: ['POST'],
      path: '^/v1/',
      statuses: [200, 204],
    }),
    'host=api.example.com · scheme=https · method=POST · path=^/v1/ · status=200|204',
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
