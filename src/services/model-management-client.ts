const MODEL_MANAGEMENT_BASE = '/agent-api/promptcard/runtime'

export type ModelModality = 'chat' | 'image'
export type ModelSlot = 'chat.primary' | 'image.primary'

export interface ModelProvider {
  id: string
  displayName: string
  defaultApiBase: string
}

export interface ModelCapabilities {
  modes?: string[]
  maxReferenceImages?: number
  mentionStrategy?: string
  regionInputs?: string[]
  resolutions?: string[]
  outputCount?: number
  streaming?: boolean
}

export interface ModelCatalogEntry {
  id: string
  providerId: string
  displayName: string
  modality: ModelModality
  capabilities?: ModelCapabilities
}

export interface ModelCatalog {
  providers: ModelProvider[]
  models: ModelCatalogEntry[]
}

export interface ModelConnectionTestState {
  ok: boolean
  checkedAt: number
  message: string
}

export interface ModelConnection {
  id: string
  providerId: string
  displayName: string
  apiBase: string
  enabled: boolean
  credentialConfigured: boolean
  credentialMask?: string | null
  createdAt: number
  updatedAt: number
  lastTest?: ModelConnectionTestState
}

export interface ModelConnectionInput {
  providerId: string
  displayName: string
  apiBase: string
  enabled: boolean
  credential?: string
  clearCredential?: boolean
}

export interface ModelAssignment {
  slot: ModelSlot
  connectionId: string
  modelId: string
}

export interface ModelAssignmentInput {
  connectionId: string
  modelId: string
}

export interface ModelConnectionTestResult {
  success: boolean
  message: string
}

type FetchImplementation = typeof fetch

export const createModelManagementClient = (
  fetchImplementation: FetchImplementation = (...args) => globalThis.fetch(...args)
) => {
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetchImplementation(`${MODEL_MANAGEMENT_BASE}${path}`, {
      credentials: 'include',
      ...init
    })
    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText)
      throw new Error(message || response.statusText)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  return {
    getCatalog: async (): Promise<ModelCatalog> => {
      const payload = await request<Partial<ModelCatalog>>('/model-catalog')
      return {
        providers: Array.isArray(payload.providers) ? payload.providers : [],
        models: Array.isArray(payload.models) ? payload.models : []
      }
    },

    listConnections: async (): Promise<ModelConnection[]> => {
      const payload = await request<{ connections?: unknown[] }>('/model-connections')
      return Array.isArray(payload.connections)
        ? payload.connections.map(normalizeConnection)
        : []
    },

    createConnection: async (input: ModelConnectionInput): Promise<ModelConnection> =>
      normalizeConnection(await request('/model-connections', jsonRequest('POST', connectionBody(input)))),

    updateConnection: async (connectionId: string, input: ModelConnectionInput): Promise<ModelConnection> =>
      normalizeConnection(await request(
        `/model-connections/${encodeURIComponent(connectionId)}`,
        jsonRequest('PUT', connectionBody(input))
      )),

    deleteConnection: (connectionId: string): Promise<void> =>
      request(`/model-connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE', headers: jsonHeaders() }),

    testConnection: (connectionId: string): Promise<ModelConnectionTestResult> =>
      request(`/model-connections/${encodeURIComponent(connectionId)}/test`, jsonRequest('POST', {})),

    listAssignments: async (): Promise<ModelAssignment[]> => {
      const payload = await request<{ assignments?: ModelAssignment[] }>('/model-assignments')
      return Array.isArray(payload.assignments) ? payload.assignments : []
    },

    updateAssignment: (slot: ModelSlot, input: ModelAssignmentInput): Promise<ModelAssignment> =>
      request(`/model-assignments/${encodeURIComponent(slot)}`, jsonRequest('PUT', input))
  }
}

export const modelManagementClient = createModelManagementClient()

const connectionBody = (input: ModelConnectionInput) => {
  const body: Record<string, unknown> = {
    providerId: input.providerId,
    displayName: input.displayName,
    apiBase: input.apiBase,
    enabled: input.enabled
  }
  if (input.clearCredential) {
    body.credential = ''
  } else if (input.credential) {
    body.credential = input.credential
  }
  return body
}

const normalizeConnection = (value: unknown): ModelConnection => {
  const connection = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const lastTest = connection.lastTest && typeof connection.lastTest === 'object'
    ? connection.lastTest as Record<string, unknown>
    : undefined
  return {
    id: String(connection.id || ''),
    providerId: String(connection.providerId || ''),
    displayName: String(connection.displayName || ''),
    apiBase: String(connection.apiBase || ''),
    enabled: connection.enabled !== false,
    credentialConfigured: connection.credentialConfigured === true,
    credentialMask: typeof connection.credentialMask === 'string' ? connection.credentialMask : null,
    createdAt: Number(connection.createdAt || 0),
    updatedAt: Number(connection.updatedAt || 0),
    ...(lastTest
      ? {
          lastTest: {
            ok: lastTest.ok === true,
            checkedAt: Number(lastTest.checkedAt || 0),
            message: String(lastTest.message || '')
          }
        }
      : {})
  }
}

const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: jsonHeaders(),
  body: JSON.stringify(body)
})

const jsonHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const csrfToken = readCookie('csrf_token')
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken
  return headers
}

const readCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return undefined
  const prefix = `${name}=`
  return document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix))
    ?.slice(prefix.length)
}
