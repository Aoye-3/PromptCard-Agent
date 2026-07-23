import { describe, expect, test, vi } from 'vitest'
import { createThreeStageProject } from '@/domain/projects/project-normalization'
import { updateFreeCanvasNodePosition, threeStageFormNodeId, createFreeCanvasMediaNode, addFreeCanvasMediaNode, addFreeCanvasEdge, mediaNodeFlowId } from './free-canvas'
import {
  addFreeCanvasImageAnnotation,
  appendFreeCanvasUserText,
  createFreeCanvasImageGeneratorNode,
  createFreeCanvasImageGenerationPlaceholder,
  createFreeCanvasImageNodeFromMedia,
  createFreeCanvasProject,
  createQuickTextNode,
  freeCanvasTextSegmentsToPlainText,
  failFreeCanvasImageGeneration,
  completeFreeCanvasImageGeneration,
  migrateLegacyThreeStageFreeCanvasProject,
  replaceFreeCanvasTextRange,
  replaceFreeCanvasImageAnnotations,
  removeFreeCanvasImageAnnotation,
  removeFreeCanvasProjectNodes,
  updateFreeCanvasImageAnnotation,
  updateFreeCanvasImageNodeFrame,
  updateFreeCanvasNodePosition as updateFreeCanvasProjectNodePosition,
  updateFreeCanvasTextNodeStyle,
  updateFreeCanvasTextNodeUserText
} from './free-canvas-project'
import type { IPromptProject } from '@/models/PromptHistory.model'

describe('free canvas project domain', () => {
  test('creates an empty standalone free canvas project payload', () => {
    const project = createFreeCanvasProject(100)

    expect(project.nodes).toEqual([])
    expect(project.edges).toEqual([])
    expect(project.selectedNodeId).toBeNull()
  })

  test('removes the last node without blocking the empty canvas', () => {
    const node = createQuickTextNode('Use dusk lighting', { x: 20, y: 40 }, 100)
    const project = createFreeCanvasProject(100, { nodes: [node], selectedNodeId: node.id })

    const updated = removeFreeCanvasProjectNodes(project, [node.id])

    expect(updated.nodes).toEqual([])
    expect(updated.edges).toEqual([])
    expect(updated.selectedNodeId).toBeNull()
  })

  test('normalizes image nodes with an empty annotations array', () => {
    const image = createFreeCanvasImageNodeFromMedia(createFreeCanvasMediaNode('imageAsset', { x: 20, y: 40 }, 100), 101)
    const project = createFreeCanvasProject(100, { nodes: [{ ...image, annotations: undefined } as never] })

    expect(project.nodes[0]).toMatchObject({
      kind: 'image',
      annotations: []
    })
  })

  test('creates a stable running image generation placeholder', () => {
    const node = createFreeCanvasImageGenerationPlaceholder({
      runId: 'image-run-0123456789abcdef0123456789abcdef',
      conversationId: 'conversation-1',
      prompt: 'A red apple',
      position: { x: 120, y: 240 },
      width: 320,
      height: 180
    })

    expect(node).toMatchObject({
      id: 'free-image-generation-image-run-0123456789abcdef0123456789abcdef',
      kind: 'image',
      position: { x: 120, y: 240 },
      width: 320,
      height: 180,
      assetId: null,
      imagePrompt: 'A red apple',
      meta: {
        generationRunId: 'image-run-0123456789abcdef0123456789abcdef',
        conversationId: 'conversation-1',
        generationState: 'running',
        source: 'image-generation-conversation'
      }
    })
  })

  test('completes a placeholder without overwriting its moved and resized frame', () => {
    const runId = 'image-run-0123456789abcdef0123456789abcdef'
    const placeholder = createFreeCanvasImageGenerationPlaceholder({
      runId,
      conversationId: 'conversation-1',
      prompt: 'A red apple',
      position: { x: 120, y: 240 },
      width: 320,
      height: 180
    })
    const moved = updateFreeCanvasProjectNodePosition(
      updateFreeCanvasImageNodeFrame(createFreeCanvasProject(1, { nodes: [placeholder] }), placeholder.id, {
        width: 480,
        height: 270
      }),
      placeholder.id,
      { x: 400, y: 500 }
    )

    const completed = completeFreeCanvasImageGeneration(moved, runId, 'asset-output.png', '/asset-output.png')

    expect(completed.nodes[0]).toMatchObject({
      id: placeholder.id,
      position: { x: 400, y: 500 },
      width: 480,
      height: 270,
      assetId: 'asset-output.png',
      imageUrl: '/asset-output.png',
      meta: { generationState: 'succeeded', generatedResult: true }
    })
    expect(completed.nodes[0].meta).not.toHaveProperty('generationErrorCode')
  })

  test('keeps running generation nodes when removal is requested and allows failed nodes to be removed', () => {
    const runId = 'image-run-0123456789abcdef0123456789abcdef'
    const placeholder = createFreeCanvasImageGenerationPlaceholder({
      runId,
      conversationId: 'conversation-1',
      prompt: 'A red apple',
      position: { x: 0, y: 0 },
      width: 320,
      height: 320
    })
    const running = createFreeCanvasProject(1, { nodes: [placeholder], selectedNodeId: placeholder.id })

    expect(removeFreeCanvasProjectNodes(running, [placeholder.id]).nodes).toHaveLength(1)

    const failed = failFreeCanvasImageGeneration(running, runId, 'rate_limited')
    expect(failed.nodes[0]).toMatchObject({ meta: { generationState: 'failed', generationErrorCode: 'rate_limited' } })
    expect(removeFreeCanvasProjectNodes(failed, [placeholder.id]).nodes).toHaveLength(0)
  })

  test('creates a generator bound to the current image.primary assignment', () => {
    const node = createFreeCanvasImageGeneratorNode(
      { x: 30, y: 40 },
      { connectionId: 'ark-primary', modelId: 'doubao-seedream-5-0-pro-260628' },
      100
    )

    expect(node).toMatchObject({
      id: 'free-image-generator-100', kind: 'image-generator', title: 'Image generator',
      position: { x: 30, y: 40 }, mode: 'generate',
      binding: { connectionId: 'ark-primary', modelId: 'doubao-seedream-5-0-pro-260628' },
      settings: { resolution: '1K', aspectRatio: 'smart', outputFormat: 'png', watermark: false },
      promptDocument: { version: 1, segments: [] }, regions: [], meta: { status: 'idle' }
    })
  })

  test('round-trips typed image generator nodes without losing persisted fields', () => {
    const generator = {
      id: 'generator-1',
      kind: 'image-generator',
      title: 'Seedream generator',
      position: { x: 120, y: 240 },
      width: 420,
      height: 560,
      mode: 'region-edit',
      binding: {
        connectionId: 'ark-connection',
        modelId: 'doubao-seedream-5-0-pro-260628'
      },
      settings: {
        resolution: '2K',
        aspectRatio: '1:1',
        outputFormat: 'png',
        watermark: true
      },
      promptDocument: {
        version: 1,
        segments: [
          { type: 'text', text: 'Change the background using ' },
          { type: 'reference', referenceId: 'reference-1', label: 'Product' }
        ]
      },
      regions: [
        { type: 'point', x: 120, y: 240 },
        { type: 'bbox', x: 100, y: 200, width: 300, height: 400 }
      ],
      activeRunId: 'run-1',
      primaryAssetId: 'asset-1',
      meta: { inspectorTab: 'regions' }
    }

    const project = createFreeCanvasProject(100, { nodes: [generator as never] })

    expect(project.nodes[0]).toEqual(generator)
  })

  test('normalizes malformed legacy image regions to safe integer grid geometry', () => {
    const project = createFreeCanvasProject(100, {
      nodes: [{
        id: 'legacy-region-generator',
        kind: 'image-generator',
        binding: { connectionId: 'connection-1', modelId: 'image-model-1' },
        regions: [
          { type: 'point', x: -4.6, y: 1_000.7 },
          { type: 'point', x: 'not-a-number', y: 20 },
          { type: 'bbox', x: 800.2, y: 900.4, width: -600.3, height: -800.3 },
          { type: 'bbox', x: 10, y: 20, width: 0, height: 30 },
          null
        ]
      } as never]
    })

    expect(project.nodes[0]).toMatchObject({
      regions: [
        { type: 'point', x: 0, y: 999 },
        { type: 'bbox', x: 200, y: 100, width: 600, height: 800 }
      ]
    })
  })

  test('round-trips aligned image region bindings when earlier malformed geometry is discarded', () => {
    const normalized = createFreeCanvasProject(100, {
      nodes: [{
        id: 'bound-region-generator',
        kind: 'image-generator',
        binding: { connectionId: 'connection-1', modelId: 'image-model-1' },
        regions: [
          { type: 'point', x: 'not-a-number', y: 20 },
          { type: 'bbox', x: 100, y: 200, width: 300, height: 400 }
        ],
        meta: {
          imageRegionBindings: [
            { regionId: 'region-bad', referenceId: 'reference-bad' },
            { regionId: 'region-good', referenceId: 'reference-good' }
          ]
        }
      } as never]
    })
    const project = createFreeCanvasProject(101, normalized)

    expect(project.nodes[0]).toMatchObject({
      regions: [{ type: 'bbox', x: 100, y: 200, width: 300, height: 400 }],
      meta: {
        imageRegionBindings: [{ regionId: 'region-good', referenceId: 'reference-good' }]
      }
    })
  })

  test('normalizes multiple discarded, missing, and extra region bindings without shifting identities', () => {
    const project = createFreeCanvasProject(100, {
      nodes: [{
        id: 'mixed-bound-region-generator',
        kind: 'image-generator',
        binding: { connectionId: 'connection-1', modelId: 'image-model-1' },
        regions: [
          { type: 'point', x: Number.NaN, y: 20 },
          { type: 'bbox', x: 100, y: 200, width: 300, height: 400 },
          { type: 'bbox', x: 10, y: 20, width: 0, height: 30 },
          { type: 'point', x: 500, y: 600 },
          { type: 'bbox', x: 700, y: 800, width: 50, height: 60 }
        ],
        meta: {
          imageRegionBindings: [
            { regionId: 'region-discarded-point', referenceId: 'reference-discarded-point' },
            { regionId: 'region-first', referenceId: 'reference-first' },
            { regionId: 'region-discarded-box', referenceId: 'reference-discarded-box' },
            null,
            { regionId: 'region-last', referenceId: 'reference-last' },
            { regionId: 'region-extra', referenceId: 'reference-extra' }
          ]
        }
      } as never]
    })

    expect(project.nodes[0]).toMatchObject({
      regions: [
        { type: 'bbox', x: 100, y: 200, width: 300, height: 400 },
        { type: 'point', x: 500, y: 600 },
        { type: 'bbox', x: 700, y: 800, width: 50, height: 60 }
      ],
      meta: {
        imageRegionBindings: [
          { regionId: 'region-first', referenceId: 'reference-first' },
          { regionId: 'region-1', referenceId: '' },
          { regionId: 'region-last', referenceId: 'reference-last' }
        ]
      }
    })
  })

  test('keeps legacy image regions without binding metadata safe', () => {
    const project = createFreeCanvasProject(100, {
      nodes: [{
        id: 'legacy-unbound-region-generator',
        kind: 'image-generator',
        binding: { connectionId: 'connection-1', modelId: 'image-model-1' },
        regions: [{ type: 'bbox', x: 100, y: 200, width: 300, height: 400 }],
        meta: { inspectorTab: 'regions' }
      } as never]
    })

    expect(project.nodes[0]).toMatchObject({
      regions: [{ type: 'bbox', x: 100, y: 200, width: 300, height: 400 }],
      meta: { inspectorTab: 'regions' }
    })
    expect(project.nodes[0].meta).not.toHaveProperty('imageRegionBindings')
  })

  test('round-trips typed image generator edge metadata', () => {
    const project = createFreeCanvasProject(100, {
      nodes: [
        {
          id: 'source-image',
          kind: 'image',
          title: 'Image',
          position: { x: 0, y: 0 },
          width: 300,
          height: 220,
          annotations: [],
          meta: {}
        },
        {
          id: 'generator-1',
          kind: 'image-generator',
          binding: { connectionId: 'connection-1', modelId: 'image-model-1' }
        } as never
      ],
      edges: [{
        id: 'reference-edge',
        source: 'source-image',
        target: 'generator-1',
        sourceHandle: 'image-output',
        targetHandle: 'reference-image',
        inputOrder: 0,
        referenceId: 'reference-1',
        label: 'Product',
        createdAt: 50
      }]
    })

    expect(project.edges[0]).toEqual({
      id: 'reference-edge',
      source: 'source-image',
      target: 'generator-1',
      sourceHandle: 'image-output',
      targetHandle: 'reference-image',
      inputOrder: 0,
      referenceId: 'reference-1',
      label: 'Product',
      createdAt: 50
    })
  })

  test('keeps legacy text, image, and arrow node payloads compatible', () => {
    const project = createFreeCanvasProject(100, {
      nodes: [
        {
          id: 'legacy-text',
          kind: 'text',
          title: 'Text',
          position: { x: 1, y: 2 },
          width: 300,
          height: 120,
          fontSize: 'medium',
          segments: [],
          meta: { legacy: true }
        },
        {
          id: 'legacy-image',
          kind: 'image',
          title: 'Image',
          position: { x: 3, y: 4 },
          width: 320,
          height: 240,
          assetId: 'asset-old',
          imageUrl: '/old.png',
          imagePrompt: 'old prompt',
          sourceNodeId: null,
          crop: null,
          annotations: [],
          meta: { legacy: true }
        },
        {
          id: 'legacy-arrow',
          kind: 'arrow',
          title: 'Arrow',
          position: { x: 5, y: 6 },
          width: 260,
          height: 120,
          text: 'Next',
          color: '#123456',
          meta: { legacy: true }
        }
      ]
    })

    expect(project.nodes.map(node => node.kind)).toEqual(['text', 'image', 'arrow'])
    expect(project.nodes[0]).toMatchObject({ id: 'legacy-text', fontSize: 'medium', meta: { legacy: true } })
    expect(project.nodes[1]).toMatchObject({ id: 'legacy-image', assetId: 'asset-old', imageUrl: '/old.png' })
    expect(project.nodes[2]).toMatchObject({ id: 'legacy-arrow', text: 'Next', color: '#123456' })
  })

  test('keeps malformed generator payloads as safe generator nodes with a validation warning', () => {
    const project = createFreeCanvasProject(100, {
      nodes: [{
        id: 'damaged-generator',
        kind: 'image-generator',
        binding: { connectionId: 42, modelId: null },
        meta: { imported: true }
      } as never]
    })

    expect(project.nodes[0]).toMatchObject({
      id: 'damaged-generator',
      kind: 'image-generator',
      mode: 'generate',
      binding: { connectionId: '', modelId: '' },
      settings: {
        resolution: '1K',
        aspectRatio: 'smart',
        outputFormat: 'png',
        watermark: false
      },
      promptDocument: { version: 1, segments: [] },
      regions: [],
      meta: {
        imported: true,
        validationWarnings: ['invalid_image_model_binding']
      }
    })
  })

  test('adds annotations to legacy image nodes that do not have annotations yet', () => {
    const image = createFreeCanvasImageNodeFromMedia(createFreeCanvasMediaNode('imageAsset', { x: 20, y: 40 }, 100), 101)
    const project = createFreeCanvasProject(100, { nodes: [{ ...image, annotations: undefined } as never] })

    const updated = addFreeCanvasImageAnnotation({
      ...project,
      nodes: project.nodes.map(node => node.kind === 'image' ? ({ ...node, annotations: undefined } as never) : node)
    }, image.id, 'rect', 102)

    if (updated.nodes[0].kind !== 'image') throw new Error('Expected image node')
    expect(updated.nodes[0].annotations).toEqual([
      expect.objectContaining({ kind: 'rect', fill: '#ffffff' })
    ])
  })

  test('adds, updates, and removes image annotations', () => {
    const image = createFreeCanvasImageNodeFromMedia(createFreeCanvasMediaNode('imageAsset', { x: 20, y: 40 }, 100), 101)
    const project = createFreeCanvasProject(100, { nodes: [image] })

    const withAnnotation = addFreeCanvasImageAnnotation(project, image.id, 'shotNumber', 102)
    const annotation = withAnnotation.nodes[0].kind === 'image' ? withAnnotation.nodes[0].annotations[0] : null
    if (!annotation) throw new Error('Expected image annotation')

    expect(annotation).toMatchObject({
      kind: 'shotNumber',
      text: '1',
      width: 0.065,
      height: 0.065,
      color: '#ffffff',
      fill: '#111827'
    })

    const updated = updateFreeCanvasImageAnnotation(withAnnotation, image.id, annotation.id, {
      x: 0.25,
      y: 0.2,
      text: '12'
    })

    if (updated.nodes[0].kind !== 'image') throw new Error('Expected image node')
    expect(updated.nodes[0].annotations[0]).toMatchObject({ x: 0.25, y: 0.2, text: '12' })

    const removed = removeFreeCanvasImageAnnotation(updated, image.id, annotation.id)

    if (removed.nodes[0].kind !== 'image') throw new Error('Expected image node')
    expect(removed.nodes[0].annotations).toEqual([])
  })

  test('bulk replaces image annotations for isolated editor saves', () => {
    const image = createFreeCanvasImageNodeFromMedia(createFreeCanvasMediaNode('imageAsset', { x: 20, y: 40 }, 100), 101)
    const project = createFreeCanvasProject(100, { nodes: [{ ...image, annotations: undefined } as never] })

    const updated = replaceFreeCanvasImageAnnotations(project, image.id, [{
      id: 'draft-rect',
      kind: 'rect',
      x: 0.2,
      y: 0.15,
      width: 0.3,
      height: 0.2,
      color: '#111827',
      fill: '#ffffff',
      createdAt: 101,
      updatedAt: 102,
      meta: {}
    }], 103)

    if (updated.nodes[0].kind !== 'image') throw new Error('Expected image node')
    expect(updated.nodes[0].annotations).toEqual([
      expect.objectContaining({ id: 'draft-rect', kind: 'rect', x: 0.2, y: 0.15, fill: '#ffffff' })
    ])
  })

  test('preserves arrow endpoints and freehand paths when saving image annotations', () => {
    const image = createFreeCanvasImageNodeFromMedia(createFreeCanvasMediaNode('imageAsset', { x: 20, y: 40 }, 100), 101)
    const project = createFreeCanvasProject(100, { nodes: [image] })

    const updated = replaceFreeCanvasImageAnnotations(project, image.id, [
      {
        id: 'draft-arrow',
        kind: 'arrow',
        x: 0.1,
        y: 0.2,
        width: 0.5,
        height: 0.3,
        color: '#ef4423',
        points: [{ x: 0.1, y: 0.2 }, { x: 0.6, y: 0.5 }],
        createdAt: 101,
        updatedAt: 102,
        meta: {}
      },
      {
        id: 'draft-freehand',
        kind: 'freehand',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        color: '#ef4423',
        strokeWidth: 4,
        points: [{ x: 0.2, y: 0.7 }, { x: 0.3, y: 0.65 }, { x: 0.4, y: 0.68 }],
        createdAt: 101,
        updatedAt: 102,
        meta: {}
      }
    ], 103)

    if (updated.nodes[0].kind !== 'image') throw new Error('Expected image node')
    expect(updated.nodes[0].annotations).toEqual([
      expect.objectContaining({
        id: 'draft-arrow',
        kind: 'arrow',
        points: [{ x: 0.1, y: 0.2 }, { x: 0.6, y: 0.5 }]
      }),
      expect.objectContaining({
        id: 'draft-freehand',
        kind: 'freehand',
        points: [{ x: 0.2, y: 0.7 }, { x: 0.3, y: 0.65 }, { x: 0.4, y: 0.68 }]
      })
    ])
  })

  test('resizes image nodes without changing normalized annotation placement', () => {
    const image = createFreeCanvasImageNodeFromMedia(createFreeCanvasMediaNode('imageAsset', { x: 20, y: 40 }, 100), 101)
    const project = addFreeCanvasImageAnnotation(createFreeCanvasProject(100, { nodes: [image] }), image.id, 'rect', 102)

    const resized = updateFreeCanvasImageNodeFrame(project, image.id, {
      position: { x: 80, y: 120 },
      width: 640,
      height: 360
    })

    if (resized.nodes[0].kind !== 'image') throw new Error('Expected image node')
    expect(resized.nodes[0]).toMatchObject({
      position: { x: 80, y: 120 },
      width: 640,
      height: 360
    })
    expect(resized.nodes[0].annotations[0]).toMatchObject({ x: 0.08, y: 0.08, width: 0.28, height: 0.18 })
  })

  test('creates quick text as red preset text and appends black user text', () => {
    const node = createQuickTextNode('Template message', { x: 20, y: 40 }, 100)
    const project = createFreeCanvasProject(100, { nodes: [node] })

    const updated = appendFreeCanvasUserText(project, node.id, 'User addition', 101)
    const textNode = updated.nodes[0]

    expect(textNode.kind).toBe('text')
    if (textNode.kind !== 'text') throw new Error('Expected text node')
    expect(textNode.segments).toEqual([
      expect.objectContaining({ source: 'preset', text: 'Template message', color: '#ef4423' }),
      expect.objectContaining({ source: 'user', text: 'User addition', color: '#111827' })
    ])
  })

  test('joins text node segments as visible plain text', () => {
    const node = createQuickTextNode('Template\nmessage', { x: 20, y: 40 }, 100)
    const project = appendFreeCanvasUserText(createFreeCanvasProject(100, { nodes: [node] }), node.id, '\nUser addition', 101)
    const textNode = project.nodes[0]

    if (textNode.kind !== 'text') throw new Error('Expected text node')
    expect(freeCanvasTextSegmentsToPlainText(textNode.segments)).toBe('Template\nmessage\nUser addition')
    expect(freeCanvasTextSegmentsToPlainText([])).toBe('')
  })

  test('agent-safe text updates only change user segments', () => {
    const node = createQuickTextNode('Locked template', { x: 20, y: 40 }, 100)
    const project = appendFreeCanvasUserText(createFreeCanvasProject(100, { nodes: [node] }), node.id, 'Draft', 101)

    const updated = updateFreeCanvasTextNodeUserText(project, node.id, 'Agent rewrite', 'replace', 102)

    if (updated.nodes[0].kind !== 'text') throw new Error('Expected text node')
    expect(updated.nodes[0].segments).toEqual([
      expect.objectContaining({ source: 'preset', text: 'Locked template' }),
      expect.objectContaining({ source: 'user', text: 'Agent rewrite' })
    ])
  })

  test('inserts black user text inside preset text and splits the preset segment', () => {
    const node = createQuickTextNode('Template', { x: 20, y: 40 }, 100)
    const project = createFreeCanvasProject(100, { nodes: [node] })

    const updated = replaceFreeCanvasTextRange(project, node.id, { start: 4, end: 4 }, ' user ', '#111827', 101)

    if (updated.nodes[0].kind !== 'text') throw new Error('Expected text node')
    expect(updated.nodes[0].segments).toEqual([
      expect.objectContaining({ source: 'preset', text: 'Temp', color: '#ef4423' }),
      expect.objectContaining({ source: 'user', text: ' user ', color: '#111827' }),
      expect.objectContaining({ source: 'preset', text: 'late', color: '#ef4423' })
    ])
  })

  test('manual range replacement can delete preset text', () => {
    const node = createQuickTextNode('Locked template', { x: 20, y: 40 }, 100)
    const project = createFreeCanvasProject(100, { nodes: [node] })

    const updated = replaceFreeCanvasTextRange(project, node.id, { start: 0, end: 7 }, '', '#111827', 101)

    if (updated.nodes[0].kind !== 'text') throw new Error('Expected text node')
    expect(updated.nodes[0].segments).toEqual([
      expect.objectContaining({ source: 'preset', text: 'template' })
    ])
  })

  test('manual range replacement merges adjacent user text', () => {
    const node = createQuickTextNode('Template', { x: 20, y: 40 }, 100)
    let project = createFreeCanvasProject(100, { nodes: [node] })
    project = replaceFreeCanvasTextRange(project, node.id, { start: 8, end: 8 }, ' one', '#111827', 101)

    const updated = replaceFreeCanvasTextRange(project, node.id, { start: 12, end: 12 }, ' two', '#111827', 102)

    if (updated.nodes[0].kind !== 'text') throw new Error('Expected text node')
    expect(updated.nodes[0].segments).toEqual([
      expect.objectContaining({ source: 'preset', text: 'Template' }),
      expect.objectContaining({ source: 'user', text: ' one two' })
    ])
  })

  test('text color style stores future user text color without changing preset text', () => {
    const node = createQuickTextNode('Template', { x: 20, y: 40 }, 100)
    const project = createFreeCanvasProject(100, { nodes: [node] })

    const updated = updateFreeCanvasTextNodeStyle(project, node.id, { color: '#3b82f6' })

    if (updated.nodes[0].kind !== 'text') throw new Error('Expected text node')
    expect(updated.nodes[0].meta.userTextColor).toBe('#3b82f6')
    expect(updated.nodes[0].segments).toEqual([
      expect.objectContaining({ source: 'preset', text: 'Template', color: '#ef4423' })
    ])
  })

  test('migrates legacy three-stage free canvas projects into text and media nodes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(500)
    let threeStage = createThreeStageProject(100)
    const graphNodeId = threeStageFormNodeId(threeStage.pages![0].items[0].form.id)
    threeStage = updateFreeCanvasNodePosition(threeStage, graphNodeId, { x: 321, y: 654 })
    const image = createFreeCanvasMediaNode('imageAsset', { x: 90, y: 120 }, 200)
    threeStage = addFreeCanvasMediaNode(threeStage, image)
    threeStage = addFreeCanvasEdge(threeStage, {
      id: 'edge-form-image',
      source: graphNodeId,
      target: mediaNodeFlowId(image.id)
    }, 300)

    const legacyProject: IPromptProject = {
      id: 'legacy-free-canvas',
      title: 'Legacy free canvas',
      type: 'three-stage',
      revision: 1,
      pages: [],
      currentPage: 0,
      threeStage,
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
      meta: { builderTemplateId: 'free-canvas' }
    }

    const migrated = migrateLegacyThreeStageFreeCanvasProject(legacyProject)

    expect(migrated.type).toBe('free-canvas')
    expect(migrated.threeStage).toBeUndefined()
    expect(migrated.freeCanvas?.nodes.some(node => node.kind === 'text' && node.position.x === 321 && node.position.y === 654)).toBe(true)
    expect(migrated.freeCanvas?.nodes.some(node => node.kind === 'image' && node.position.x === 90 && node.position.y === 120)).toBe(true)
    expect(migrated.freeCanvas?.edges).toHaveLength(1)
  })
})
