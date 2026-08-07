import type {
  FiveGPNModuleDetail,
  FiveGPNModuleSetting,
  FiveGPNRoutingRule,
  FiveGPNSettingValue,
} from '@/api/fivegpn'

export type FiveGPNReviewChange =
  | { id: 'source'; before: string; after: string }
  | { id: 'hosts-added'; hosts: string }
  | { id: 'hosts-removed'; hosts: string }
  | { id: 'routing-rules'; before: number; after: number; fingerprint: string }
  | { id: 'actions'; before: number; after: number; fingerprint: string }
  | { id: 'upstream-mappings'; before: number; after: number; fingerprint: string }
  | { id: 'network-grant' }
  | { id: 'storage' }
  | { id: 'egress-requirement' }
  | { id: 'settings-added'; settings: string }
  | { id: 'settings-removed'; settings: string }
  | { id: 'settings-changed'; settings: string; fingerprint: string }
  | { id: 'code-only'; fingerprint: string }

const sameJSON = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

export const extensionReviewChanges = (
  before: FiveGPNModuleDetail | null,
  after: FiveGPNModuleDetail | null,
  afterDigest = '',
): FiveGPNReviewChange[] => {
  if (!before || !after) return []

  const changes: FiveGPNReviewChange[] = []
  if ((before.source_url ?? '') !== (after.source_url ?? '')) {
    changes.push({ id: 'source', before: before.source_url ?? '', after: after.source_url ?? '' })
  }
  const beforeHosts = new Set(before.capture_hosts)
  const afterHosts = new Set(after.capture_hosts)
  const addedHosts = after.capture_hosts.filter((host) => !beforeHosts.has(host))
  const removedHosts = before.capture_hosts.filter((host) => !afterHosts.has(host))
  if (addedHosts.length) changes.push({ id: 'hosts-added', hosts: addedHosts.join(', ') })
  if (removedHosts.length) changes.push({ id: 'hosts-removed', hosts: removedHosts.join(', ') })
  if (!sameJSON(before.routing_rules ?? [], after.routing_rules ?? [])) {
    changes.push({
      id: 'routing-rules',
      before: before.routing_rules?.length ?? 0,
      after: after.routing_rules?.length ?? 0,
      fingerprint: JSON.stringify(after.routing_rules ?? []),
    })
  }
  if (!sameJSON(before.actions ?? [], after.actions ?? [])) {
    changes.push({
      id: 'actions',
      before: before.actions?.length ?? 0,
      after: after.actions?.length ?? 0,
      fingerprint: JSON.stringify(after.actions ?? []),
    })
  }
  if (!sameJSON(before.upstream_mappings ?? [], after.upstream_mappings ?? [])) {
    changes.push({
      id: 'upstream-mappings',
      before: before.upstream_mappings?.length ?? 0,
      after: after.upstream_mappings?.length ?? 0,
      fingerprint: JSON.stringify(after.upstream_mappings ?? []),
    })
  }
  if (before.network !== after.network) changes.push({ id: 'network-grant' })
  if (before.persistent_storage !== after.persistent_storage) changes.push({ id: 'storage' })
  if (before.egress_group_required !== after.egress_group_required) {
    changes.push({ id: 'egress-requirement' })
  }

  const oldSettings = new Map((before.settings ?? []).map((setting) => [setting.key, setting]))
  const newSettings = new Map((after.settings ?? []).map((setting) => [setting.key, setting]))
  const addedSettings = [...newSettings.keys()].filter((key) => !oldSettings.has(key))
  const removedSettings = [...oldSettings.keys()].filter((key) => !newSettings.has(key))
  const settingShape = (setting: FiveGPNModuleSetting) => ({
    type: setting.type,
    required: setting.required,
    options: setting.options ?? [],
    min: setting.min,
    max: setting.max,
    default: setting.default,
  })
  const changedSettings = [...newSettings].filter(
    ([key, setting]) =>
      oldSettings.has(key) && !sameJSON(settingShape(oldSettings.get(key)!), settingShape(setting)),
  )
  if (addedSettings.length) {
    changes.push({ id: 'settings-added', settings: addedSettings.join(', ') })
  }
  if (removedSettings.length) {
    changes.push({ id: 'settings-removed', settings: removedSettings.join(', ') })
  }
  if (changedSettings.length) {
    changes.push({
      id: 'settings-changed',
      settings: changedSettings.map(([key]) => key).join(', '),
      fingerprint: JSON.stringify(
        changedSettings.map(([key, setting]) => [key, settingShape(setting)]),
      ),
    })
  }
  if (!changes.length && afterDigest && before.snapshot_digest !== afterDigest) {
    changes.push({ id: 'code-only', fingerprint: afterDigest })
  }
  return changes
}

const cloneValue = (value: FiveGPNSettingValue | undefined): FiveGPNSettingValue => {
  if (value === undefined) return null
  if (value && typeof value === 'object') return { ...value }
  return value
}

const valueMatchesSetting = (setting: FiveGPNModuleSetting, value: FiveGPNSettingValue) => {
  if (value === null) return !setting.required
  switch (setting.type) {
    case 'boolean':
      return typeof value === 'boolean'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'select':
      return typeof value === 'string' && Boolean(setting.options?.includes(value))
    case 'text':
      return typeof value === 'string'
    case 'location':
      return typeof value === 'object'
  }
}

export const mergeReviewDraft = (
  settings: FiveGPNModuleSetting[],
  previous: Record<string, FiveGPNSettingValue> = {},
) =>
  Object.fromEntries(
    settings.map((setting) => {
      const previousValue = previous[setting.key]
      if (previousValue !== undefined && valueMatchesSetting(setting, previousValue)) {
        return [setting.key, cloneValue(previousValue)]
      }
      return [
        setting.key,
        cloneValue(setting.value !== undefined ? setting.value : setting.default),
      ]
    }),
  )

export const compactReviewRoutingRule = (rule: FiveGPNRoutingRule) => {
  const selectors = [
    rule.domain,
    rule.domain_suffix ? `*.${rule.domain_suffix}` : '',
    rule.ip_cidr,
    rule.domain_keywords?.length ? `any(${rule.domain_keywords.join('|')})` : '',
    rule.all_domain_keywords?.length ? `all(${rule.all_domain_keywords.join('&')})` : '',
  ].filter(Boolean)

  return [
    rule.action.toUpperCase(),
    selectors.join(' & '),
    rule.network?.toLowerCase(),
    rule.destination_port === undefined ? '' : `:${rule.destination_port}`,
  ]
    .filter(Boolean)
    .join(' · ')
}
