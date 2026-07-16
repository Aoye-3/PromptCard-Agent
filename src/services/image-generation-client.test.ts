import { describe, expect, it, vi } from 'vitest'
import {
  ImageGenerationController,
  requestImageGeneration,
  type ImageGenerationRequest
} from './image-generation-client'

const request = (): ImageGenerationRequest => ({
  projectId: 'project-1',
  nodeId: 'node-1',
  connectionId: 'ark-primary',
  modelId: 'doubao-seedream-5-0-pro-260628',
  mode: 'region-edit',
  promptDocument: {
    version: 1,
    segments: [
      { type: 'text', text: 'Refine the product' },
      { type: 'reference', referenceId: 'product', label: 'Product' }
    ]
  },
  inputs: [{ referenceId: 'product', assetId: 'asset-input.png', order: 0 }],
  regions: [{ type: 'bbox', referenceId: 'product', x1: 10, y1: 20, x2: 300, y2: 400 }],
  resolution: '2K',
  aspectRatio: '16:9',
  outputFormat: 'png',
  watermark: false,
  promptOptimization: 'standard'
})

describe('image generation client', () => {
  it('posts a project conversation request without requiring a canvas node', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      runId: 'image-run-conversation',
      state: 'succeeded',
      assetId: 'asset-conversation.png',
      captureId: 'capture-conversation',
      contentType: 'image/png',
      width: 1024,
      height: 1024
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const conversationRequest = {
      ...request(),
      nodeId: undefined,
      conversationId: 'conversation-1',
      previousTurns: [{ prompt: 'must not be sent' }]
    } as ImageGenerationRequest

    await requestImageGeneration(conversationRequest, fetcher)

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(body).toMatchObject({ projectId: 'project-1', conversationId: 'conversation-1' })
    expect(body).not.toHaveProperty('nodeId')
    expect(body).not.toHaveProperty('previousTurns')
  })

  it('rejects a request without a conversation or legacy node identity before transport', async () => {
    const fetcher = vi.fn()
    const invalidRequest = { ...request(), nodeId: undefined }

    await expect(requestImageGeneration(invalidRequest as ImageGenerationRequest, fetcher)).rejects.toMatchObject({
      code: 'invalid_input',
      retryable: false
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('posts the camelCase runtime contract without inventing a run id and keeps only local result fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      runId: 'image-run-backend',
      state: 'succeeded',
      assetId: 'asset-local.png',
      captureId: 'capture-local',
      contentType: 'image/png',
      width: 2048,
      height: 2048,
      remoteUrl: 'https://provider.example/secret.png',
      apiKey: 'raw-secret'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const unsafeRequest = { ...request(), width: 999, height: 999, runId: 'frontend-run', remoteUrl: 'https://bad.example' } as ImageGenerationRequest

    const result = await requestImageGeneration(unsafeRequest, fetcher)

    expect(fetcher).toHaveBeenCalledWith('/agent-api/promptcard/runtime/image-generations', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(request())
    }))
    expect(result).toEqual({
      runId: 'image-run-backend',
      state: 'succeeded',
      assetId: 'asset-local.png',
      captureId: 'capture-local',
      contentType: 'image/png',
      width: 2048,
      height: 2048
    })
    expect(JSON.stringify(result)).not.toContain('provider.example')
    expect(JSON.stringify(result)).not.toContain('raw-secret')
  })

  it('sends the CSRF token required by the runtime gateway', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      runId: 'image-run-backend',
      state: 'succeeded',
      assetId: 'asset-local.png',
      captureId: 'capture-local',
      contentType: 'image/png',
      width: 2048,
      height: 2048
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const originalDocument = globalThis.document
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { cookie: 'csrf_token=image-csrf-token' }
    })

    try {
      await requestImageGeneration(request(), fetcher)
      const headers = fetcher.mock.calls[0][1]?.headers as Headers
      expect(headers.get('X-CSRF-Token')).toBe('image-csrf-token')
    } finally {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument
      })
    }
  })

  it('maps middleware string errors to a safe CSRF error code', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: 'CSRF validation failed'
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }))

    await expect(requestImageGeneration(request(), fetcher)).rejects.toMatchObject({
      code: 'csrf_validation_failed',
      retryable: false
    })
  })

  it('maps runtime failures without retaining provider messages or remote locations', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: {
        code: 'rate_limited',
        message: 'raw-secret at https://provider.example/output',
        retryable: true,
        runId: 'image-run-failed',
        remoteUrl: 'https://provider.example/output'
      }
    }), { status: 429, headers: { 'Content-Type': 'application/json' } }))

    await expect(requestImageGeneration(request(), fetcher)).rejects.toMatchObject({
      name: 'ImageGenerationClientError',
      code: 'rate_limited',
      message: '图片服务请求过于频繁，请稍后重试。',
      action: '稍后重试',
      retryable: true,
      runId: 'image-run-failed'
    })
  })

  it.each([
    ['credential_missing', '更新凭据'],
    ['connection_disabled', '前往连接'],
    ['connection_not_tested', '前往连接'],
    ['connection_test_failed', '前往连接'],
    ['runtime_disabled', '查看服务状态'],
    ['ark_sdk_incompatible', '重新检测'],
    ['invalid_size', '修改参数'],
    ['invalid_input', '修改参数'],
    ['timeout', '稍后重试'],
    ['storage_write_failed', '检查本地存储']
  ])('adds safe recovery metadata for %s', async (code, action) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: { code, message: 'unsafe provider detail', action: 'unsafe action', retryable: false }
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }))

    await expect(requestImageGeneration(request(), fetcher)).rejects.toMatchObject({ code, action })
  })

  it('rejects a successful response that substitutes a remote location for a local asset id', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      runId: 'image-run-backend', state: 'succeeded',
      assetId: 'https://provider.example/output.png', captureId: 'capture-local',
      contentType: 'image/png', width: 1024, height: 1024
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(requestImageGeneration(request(), fetcher)).rejects.toMatchObject({
      code: 'invalid_runtime_response'
    })
  })

  it('freezes the first click snapshot, ignores a duplicate click, and retries with a new local attempt id', async () => {
    const sent: ImageGenerationRequest[] = []
    let rejectFirst: ((error: Error) => void) | undefined
    const transport = vi.fn((payload: ImageGenerationRequest) => {
      sent.push(payload)
      if (sent.length === 1) {
        return new Promise<never>((_resolve, reject) => { rejectFirst = reject })
      }
      return Promise.resolve({
        runId: 'image-run-retry', state: 'succeeded' as const, assetId: 'asset-output.png',
        captureId: 'capture-output', contentType: 'image/png' as const, width: 1024, height: 1024
      })
    })
    const attemptIds = ['attempt-1', 'attempt-2']
    const controller = new ImageGenerationController(transport, () => attemptIds.shift() || 'unexpected')
    const mutable = request()

    const first = controller.start(mutable)
    mutable.promptDocument.segments[0] = { type: 'text', text: 'mutated after click' }
    const duplicate = controller.start(mutable)

    expect(transport).toHaveBeenCalledTimes(1)
    expect(sent[0].promptDocument.segments[0]).toEqual({ type: 'text', text: 'Refine the product' })
    expect(controller.state).toMatchObject({ status: 'running', attemptId: 'attempt-1' })

    rejectFirst?.(new Error('provider failed'))
    await expect(first).rejects.toThrow('provider failed')
    await expect(duplicate).rejects.toThrow('provider failed')
    expect(controller.state).toMatchObject({ status: 'failed', attemptId: 'attempt-1' })

    await expect(controller.retry()).resolves.toMatchObject({ runId: 'image-run-retry' })
    expect(transport).toHaveBeenCalledTimes(2)
    expect(sent[1].promptDocument.segments[0]).toEqual({ type: 'text', text: 'Refine the product' })
    expect(controller.state).toMatchObject({ status: 'succeeded', attemptId: 'attempt-2', runId: 'image-run-retry' })
  })
})
