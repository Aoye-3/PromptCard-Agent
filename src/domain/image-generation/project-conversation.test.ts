import { describe, expect, it } from 'vitest'
import type { IFreeCanvasImageNode, IFreeCanvasTextNode } from '@/models/PromptHistory.model'
import type { ImageGenerationRun } from '@/storage/storage-service-client'
import {
  buildConversationGenerationRequest,
  createEmptyConversationDraft,
  injectCanvasNodesIntoDraft,
  projectRunToTurn
} from './project-conversation'

const textNode = (id: string, text: string): IFreeCanvasTextNode => ({
  id,
  kind: 'text',
  title: id,
  position: { x: 0, y: 0 },
  width: 240,
  height: 120,
  fontSize: 'medium',
  segments: [{ id: `${id}-segment`, source: 'user', text, color: '#111827', createdAt: 1, updatedAt: 1 }],
  meta: {}
})

const imageNode = (id: string, assetId?: string): IFreeCanvasImageNode => ({
  id,
  kind: 'image',
  title: id,
  position: { x: 0, y: 0 },
  width: 240,
  height: 240,
  assetId,
  annotations: [],
  meta: {}
})

describe('project image generation conversations', () => {
  it('builds an independent conversation request without a canvas node or prior turns', () => {
    const draft = {
      ...createEmptyConversationDraft(),
      promptDocument: {
        version: 1 as const,
        segments: [{ type: 'text' as const, text: 'Create a quiet observatory' }]
      },
      connectionId: 'ark-primary',
      modelId: 'seedream',
      inputs: [{
        referenceId: 'reference-1',
        role: 'reference-image' as const,
        assetId: 'asset-derived',
        sourceAssetId: 'asset-original',
        order: 0
      }]
    }

    expect(buildConversationGenerationRequest('project-1', 'conversation-1', draft)).toEqual({
      projectId: 'project-1',
      conversationId: 'conversation-1',
      connectionId: 'ark-primary',
      modelId: 'seedream',
      mode: 'generate',
      promptDocument: { version: 1, segments: [{ type: 'text', text: 'Create a quiet observatory' }] },
      inputs: [{
        referenceId: 'reference-1',
        role: 'reference-image',
        assetId: 'asset-derived',
        sourceAssetId: 'asset-original',
        order: 0
      }],
      regions: [],
      resolution: '2K',
      aspectRatio: '1:1',
      outputFormat: 'png',
      watermark: false,
      promptOptimization: 'standard'
    })
  })

  it('injects only explicit usable canvas nodes and reports rejected selections', () => {
    const result = injectCanvasNodesIntoDraft(createEmptyConversationDraft(), [
      textNode('text-1', 'First prompt'),
      imageNode('image-1', 'asset-local'),
      imageNode('image-missing')
    ])

    expect(result.draft.promptDocument).toEqual({
      version: 1,
      segments: [{ type: 'text', text: 'First prompt' }]
    })
    expect(result.draft.inputs).toMatchObject([{
      assetId: 'asset-local',
      order: 0,
      role: 'reference-image'
    }])
    expect(result.rejected).toEqual([{ nodeId: 'image-missing', reason: '图片节点没有可用的本地资产。' }])
  })

  it('projects the immutable run snapshot into a display turn', () => {
    const run = {
      id: 'run-1', projectId: 'project-1', conversationId: 'conversation-1',
      connectionId: 'ark-primary', providerId: 'volcengine-ark', modelId: 'seedream', state: 'succeeded',
      requestSnapshot: {
        mode: 'edit',
        promptOptimization: 'standard',
        promptDocument: { version: 1, segments: [{ type: 'text', text: 'Make it warmer' }] },
        inputAssets: [], regions: [], resolution: '2K', aspectRatio: '16:9', outputFormat: 'png', watermark: false
      },
      outputAssetIds: ['asset-output'], createdAt: 10, finishedAt: 20
    } satisfies ImageGenerationRun

    expect(projectRunToTurn(run, modelId => modelId === 'seedream' ? 'Seedream 5.0 Pro' : modelId)).toMatchObject({
      id: 'run-1',
      prompt: 'Make it warmer',
      state: 'succeeded',
      settings: { workflow: 'smart-edit', modelLabel: 'Seedream 5.0 Pro', resolution: '2K', aspectRatio: '16:9' },
      result: { assetId: 'asset-output', imageUrl: '/storage-api/assets/asset-output' }
    })
  })
})
