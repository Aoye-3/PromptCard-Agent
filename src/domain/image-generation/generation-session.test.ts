import { describe, expect, it, vi } from 'vitest'
import type { IFreeCanvasImageGeneratorNode } from '@/models/PromptHistory.model'
import type { ImageGeneratorPromptSnapshot } from './prompt-compiler'
import type { ImageGenerationRequest, ImageGenerationResult } from '@/services/image-generation-client'
import {
  ImageGenerationSessionManager,
  ImageGenerationOperationGuard,
  SingleFlightAction,
  applyImageGenerationFailure,
  applyImageGenerationStatus,
  applyImageGenerationSuccess,
  buildImageGenerationRequest
} from './generation-session'

const node: IFreeCanvasImageGeneratorNode = {
  id: 'generator-1', kind: 'image-generator', title: 'Generator', position: { x: 0, y: 0 },
  width: 420, height: 560, mode: 'region-edit',
  binding: { connectionId: 'ark-primary', modelId: 'seedream' },
  settings: { resolution: '2K', aspectRatio: '16:9', outputFormat: 'png', watermark: false },
  promptDocument: { version: 1, segments: [] },
  regions: [{ type: 'bbox', x: 100, y: 200, width: 300, height: 400 }],
  meta: { imageRegionBindings: [{ regionId: 'region-1', referenceId: 'source-ref' }] }
}

const snapshot: ImageGeneratorPromptSnapshot = {
  source: 'local',
  promptDocument: { version: 1, segments: [{ type: 'text', text: 'Keep the product' }] },
  prompt: 'Keep the product',
  references: [],
  inputAssets: [{ referenceId: 'source-ref', role: 'source-image', assetId: 'asset-source', order: 0 }],
  validationErrors: [],
  canGenerate: true
}

const result = (runId: string): ImageGenerationResult => ({
  runId, state: 'succeeded', assetId: `asset-${runId}`, captureId: `capture-${runId}`,
  contentType: 'image/png', width: 2048, height: 1152
})

describe('image generation session', () => {
  it('builds the provider-neutral request from the frozen compiled snapshot and bound regions', () => {
    expect(buildImageGenerationRequest('project-1', node, snapshot)).toEqual({
      projectId: 'project-1', nodeId: 'generator-1', connectionId: 'ark-primary', modelId: 'seedream',
      mode: 'region-edit', promptDocument: snapshot.promptDocument,
      inputs: [{ referenceId: 'source-ref', assetId: 'asset-source', order: 0 }],
      regions: [{ type: 'bbox', referenceId: 'source-ref', x1: 100, y1: 200, x2: 400, y2: 600 }],
      resolution: '2K', aspectRatio: '16:9', outputFormat: 'png', watermark: false
    })
  })

  it('sends explicit dimensions only for a custom aspect ratio', () => {
    const customNode = {
      ...node,
      settings: { ...node.settings, aspectRatio: 'custom' as const, width: 1200, height: 1600 }
    }
    expect(buildImageGenerationRequest('project-1', customNode, snapshot)).toMatchObject({
      aspectRatio: 'custom', width: 1200, height: 1600
    })
  })

  it('freezes the click snapshot, blocks a duplicate while running, and writes the local result', async () => {
    const pending = deferred<ImageGenerationResult>()
    const transport = vi.fn((request: ImageGenerationRequest) => {
      expect(request.promptDocument.segments).toEqual([{ type: 'text', text: 'Keep the product' }])
      return pending.promise
    })
    const statuses: string[] = []
    const onSucceeded = vi.fn()
    const manager = new ImageGenerationSessionManager(transport)
    const request = buildImageGenerationRequest('project-1', node, snapshot)

    const first = manager.start(request, { onStatus: status => statuses.push(status), onSucceeded })
    request.promptDocument.segments[0] = { type: 'text', text: 'Changed later' }
    const duplicate = manager.start(request, { onStatus: status => statuses.push(status), onSucceeded })

    expect(duplicate).toBe(first)
    expect(manager.isBusy('project-1', node.id)).toBe(true)
    expect(transport).toHaveBeenCalledTimes(1)
    pending.resolve(result('run-1'))
    await expect(first).resolves.toEqual(result('run-1'))
    expect(manager.isBusy('project-1', node.id)).toBe(false)
    expect(statuses).toEqual(['validating', 'running', 'succeeded'])
    expect(onSucceeded).toHaveBeenCalledWith(result('run-1'))
  })

  it('retries a failed frozen snapshot as a new backend request without overwriting the prior attempt', async () => {
    const transport = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('failed'), { runId: 'run-failed' }))
      .mockResolvedValueOnce(result('run-retry'))
    const statuses: string[] = []
    const manager = new ImageGenerationSessionManager(transport)
    const callbacks = { onStatus: (status: string) => statuses.push(status), onSucceeded: vi.fn(), onFailed: vi.fn() }

    expect(manager.canRetry('project-1', node.id)).toBe(false)
    await expect(manager.start(buildImageGenerationRequest('project-1', node, snapshot), callbacks)).rejects.toThrow('failed')
    expect(manager.canRetry('project-1', node.id)).toBe(true)
    await expect(manager.retry('project-1', node.id, callbacks)).resolves.toEqual(result('run-retry'))
    expect(manager.canRetry('project-1', node.id)).toBe(false)

    expect(transport).toHaveBeenCalledTimes(2)
    expect(statuses).toEqual(['validating', 'running', 'failed', 'validating', 'running', 'succeeded'])
    expect(callbacks.onFailed).toHaveBeenCalledTimes(1)
    expect(callbacks.onSucceeded).toHaveBeenCalledWith(result('run-retry'))
  })

  it('updates only the target node while preserving the permanent run outside project JSON', () => {
    const project = { nodes: [node], edges: [], meta: {} }
    const running = applyImageGenerationStatus(project, node.id, 'running')
    const succeeded = applyImageGenerationSuccess(running, node.id, result('run-success'))
    const failed = applyImageGenerationFailure(succeeded, node.id, Object.assign(new Error('Safe failure'), { runId: 'run-failed' }))

    expect(running.nodes[0]).toMatchObject({ meta: { status: 'running' } })
    expect(succeeded.nodes[0]).toMatchObject({
      primaryAssetId: 'asset-run-success', activeRunId: 'run-success',
      meta: { status: 'succeeded', resultCaptureId: 'capture-run-success' }
    })
    expect(failed.nodes[0]).toMatchObject({
      primaryAssetId: 'asset-run-success', activeRunId: 'run-failed',
      meta: { status: 'failed', generationError: 'Safe failure' }
    })
    expect((failed.nodes[0] as IFreeCanvasImageGeneratorNode).meta).not.toHaveProperty('runHistory')
  })

  it('invalidates callbacks captured by a previous project even when node ids match', () => {
    const guard = new ImageGenerationOperationGuard()
    guard.activateProject('project-a')
    const operationA = guard.begin('project-a', 'same-node')
    expect(guard.isCurrent('project-a', 'same-node', operationA)).toBe(true)

    guard.activateProject('project-b')
    const operationB = guard.begin('project-b', 'same-node')

    expect(guard.isCurrent('project-a', 'same-node', operationA)).toBe(false)
    expect(guard.isCurrent('project-b', 'same-node', operationB)).toBe(true)
  })

  it('runs async generator creation as a single flight under a double click', async () => {
    const pending = deferred<string>()
    const create = vi.fn(() => pending.promise)
    const gate = new SingleFlightAction()

    const first = gate.run(create)
    const duplicate = gate.run(create)
    expect(duplicate).toBe(first)
    expect(gate.busy).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)

    pending.resolve('created')
    await expect(first).resolves.toBe('created')
    expect(gate.busy).toBe(false)
  })

  it('drops an async create completion after its originating project is replaced', async () => {
    const guard = new ImageGenerationOperationGuard()
    const assignment = deferred<string>()
    const createdIn: string[] = []
    guard.activateProject('project-a')
    const operationId = guard.begin('project-a', '__create-image-generator__')
    const create = assignment.promise.then(() => {
      if (guard.isCurrent('project-a', '__create-image-generator__', operationId)) createdIn.push('project-a')
    })

    guard.activateProject('project-b')
    assignment.resolve('ready')
    await create

    expect(createdIn).toEqual([])
  })
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
