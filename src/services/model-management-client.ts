import {
  getRuntimeErrorPresentation,
  type ImageGenerationProviderDiagnostic,
  type ImageGenerationProviderStatus,
  type ImageGenerationStatus,
  type ModelAssignment,
  type ModelAssignmentInput,
  type ModelCatalog,
  type ModelConnection,
  type ModelConnectionDependencies,
  type ModelConnectionInput,
  type ModelConnectionTestResult,
  type ModelSlot
} from '@/domain/models/model-management'

export type {
  ImageGenerationProviderDiagnostic,
  ImageGenerationProviderStatus,
  ImageGenerationStatus,
  ModelAssignment,
  ModelAssignmentInput,
  ModelCapabilities,
  ModelCatalog,
  ModelCatalogEntry,
  ModelConnection,
  ModelConnectionDependencies,
  ModelConnectionInput,
  ModelConnectionTestResult,
  ModelConnectionTestState,
  ModelModality,
  ModelProvider,
  ModelSlot
} from '@/domain/models/model-management'

const MODEL_MANAGEMENT_BASE = '/agent-api/promptcard/runtime'

export class ModelManagementClientError extends Error {
  code: string
  action: string
  retryable: boolean
  field?: string

  constructor(code: string, retryable: boolean, field?: string) {
    const presentation = getRuntimeErrorPresentation(code)
    super(presentation.message)
    this.name = 'ModelManagementClientError'
    this.code = code
    this.action = presentation.action
    this.retryable = retryable
    this.field = field
  }
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
      const payload = await response.json().catch(() => null)
      const detail = isRecord(payload) && isRecord(payload.detail) ? payload.detail : {}
      const code = safeErrorIdentifier(detail.code, 'runtime_request_failed')
      const field = safeErrorIdentifier(detail.field)
      throw new ModelManagementClientError(code, detail.retryable === true, field)
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
      request(`/model-assignments/${encodeURIComponent(slot)}`, jsonRequest('PUT', input)),

    clearAssignment: (slot: ModelSlot): Promise<void> =>
      request(`/model-assignments/${encodeURIComponent(slot)}`, { method: 'DELETE', headers: jsonHeaders() }),

    getConnectionDependencies: async (connectionId: string): Promise<ModelConnectionDependencies> => {
      const payload = await request<Record<string, unknown>>(
        `/model-connections/${encodeURIComponent(connectionId)}/dependencies`
      )
      return {
        assignments: Array.isArray(payload.assignments)
          ? payload.assignments.filter(isModelSlot)
          : [],
        canvasNodeCount: isNonNegativeInteger(payload.canvasNodeCount) ? payload.canvasNodeCount : null,
        canvasNodeCountAvailable: payload.canvasNodeCountAvailable === true
      }
    },

    getImageGenerationStatus: async (): Promise<ImageGenerationStatus> => {
      const payload = await request<Record<string, unknown>>('/image-generation-status')
      const credentialStore = isRecord(payload.credentialStore) ? payload.credentialStore : {}
      return {
        serverEnabled: payload.serverEnabled === true,
        checkedAt: isNonNegativeInteger(payload.checkedAt) ? payload.checkedAt : 0,
        credentialStore: { available: credentialStore.available === true },
        providers: Array.isArray(payload.providers)
          ? payload.providers.flatMap(normalizeProviderDiagnostic)
          : []
      }
    }
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

const normalizeProviderDiagnostic = (value: unknown): ImageGenerationProviderDiagnostic[] => {
  if (!isRecord(value) || !isRecord(value.sdk) || !isProviderStatus(value.status)) return []
  const sdk = value.sdk
  const error = isRecord(sdk.error)
    ? {
        code: safeErrorIdentifier(sdk.error.code, 'ark_sdk_check_failed'),
        message: getRuntimeErrorPresentation(safeErrorIdentifier(sdk.error.code, 'ark_sdk_check_failed')).message
      }
    : null
  return [{
    providerId: typeof value.providerId === 'string' ? value.providerId : '',
    status: value.status,
    sdk: {
      packageName: typeof sdk.packageName === 'string' ? sdk.packageName : '',
      installedVersion: typeof sdk.installedVersion === 'string' ? sdk.installedVersion : null,
      requiredVersion: typeof sdk.requiredVersion === 'string' ? sdk.requiredVersion : '',
      compatible: sdk.compatible === true,
      error
    }
  }]
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

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')
const isNonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0
const isModelSlot = (value: unknown): value is ModelSlot => value === 'chat.primary' || value === 'image.primary'
const isProviderStatus = (value: unknown): value is ImageGenerationProviderStatus => (
  value === 'ready' || value === 'missing' || value === 'incompatible' || value === 'check_failed'
)
const safeErrorIdentifier = (value: unknown, fallback = ''): string => (
  typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : fallback
)
