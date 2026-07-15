import type { ImageGenerationMode } from '@/domain/image-generation/image-generation'
import { getRuntimeErrorPresentation } from '@/domain/models/model-management'
import type { PromptDocument } from '@/models/PromptHistory.model'

export type ImageGenerationInput = {
  referenceId: string
  assetId: string
  order: number
}

export type ImageGenerationRegion =
  | { type: 'point'; referenceId: string; x: number; y: number }
  | { type: 'bbox'; referenceId: string; x1: number; y1: number; x2: number; y2: number }

export interface ImageGenerationRequest {
  projectId: string
  conversationId?: string
  nodeId?: string
  connectionId: string
  modelId: string
  mode: ImageGenerationMode
  promptDocument: PromptDocument
  inputs: ImageGenerationInput[]
  regions: ImageGenerationRegion[]
  resolution: string
  aspectRatio: string
  width?: number
  height?: number
  outputFormat: 'png' | 'jpeg'
  watermark: boolean
}

export interface ImageGenerationResult {
  runId: string
  state: 'succeeded'
  assetId: string
  captureId: string
  contentType: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
}

export class ImageGenerationClientError extends Error {
  code: string
  action: string
  retryable: boolean
  runId?: string

  constructor(code: string, retryable: boolean, runId?: string) {
    const presentation = getRuntimeErrorPresentation(code)
    super(presentation.message)
    this.name = 'ImageGenerationClientError'
    this.code = code
    this.action = presentation.action
    this.retryable = retryable
    this.runId = runId
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type ImageGenerationTransport = (request: ImageGenerationRequest) => Promise<ImageGenerationResult>

export const requestImageGeneration = async (
  input: ImageGenerationRequest,
  fetcher: Fetcher = fetch
): Promise<ImageGenerationResult> => {
  if (!hasGenerationIdentity(input)) {
    throw new ImageGenerationClientError('invalid_input', false)
  }
  const request = cloneRequest(input)
  let response: Response
  try {
    response = await fetcher('/agent-api/promptcard/runtime/image-generations', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
  } catch {
    throw new ImageGenerationClientError('service_unavailable', true)
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    const detail = isRecord(payload?.detail) ? payload.detail : {}
    const code = safeErrorIdentifier(detail.code, 'generation_failed')
    throw new ImageGenerationClientError(
      code,
      detail.retryable === true,
      isLocalIdentifier(detail.runId) ? detail.runId : undefined
    )
  }
  return parseResult(payload)
}

export type ImageGenerationControllerState =
  | { status: 'idle' }
  | { status: 'running'; attemptId: string }
  | { status: 'succeeded'; attemptId: string; runId: string; result: ImageGenerationResult }
  | { status: 'failed'; attemptId: string; error: unknown }

export class ImageGenerationController {
  private readonly transport: ImageGenerationTransport
  private readonly createAttemptId: () => string
  private snapshot: ImageGenerationRequest | null = null
  private active: Promise<ImageGenerationResult> | null = null
  private currentState: ImageGenerationControllerState = { status: 'idle' }

  constructor(
    transport: ImageGenerationTransport = request => requestImageGeneration(request),
    createAttemptId: () => string = defaultAttemptId
  ) {
    this.transport = transport
    this.createAttemptId = createAttemptId
  }

  get state(): ImageGenerationControllerState {
    return this.currentState
  }

  start(input: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (this.active) return this.active
    this.snapshot = deepFreeze(cloneRequest(input))
    return this.send(this.snapshot)
  }

  retry(): Promise<ImageGenerationResult> {
    if (this.active) return this.active
    if (this.currentState.status !== 'failed' || !this.snapshot) {
      return Promise.reject(new Error('Only a failed image generation can be retried'))
    }
    return this.send(this.snapshot)
  }

  private send(snapshot: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const attemptId = this.createAttemptId()
    this.currentState = { status: 'running', attemptId }
    const active = this.transport(cloneRequest(snapshot))
      .then(result => {
        this.currentState = { status: 'succeeded', attemptId, runId: result.runId, result }
        return result
      })
      .catch(error => {
        this.currentState = { status: 'failed', attemptId, error }
        throw error
      })
      .finally(() => {
        if (this.active === active) this.active = null
      })
    this.active = active
    return active
  }
}

export const imageGenerationClient = {
  generate: requestImageGeneration
}

const cloneRequest = (input: ImageGenerationRequest): ImageGenerationRequest => ({
  projectId: input.projectId,
  ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  ...(input.nodeId ? { nodeId: input.nodeId } : {}),
  connectionId: input.connectionId,
  modelId: input.modelId,
  mode: input.mode,
  promptDocument: {
    version: 1,
    segments: input.promptDocument.segments.map(segment => segment.type === 'text'
      ? { type: 'text', text: segment.text }
      : { type: 'reference', referenceId: segment.referenceId, label: segment.label })
  },
  inputs: input.inputs.map(item => ({
    referenceId: item.referenceId,
    assetId: item.assetId,
    order: item.order
  })),
  regions: input.regions.map(region => region.type === 'point'
    ? { type: 'point', referenceId: region.referenceId, x: region.x, y: region.y }
    : {
        type: 'bbox', referenceId: region.referenceId,
        x1: region.x1, y1: region.y1, x2: region.x2, y2: region.y2
      }),
  resolution: input.resolution,
  aspectRatio: input.aspectRatio,
  ...(input.aspectRatio === 'custom' && Number.isInteger(input.width) && Number.isInteger(input.height)
    ? { width: input.width, height: input.height }
    : {}),
  outputFormat: input.outputFormat,
  watermark: input.watermark
})

const parseResult = (payload: Record<string, unknown> | null): ImageGenerationResult => {
  if (
    !payload
    || !isLocalIdentifier(payload.runId)
    || payload.state !== 'succeeded'
    || !isLocalIdentifier(payload.assetId)
    || !isLocalIdentifier(payload.captureId)
    || !isLocalContentType(payload.contentType)
    || !isPositiveInteger(payload.width)
    || !isPositiveInteger(payload.height)
  ) {
    throw new ImageGenerationClientError('invalid_runtime_response', false)
  }
  return {
    runId: payload.runId,
    state: 'succeeded',
    assetId: payload.assetId,
    captureId: payload.captureId,
    contentType: payload.contentType,
    width: payload.width,
    height: payload.height
  }
}

const defaultAttemptId = (): string => globalThis.crypto?.randomUUID?.()
  || `generation-attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    Object.values(value).forEach(child => deepFreeze(child))
  }
  return value
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')
const hasGenerationIdentity = (value: ImageGenerationRequest): boolean => (
  Boolean(value.conversationId?.trim()) || Boolean(value.nodeId?.trim())
)
const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0
const isLocalIdentifier = (value: unknown): value is string => (
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
)
const isLocalContentType = (value: unknown): value is ImageGenerationResult['contentType'] => (
  value === 'image/png' || value === 'image/jpeg' || value === 'image/webp'
)
const safeErrorIdentifier = (value: unknown, fallback: string): string => (
  typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : fallback
)
