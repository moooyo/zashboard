export type FiveGPNInterceptionSettingsWrite = {
  revision: string
  enabled: boolean
  http2: boolean
}

/** Keep the settings mutation narrower than the read-only protocol snapshot. */
export const interceptionSettingsWrite = ({
  revision,
  enabled,
  http2,
}: FiveGPNInterceptionSettingsWrite): FiveGPNInterceptionSettingsWrite => ({
  revision,
  enabled,
  http2,
})
