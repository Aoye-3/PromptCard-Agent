import { describe, expect, it } from 'vitest'
import {
  compileImageOperationDraft,
  imageOperationBlockingIssues,
  type ImageOperationDraft
} from './image-operation-draft'

const draft = (overrides: Partial<ImageOperationDraft> = {}): ImageOperationDraft => ({
  operation: 'effect-render',
  source: {
    nodeId: 'node-source',
    originalAssetId: 'asset-original',
    canvasAssetId: 'asset-canvas',
    providerAssetId: 'asset-provider',
    previewUrl: '/assets/asset-provider',
    requiresVisibleRaster: true,
    includesCrop: true,
    includesAnnotations: false,
    includesPresentation: false
  },
  prompt: '转成暖色产品摄影',
  presetId: 'product-sketch',
  preservationIntents: ['产品轮廓', '材质颜色'],
  references: [{
    referenceId: 'reference-style',
    assetId: 'asset-style',
    label: '灯光参考',
    role: 'style',
    order: 0
  }],
  resolution: '2K',
  aspectRatio: '1:1',
  ...overrides
})

describe('image operation draft compiler', () => {
  it('keeps application roles in prompt and snapshot without inventing provider role fields', () => {
    const result = compileImageOperationDraft(draft(), {
      connectionId: 'connection-1',
      modelId: 'model-1',
      outputFormat: 'png',
      watermark: false,
      promptOptimization: 'standard'
    })

    expect(result.inputs).toEqual([
      {
        referenceId: 'source-node-source',
        assetId: 'asset-provider',
        sourceAssetId: 'asset-original',
        order: 0,
        role: 'source-image',
        label: '当前画布图片'
      },
      {
        referenceId: 'reference-style',
        assetId: 'asset-style',
        order: 1,
        role: 'reference-image',
        label: '灯光参考'
      }
    ])
    expect(result.promptDocument.segments[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('应用用途是“style”')
    })
    expect(result.operation).toMatchObject({
      operation: 'effect-render',
      recipeId: 'effect-render/product-sketch',
      source: { providerAssetId: 'asset-provider' },
      parameters: { referenceRoles: ['reference-style:style'] }
    })
    expect(JSON.stringify(result.inputs)).not.toContain('"style"')
  })

  it('compiles region operations to the normalized source reference', () => {
    const result = compileImageOperationDraft(draft({
      operation: 'erase',
      region: { type: 'point', x: 300, y: 420 }
    }), {
      connectionId: 'connection-1',
      modelId: 'model-1',
      outputFormat: 'png',
      watermark: false,
      promptOptimization: 'standard'
    })

    expect(result.workflow).toBe('region-edit')
    expect(result.regions).toEqual([{
      type: 'point',
      referenceId: 'source-node-source',
      x: 300,
      y: 420
    }])
  })

  it('blocks submission before provider invocation when prompt, region, or input limits are invalid', () => {
    expect(imageOperationBlockingIssues(draft({
      operation: 'text-edit',
      prompt: '',
      region: undefined
    }), 1)).toEqual([
      '请描述希望得到的结果。',
      '当前模型最多接受 1 张图片输入。',
      '请在源图上点选或框选目标区域。'
    ])
  })
})
