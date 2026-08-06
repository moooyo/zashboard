import type { FiveGPNLocationValue, FiveGPNModuleSetting, FiveGPNSettingValue } from '@/api/fivegpn'

export type FlatLocationSettings = {
  longitude: FiveGPNModuleSetting
  latitude: FiveGPNModuleSetting
  accuracy?: FiveGPNModuleSetting
}

const coordinateSetting = (setting?: FiveGPNModuleSetting) =>
  setting && (setting.type === 'number' || setting.type === 'text') ? setting : undefined

export const findFlatLocationSettings = (
  settings: FiveGPNModuleSetting[],
): FlatLocationSettings | null => {
  const byKey = new Map(settings.map((setting) => [setting.key.toLowerCase(), setting]))
  const longitude = coordinateSetting(byKey.get('longitude'))
  const latitude = coordinateSetting(byKey.get('latitude'))
  const accuracy = coordinateSetting(byKey.get('accuracy'))
  if (!longitude || !latitude) return null
  return { longitude, latitude, accuracy }
}

const finiteNumber = (value: FiveGPNSettingValue | undefined) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const readFlatLocationValue = (
  group: FlatLocationSettings,
  values: Record<string, FiveGPNSettingValue>,
): FiveGPNLocationValue => ({
  longitude: finiteNumber(values[group.longitude.key]),
  latitude: finiteNumber(values[group.latitude.key]),
  accuracy: group.accuracy ? (finiteNumber(values[group.accuracy.key]) ?? 25) : 25,
})

const valueForSetting = (setting: FiveGPNModuleSetting, value?: number) => {
  if (value === undefined) return null
  return setting.type === 'text' ? String(value) : value
}

export const writeFlatLocationValue = (
  group: FlatLocationSettings,
  values: Record<string, FiveGPNSettingValue>,
  location: FiveGPNLocationValue,
) => {
  const next = { ...values }
  next[group.longitude.key] = valueForSetting(group.longitude, location.longitude)
  next[group.latitude.key] = valueForSetting(group.latitude, location.latitude)
  if (group.accuracy) {
    next[group.accuracy.key] = valueForSetting(
      group.accuracy,
      location.accuracy >= 1 ? location.accuracy : undefined,
    )
  }
  return next
}

export const invalidFlatLocationKeys = (
  group: FlatLocationSettings,
  values: Record<string, FiveGPNSettingValue>,
) => {
  const invalid = new Set<string>()
  const rawLongitude = values[group.longitude.key]
  const rawLatitude = values[group.latitude.key]
  const longitude = finiteNumber(rawLongitude)
  const latitude = finiteNumber(rawLatitude)
  const longitudePresent =
    rawLongitude !== null && rawLongitude !== undefined && rawLongitude !== ''
  const latitudePresent = rawLatitude !== null && rawLatitude !== undefined && rawLatitude !== ''

  if (longitudePresent !== latitudePresent) {
    invalid.add(group.longitude.key)
    invalid.add(group.latitude.key)
  }
  if (longitudePresent && (longitude === undefined || longitude < -180 || longitude > 180)) {
    invalid.add(group.longitude.key)
  }
  if (latitudePresent && (latitude === undefined || latitude < -90 || latitude > 90)) {
    invalid.add(group.latitude.key)
  }
  if (group.accuracy) {
    const rawAccuracy = values[group.accuracy.key]
    const accuracy = finiteNumber(rawAccuracy)
    const accuracyPresent = rawAccuracy !== null && rawAccuracy !== undefined && rawAccuracy !== ''
    if (
      accuracyPresent &&
      (accuracy === undefined || !Number.isInteger(accuracy) || accuracy < 1 || accuracy > 100000)
    ) {
      invalid.add(group.accuracy.key)
    }
  }
  return invalid
}
