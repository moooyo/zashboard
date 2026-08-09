import type { Backend } from '@/types'

export const BACKEND_LIST_STORAGE_KEY = 'setup/api-list'
export const BACKEND_SESSION_SECRETS_KEY = 'setup/session-secrets'

export type StoredBackend = Omit<Backend, 'password'> & { password?: string }

export const hydrateBackendState = (
  stored: StoredBackend[],
  sessionSecrets: Record<string, string>,
): Backend[] =>
  stored.map((backend) => {
    const rememberSecret = backend.rememberSecret === true
    return {
      ...backend,
      password: sessionSecrets[backend.uuid] || backend.password || '',
      rememberSecret,
    }
  })

export const dehydrateBackendState = (backends: Backend[]) => {
  const stored: StoredBackend[] = []
  const sessionSecrets: Record<string, string> = {}

  for (const backend of backends) {
    const { password, ...metadata } = backend
    if (password) sessionSecrets[backend.uuid] = password
    if (backend.rememberSecret === true) {
      stored.push({ ...metadata, password })
    } else {
      stored.push(metadata)
    }
  }

  return { sessionSecrets, stored }
}
