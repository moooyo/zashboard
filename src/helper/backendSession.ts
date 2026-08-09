export type BackendConnectionConfiguration = {
  uuid: string
  type: string
  protocol: string
  host: string
  port: string
  secondaryPath: string
  password: string
  authMode?: string
}

export type BackendSession = {
  uuid: string
  epoch: number
  configHash: string
  signal: AbortSignal
}

const connectionIdentity = (backend: BackendConnectionConfiguration) =>
  JSON.stringify([
    backend.type,
    backend.protocol,
    backend.host,
    backend.port,
    backend.secondaryPath,
    backend.password,
    backend.authMode ?? 'secret',
  ])

/**
 * A compact in-memory identifier for connection-affecting backend fields.
 *
 * This is not a credential digest and must not be persisted or used as a
 * security primitive. Its only purpose is to notice an edit to a backend that
 * deliberately keeps the same UUID.
 */
export const backendConfigurationHash = (backend: BackendConnectionConfiguration) => {
  const value = connectionIdentity(backend)
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Owns the lifetime of one configured controller connection.
 *
 * UUID alone is not a session identity: editing host, port, path, protocol or
 * secret keeps the UUID. Every such edit advances the epoch and aborts the old
 * signal so requests and streams cannot publish results into the new session.
 */
export class BackendSessionTracker {
  private epoch = 0
  private identity = ''
  private controller: AbortController | undefined
  private current: BackendSession | null = null

  update(backend: BackendConnectionConfiguration | null): BackendSession | null {
    const configHash = backend ? backendConfigurationHash(backend) : ''
    // Compare the complete in-memory identity. The compact hash is useful to
    // consumers, but a non-cryptographic hash collision must never retain a
    // session after its connection fields changed.
    const identity = backend ? `${backend.uuid}:${connectionIdentity(backend)}` : ''
    if (identity === this.identity) return this.current

    this.controller?.abort()
    this.controller = undefined
    this.identity = identity
    this.epoch += 1

    if (!backend) {
      this.current = null
      return null
    }

    this.controller = new AbortController()
    this.current = {
      uuid: backend.uuid,
      epoch: this.epoch,
      configHash,
      signal: this.controller.signal,
    }
    return this.current
  }
}
