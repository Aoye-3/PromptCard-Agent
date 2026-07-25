import {
  getRuntimeErrorPresentation,
  type ImageGenerationProviderDiagnostic,
  type ImageGenerationProviderStatus,
  type ImageGenerationStatus,
  type ConnectionModelCatalog,
  type ModelAssignment,
  type ModelAssignmentInput,
  type ModelCatalog,
  type ModelConnection,
  type ModelConnectionDependencies,
  type ModelConnectionInput,
  type ModelConnectionTestResult,
  type ModelCatalogEntry,
  type ModelCapabilities,
  type ModelIntegrationGroup,
  type ModelProvider,
  type ModelSlot
} from '@/domain/models/model-management'
import { createRuntimeHttpClient, RuntimeHttpError } from './runtime-http-client'

export type {
  ImageGenerationProviderDiagnostic,
  ImageGenerationProviderStatus,
  ImageGenerationStatus,
  ModelAssignment,
  ModelAssignmentInput,
  ModelCapabilities,
  ModelCatalog,
  ModelCatalogEntry,
  ModelCatalogSource,
  ModelConnection,
  ModelConnectionDependencies,
  ModelConnectionInput,
  ModelConnectionTestResult,
  ModelConnectionTestState,
  ModelModality,
  ModelIntegrationGroup,
  ModelIntegrationKind,
  ModelProvider,
  ModelSlot,
  ConnectionModelCatalog,
  GroupedModelCatalog
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
  const runtimeRequest = createRuntimeHttpClient(fetchImplementation)
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    try {
      return await runtimeRequest<T>(`${MODEL_MANAGEMENT_BASE}${path}`, init)
    } catch (error) {
      if (error instanceof RuntimeHttpError) {
        throw new ModelManagementClientError(error.code, error.retryable, error.field)
      }
      throw error
    }
  }

  return {
    getCatalog: async (): Promise<ModelCatalog> => {
      const payload = await request<Partial<ModelCatalog>>('/model-catalog')
      return {
        providers: Array.isArray(payload.providers) ? payload.providers.flatMap(normalizeProvider) : [],
        models: Array.isArray(payload.models) ? payload.models.flatMap(normalizeModel) : []
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

    getConnectionModels: async (connectionId: string): Promise<ConnectionModelCatalog> => {
      const payload = await request<Record<string, unknown>>(
        `/model-connections/${encodeURIComponent(connectionId)}/models`
      )
      return {
        connectionId: typeof payload.connectionId === 'string' ? payload.connectionId : connectionId,
        providerId: typeof payload.providerId === 'string' ? payload.providerId : '',
        models: Array.isArray(payload.models) ? payload.models.flatMap(normalizeModel) : []
      }
    },

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

const normalizeProvider = (value: unknown): ModelProvider[] => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.displayName !== 'string' || typeof value.defaultApiBase !== 'string') return []
  const groups = isRecord(value.integrationGroups)
    ? Object.fromEntries(
        Object.entries(value.integrationGroups).flatMap(([modality, group]) => {
          const normalized = normalizeIntegrationGroup(group)
          return (modality === 'chat' || modality === 'image') && normalized
            ? [[modality, normalized]]
            : []
        })
      )
    : undefined
  return [{
    id: value.id,
    displayName: value.displayName,
    defaultApiBase: value.defaultApiBase,
    ...(groups && Object.keys(groups).length ? { integrationGroups: groups } : {})
  }]
}

const normalizeModel = (value: unknown): ModelCatalogEntry[] => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.providerId !== 'string' || typeof value.displayName !== 'string') return []
  if (value.modality !== 'chat' && value.modality !== 'image') return []
  const integrationGroup = normalizeIntegrationGroup(value.integrationGroup)
  const source = value.source === 'provider-catalog' || value.source === 'remote' || value.source === 'cached'
    ? value.source
    : undefined
  const capabilities = normalizeModelCapabilities(value.capabilities)
  return [{
    id: value.id,
    providerId: value.providerId,
    displayName: value.displayName,
    modality: value.modality,
    ...(capabilities ? { capabilities } : {}),
    ...(integrationGroup ? { integrationGroup } : {}),
    ...(source ? { source } : {}),
    ...(typeof value.assignable === 'boolean' ? { assignable: value.assignable } : {})
  }]
}

const normalizeModelCapabilities = (value: unknown): ModelCapabilities | undefined => {
  if (!isRecord(value)) return undefined
  const capabilities: ModelCapabilities = {}
  const input = enumArray(value.input, ['text', 'image'] as const)
  const modes = enumArray(value.modes, ['generate', 'edit', 'region-edit'] as const)
  const resolutions = enumArray(value.resolutions, ['1K', '2K'] as const)
  const outputFormats = enumArray(value.outputFormats, ['png', 'jpeg'] as const)
  const annotationInputs = enumArray(value.annotationInputs, ['raster-markup'] as const)
  const regionInputs = enumArray(value.regionInputs, ['point', 'bbox'] as const)
  const responseTransports = enumArray(value.responseTransports, ['url', 'b64_json'] as const)

  if (input.length) capabilities.input = input
  if (typeof value.toolCalling === 'boolean') capabilities.toolCalling = value.toolCalling
  if (modes.length) capabilities.modes = modes
  if (resolutions.length) capabilities.resolutions = resolutions
  if (Array.isArray(value.aspectRatios)) {
    capabilities.aspectRatios = value.aspectRatios.filter((item): item is string => typeof item === 'string')
  }
  if (value.customSize === null) capabilities.customSize = null
  else if (isRecord(value.customSize)) {
    const customSize = numericObject(value.customSize, [
      'minPixels',
      'maxPixels',
      'minAspectRatio',
      'maxAspectRatio'
    ] as const)
    if (customSize) capabilities.customSize = customSize
  }
  if (outputFormats.length) capabilities.outputFormats = outputFormats
  if (typeof value.watermark === 'boolean') capabilities.watermark = value.watermark
  if (isNonNegativeInteger(value.maxReferenceImages)) {
    capabilities.maxReferenceImages = value.maxReferenceImages
  }
  if (value.mentionStrategy === 'ordered-image-labels') {
    capabilities.mentionStrategy = value.mentionStrategy
  }
  if (isRecord(value.promptOptimization)) {
    const promptModes = enumArray(value.promptOptimization.modes, ['standard', 'fast'] as const)
    const defaultMode = value.promptOptimization.default
    if (promptModes.length && (defaultMode === 'standard' || defaultMode === 'fast')) {
      capabilities.promptOptimization = { modes: promptModes, default: defaultMode }
    }
  }
  if (isRecord(value.inputConstraints)) {
    const formats = value.inputConstraints.formats
    const numeric = numericObject(value.inputConstraints, [
      'maxImages',
      'maxBytesPerImage',
      'maxPixelsPerImage',
      'minSideExclusive',
      'minAspectRatio',
      'maxAspectRatio'
    ] as const)
    if (Array.isArray(formats) && numeric) {
      capabilities.inputConstraints = {
        formats: formats.filter((item): item is string => typeof item === 'string'),
        ...numeric
      }
    }
  }
  if (annotationInputs.length) capabilities.annotationInputs = annotationInputs
  if (regionInputs.length) capabilities.regionInputs = regionInputs
  if (responseTransports.length) capabilities.responseTransports = responseTransports
  if (isNonNegativeInteger(value.outputCount)) capabilities.outputCount = value.outputCount
  if (typeof value.streaming === 'boolean') capabilities.streaming = value.streaming

  const references = normalizeReferenceCapabilities(value.references)
  if (references) capabilities.references = references
  const outputs = normalizeOutputCapabilities(value.outputs)
  if (outputs) capabilities.outputs = outputs
  const execution = normalizeExecutionCapabilities(value.execution)
  if (execution) capabilities.execution = execution
  const delivery = normalizeDeliveryCapabilities(value.delivery)
  if (delivery) capabilities.delivery = delivery

  return Object.keys(capabilities).length ? capabilities : undefined
}

const normalizeReferenceCapabilities = (
  value: unknown
): ModelCapabilities['references'] | undefined => {
  if (!isRecord(value) || !isNonNegativeInteger(value.maxCount)) return undefined
  if (value.ordering !== 'positional' && value.ordering !== 'unordered') return undefined
  return {
    maxCount: value.maxCount,
    ordering: value.ordering,
    nativeRoles: enumArray(value.nativeRoles, [
      'source',
      'identity',
      'style',
      'material',
      'layout',
      'content'
    ] as const),
    acceptedSources: enumArray(value.acceptedSources, [
      'asset',
      'url',
      'base64',
      'provider-file'
    ] as const)
  }
}

const normalizeOutputCapabilities = (
  value: unknown
): ModelCapabilities['outputs'] | undefined => {
  if (!isRecord(value)) return undefined
  if (
    value.countMode !== 'single'
    && value.countMode !== 'variations'
    && value.countMode !== 'ordered-sequence'
  ) return undefined
  if (
    value.countGuarantee !== 'exact'
    && value.countGuarantee !== 'best-effort'
    && value.countGuarantee !== 'provider-decides'
  ) return undefined
  if (value.maxCount !== null && !isNonNegativeInteger(value.maxCount)) return undefined
  if (value.alpha !== 'supported' && value.alpha !== 'unsupported' && value.alpha !== 'unknown') {
    return undefined
  }
  return {
    countMode: value.countMode,
    countGuarantee: value.countGuarantee,
    maxCount: value.maxCount,
    formats: enumArray(value.formats, ['png', 'jpeg'] as const),
    alpha: value.alpha
  }
}

const normalizeExecutionCapabilities = (
  value: unknown
): ModelCapabilities['execution'] | undefined => {
  if (!isRecord(value)) return undefined
  if (value.submission !== 'synchronous' && value.submission !== 'async-job') return undefined
  if (typeof value.cancellation !== 'boolean') return undefined
  return {
    submission: value.submission,
    progress: enumArray(value.progress, [
      'none',
      'partial-image',
      'per-output',
      'percentage'
    ] as const),
    completion: enumArray(value.completion, ['inline', 'poll', 'webhook'] as const),
    cancellation: value.cancellation
  }
}

const normalizeDeliveryCapabilities = (
  value: unknown
): ModelCapabilities['delivery'] | undefined => {
  if (!isRecord(value)) return undefined
  if (value.urlTtlSeconds !== null && !isNonNegativeInteger(value.urlTtlSeconds)) return undefined
  if (
    value.browserReadable !== true
    && value.browserReadable !== false
    && value.browserReadable !== 'unknown'
  ) return undefined
  if (typeof value.mustPersistImmediately !== 'boolean') return undefined
  return {
    forms: enumArray(value.forms, ['base64', 'temporary-url'] as const),
    urlTtlSeconds: value.urlTtlSeconds,
    browserReadable: value.browserReadable,
    mustPersistImmediately: value.mustPersistImmediately
  }
}

const enumArray = <T extends string>(
  value: unknown,
  allowed: readonly T[]
): T[] => Array.isArray(value)
  ? value.filter((item): item is T => typeof item === 'string' && allowed.includes(item as T))
  : []

const numericObject = <K extends string>(
  value: Record<string, unknown>,
  keys: readonly K[]
): Record<K, number> | null => {
  if (!keys.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))) return null
  return Object.fromEntries(keys.map(key => [key, value[key]])) as Record<K, number>
}

const normalizeIntegrationGroup = (value: unknown): ModelIntegrationGroup | undefined => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.displayName !== 'string') return undefined
  if (value.kind !== 'pi-native' && value.kind !== 'sdk') return undefined
  return { id: value.id, displayName: value.displayName, kind: value.kind }
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
  return { 'Content-Type': 'application/json' }
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
