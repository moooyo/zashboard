export const SUPPORTED_CONTROLLER_API = '1'

export type AdvertisedFeature = {
  version: number
  owner?: string
}

export type ValidCapabilities = {
  controllerApi: typeof SUPPORTED_CONTROLLER_API
  features: Record<string, AdvertisedFeature>
}

export type CapabilityPayloadResult =
  | { status: 'compatible'; value: ValidCapabilities }
  | { status: 'incompatible'; message: string }
  | { status: 'malformed'; message: string }

export type CapabilityFailureClass = 'unsupported' | 'authentication' | 'temporary' | 'contract'

/** Classify transport failures without retrying deterministic client errors. */
export const classifyCapabilityFailure = (status: number): CapabilityFailureClass => {
  if (status === 404) return 'unsupported'
  if (status === 401) return 'authentication'
  if (status === 0 || status === 408 || status === 429 || (status >= 500 && status <= 599)) {
    return 'temporary'
  }
  return 'contract'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Validate the controller envelope before any feature gate consumes it.
 *
 * The controller version is exact rather than a minimum. A newer surface may
 * reuse names with different semantics, so treating it as compatible would be
 * more dangerous than hiding the management pages.
 */
export const classifyCapabilityPayload = (payload: unknown): CapabilityPayloadResult => {
  if (!isRecord(payload)) return { status: 'malformed', message: 'invalid capability response' }
  if (typeof payload.controllerApi !== 'string') {
    return { status: 'malformed', message: 'controllerApi must be a string' }
  }
  if (payload.controllerApi !== SUPPORTED_CONTROLLER_API) {
    return {
      status: 'incompatible',
      message: `unsupported controllerApi ${payload.controllerApi}`,
    }
  }
  if (!isRecord(payload.features)) {
    return { status: 'malformed', message: 'features must be an object' }
  }

  const features = Object.create(null) as Record<string, AdvertisedFeature>
  for (const [key, descriptor] of Object.entries(payload.features)) {
    if (
      !isRecord(descriptor) ||
      typeof descriptor.version !== 'number' ||
      !Number.isSafeInteger(descriptor.version) ||
      descriptor.version < 1
    ) {
      return { status: 'malformed', message: `invalid feature descriptor for ${key}` }
    }
    if (descriptor.owner !== undefined && typeof descriptor.owner !== 'string') {
      return { status: 'malformed', message: `invalid feature owner for ${key}` }
    }
    features[key] = {
      version: descriptor.version,
      ...(descriptor.owner === undefined ? {} : { owner: descriptor.owner }),
    }
  }

  return {
    status: 'compatible',
    value: { controllerApi: SUPPORTED_CONTROLLER_API, features },
  }
}
