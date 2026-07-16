import {
  ImageGenerationController,
  requestImageGeneration,
  type ImageGenerationRequest,
  type ImageGenerationResult
} from '@/services/image-generation-client'
import type { IFreeCanvasImageGeneratorNode, IFreeCanvasProject } from '@/models/PromptHistory.model'
import type { ImageGeneratorPromptSnapshot } from './prompt-compiler'
import { readImageRegionBindings, restoreBoundImageRegions } from './regions'

export type ImageGenerationNodeStatus = 'idle' | 'validating' | 'running' | 'succeeded' | 'failed'

export interface ImageGenerationSessionCallbacks {
  onStatus: (status: ImageGenerationNodeStatus) => void
  onSucceeded?: (result: ImageGenerationResult) => void
  onFailed?: (error: unknown) => void
}

type Transport = (request: ImageGenerationRequest) => Promise<ImageGenerationResult>

interface SessionEntry {
  controller: ImageGenerationController
  active: Promise<ImageGenerationResult> | null
}

export class ImageGenerationSessionManager {
  private readonly transport: Transport
  private readonly sessions = new Map<string, SessionEntry>()

  constructor(transport?: Transport) {
    this.transport = transport || requestImageGeneration
  }

  canRetry(projectId: string, nodeId: string): boolean {
    const entry = this.sessions.get(sessionKey(projectId, nodeId))
    return Boolean(entry && !entry.active && entry.controller.state.status === 'failed')
  }

  isBusy(projectId: string, nodeId: string): boolean {
    return Boolean(this.sessions.get(sessionKey(projectId, nodeId))?.active)
  }

  reconcile(
    projectId: string,
    nodeId: string,
    callbacks: ImageGenerationSessionCallbacks
  ): boolean {
    const entry = this.sessions.get(sessionKey(projectId, nodeId))
    if (!entry) return false

    if (entry.active) {
      void entry.active
        .then(result => {
          callbacks.onStatus('succeeded')
          callbacks.onSucceeded?.(result)
        })
        .catch(error => {
          callbacks.onStatus('failed')
          callbacks.onFailed?.(error)
        })
      return true
    }

    const state = entry.controller.state
    if (state.status === 'succeeded') {
      callbacks.onStatus('succeeded')
      callbacks.onSucceeded?.(state.result)
      return true
    }
    if (state.status === 'failed') {
      callbacks.onStatus('failed')
      callbacks.onFailed?.(state.error)
      return true
    }
    return false
  }

  start(
    request: ImageGenerationRequest,
    callbacks: ImageGenerationSessionCallbacks
  ): Promise<ImageGenerationResult> {
    const key = sessionKey(request.projectId, request.nodeId || request.conversationId || '')
    const existing = this.sessions.get(key)
    if (existing?.active) return existing.active

    const entry: SessionEntry = {
      controller: new ImageGenerationController(this.transport),
      active: null
    }
    this.sessions.set(key, entry)
    callbacks.onStatus('validating')
    return this.execute(entry, () => entry.controller.start(request), callbacks)
  }

  retry(
    projectId: string,
    nodeId: string,
    callbacks: ImageGenerationSessionCallbacks
  ): Promise<ImageGenerationResult> {
    const entry = this.sessions.get(sessionKey(projectId, nodeId))
    if (!entry) return Promise.reject(new Error('No failed image generation is available to retry'))
    if (entry.active) return entry.active
    callbacks.onStatus('validating')
    return this.execute(entry, () => entry.controller.retry(), callbacks)
  }

  private execute(
    entry: SessionEntry,
    generate: () => Promise<ImageGenerationResult>,
    callbacks: ImageGenerationSessionCallbacks
  ): Promise<ImageGenerationResult> {
    callbacks.onStatus('running')
    const active = generate()
      .then(result => {
        callbacks.onStatus('succeeded')
        callbacks.onSucceeded?.(result)
        return result
      })
      .catch(error => {
        callbacks.onStatus('failed')
        callbacks.onFailed?.(error)
        throw error
      })
      .finally(() => {
        if (entry.active === active) entry.active = null
      })
    entry.active = active
    return active
  }
}

export class ImageGenerationOperationGuard {
  private activeProjectId: string | null = null
  private readonly operations = new Map<string, string>()
  private sequence = 0

  activateProject(projectId: string): void {
    if (projectId === this.activeProjectId) return
    this.activeProjectId = projectId
    this.operations.clear()
  }

  deactivateProject(projectId: string): void {
    if (projectId !== this.activeProjectId) return
    this.activeProjectId = null
    this.operations.clear()
  }

  begin(projectId: string, nodeId: string): string {
    const operationId = `image-generation-operation-${++this.sequence}`
    this.operations.set(sessionKey(projectId, nodeId), operationId)
    return operationId
  }

  isCurrent(projectId: string, nodeId: string, operationId: string): boolean {
    return this.activeProjectId === projectId
      && this.operations.get(sessionKey(projectId, nodeId)) === operationId
  }
}

export class SingleFlightAction {
  private active: Promise<unknown> | null = null

  get busy(): boolean {
    return this.active !== null
  }

  run<T>(action: () => Promise<T>): Promise<T> {
    if (this.active) return this.active as Promise<T>
    let pending: Promise<T>
    try {
      pending = action()
    } catch (error) {
      pending = Promise.reject(error)
    }
    const active = pending
      .finally(() => {
        if (this.active === active) this.active = null
      })
    this.active = active
    return active
  }
}

export const buildImageGenerationRequest = (
  projectId: string,
  node: IFreeCanvasImageGeneratorNode,
  snapshot: ImageGeneratorPromptSnapshot
): ImageGenerationRequest => {
  if (!snapshot.canGenerate) throw new Error('Image generation inputs are not valid')
  if (!node.binding.connectionId || !node.binding.modelId) throw new Error('Image model is not configured')

  const regions = restoreBoundImageRegions(node.regions, readImageRegionBindings(node.meta))
  return {
    projectId,
    nodeId: node.id,
    connectionId: node.binding.connectionId,
    modelId: node.binding.modelId,
    mode: node.mode,
    promptDocument: {
      version: 1,
      segments: snapshot.promptDocument.segments.map(segment => segment.type === 'text'
        ? { type: 'text', text: segment.text }
        : { type: 'reference', referenceId: segment.referenceId, label: segment.label })
    },
    inputs: snapshot.inputAssets.map(input => ({
      referenceId: input.referenceId,
      role: input.role,
      assetId: input.assetId,
      order: input.order
    })),
    regions: regions.map(region => region.type === 'point'
      ? { type: 'point', referenceId: region.referenceId, x: region.x, y: region.y }
      : {
          type: 'bbox', referenceId: region.referenceId,
          x1: region.x, y1: region.y, x2: region.x + region.width, y2: region.y + region.height
        }),
    resolution: node.settings.resolution,
    aspectRatio: node.settings.aspectRatio,
    ...(node.settings.aspectRatio === 'custom'
      ? { width: node.settings.width, height: node.settings.height }
      : {}),
    outputFormat: node.settings.outputFormat,
    watermark: node.settings.watermark,
    promptOptimization: 'standard'
  }
}

export const applyImageGenerationStatus = (
  project: IFreeCanvasProject,
  nodeId: string,
  status: ImageGenerationNodeStatus
): IFreeCanvasProject => updateGeneratorNode(project, nodeId, node => ({
  ...node,
  meta: {
    ...node.meta,
    status,
    ...(status === 'validating' || status === 'running' ? { generationError: undefined } : {})
  }
}))

export const applyImageGenerationSuccess = (
  project: IFreeCanvasProject,
  nodeId: string,
  result: ImageGenerationResult
): IFreeCanvasProject => updateGeneratorNode(project, nodeId, node => ({
  ...node,
  primaryAssetId: result.assetId,
  activeRunId: result.runId,
  meta: {
    ...node.meta,
    status: 'succeeded',
    generationError: undefined,
    resultCaptureId: result.captureId
  }
}))

export const applyImageGenerationFailure = (
  project: IFreeCanvasProject,
  nodeId: string,
  error: unknown
): IFreeCanvasProject => updateGeneratorNode(project, nodeId, node => ({
  ...node,
  ...(
    error && typeof error === 'object' && typeof (error as { runId?: unknown }).runId === 'string'
      ? { activeRunId: (error as { runId: string }).runId }
      : {}
  ),
  meta: {
    ...node.meta,
    status: 'failed',
    generationError: error instanceof Error ? error.message : 'Image generation failed'
  }
}))

const updateGeneratorNode = (
  project: IFreeCanvasProject,
  nodeId: string,
  update: (node: IFreeCanvasImageGeneratorNode) => IFreeCanvasImageGeneratorNode
): IFreeCanvasProject => ({
  ...project,
  nodes: project.nodes.map(node => node.id === nodeId && node.kind === 'image-generator'
    ? update(node)
    : node)
})

const sessionKey = (projectId: string, nodeId: string): string => `${projectId}:${nodeId}`
