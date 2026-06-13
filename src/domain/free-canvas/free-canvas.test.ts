import { describe, expect, test, vi } from 'vitest'
import { createThreeStageProject } from '@/domain/projects/project-normalization'
import {
  addFreeCanvasMediaNode,
  addFreeCanvasEdge,
  buildFreeCanvasFormOutput,
  buildFreeCanvasGraph,
  buildFreeCanvasCropGrid,
  createFreeCanvasCroppedNodes,
  duplicateFreeCanvasMediaNode,
  createFreeCanvasMediaNode,
  getFreeCanvasConnectedChain,
  getFormFixedContentOverrides,
  getFreeCanvasMeta,
  mediaNodeFlowId,
  normalizeFreeCanvasCropLines,
  removeFreeCanvasNodes,
  removeFreeCanvasFlowNodes,
  removeFreeCanvasMediaNode,
  threeStageFormNodeId,
  updateFreeCanvasMediaNode,
  updateFreeCanvasNodePosition,
  updateFreeCanvasFormFixedContent
} from './free-canvas'
import { addObjectFormToPage, addStoryVideoPairToPage, normalizeThreeStagePages } from '@/domain/three-stage/three-stage-pages'

describe('free canvas domain', () => {
  test('projects three-stage forms into canvas nodes and bound pair edges', () => {
    const threeStage = createThreeStageProject(100)
    const graph = buildFreeCanvasGraph(threeStage)

    expect(graph.nodes.map(node => node.data.nodeKind)).toEqual([
      'threeStageForm',
      'threeStageForm',
      'threeStageForm'
    ])
    expect(graph.nodes.map(node => node.data.formType)).toEqual(['character', 'storyboard', 'videoPrompt'])
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0].source).toContain('storyboard')
    expect(graph.edges[0].target).toContain('videoPrompt')
  })

  test('persists form node positions in form canvas meta', () => {
    const threeStage = createThreeStageProject(100)
    const form = threeStage.pages![0].items[0].kind === 'character'
      ? threeStage.pages![0].items[0].form
      : threeStage.pages![0].items[0].storyboardForm
    const nodeId = threeStageFormNodeId(form.id)

    const updated = updateFreeCanvasNodePosition(threeStage, nodeId, { x: 321, y: 654 })
    const graph = buildFreeCanvasGraph(updated)

    expect(graph.nodes.find(node => node.id === nodeId)?.position).toEqual({ x: 321, y: 654 })
  })

  test('creates updates and removes serializable media nodes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(500)
    const threeStage = createThreeStageProject(100)
    const node = createFreeCanvasMediaNode('imageAsset', { x: 20, y: 40 })
    const withNode = addFreeCanvasMediaNode(threeStage, node)
    const updated = updateFreeCanvasMediaNode(withNode, node.id, {
      imageUrl: 'https://example.test/image.png',
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 }
    })
    const removed = removeFreeCanvasMediaNode(updated, node.id)

    expect(getFreeCanvasMeta(withNode).mediaNodes[0]).toMatchObject({
      id: node.id,
      kind: 'imageAsset',
      position: { x: 20, y: 40 }
    })
    expect(getFreeCanvasMeta(updated).mediaNodes[0].crop).toEqual({ x: 0.1, y: 0.2, width: 0.5, height: 0.6 })
    expect(getFreeCanvasMeta(removed).mediaNodes).toEqual([])
  })

  test('normalizes crop lines into sorted unique interior positions', () => {
    expect(normalizeFreeCanvasCropLines([0.75, -1, 0.5, 0.501, 1, 0.02, Number.NaN])).toEqual([
      0.02,
      0.5,
      0.75
    ])
  })

  test('builds crop regions from left to right and top to bottom', () => {
    const regions = buildFreeCanvasCropGrid({ horizontal: [0.25, 0.5, 0.75], vertical: [1 / 3, 2 / 3] })

    expect(regions).toHaveLength(12)
    expect(regions[0]).toEqual({ x: 0, y: 0, width: 1 / 3, height: 0.25, row: 0, column: 0 })
    expect(regions[1]).toMatchObject({ row: 0, column: 1 })
    expect(regions[3]).toMatchObject({ row: 1, column: 0 })
    expect(regions[11]).toMatchObject({ row: 3, column: 2 })
  })

  test('creates non-destructive cropped nodes in the source grid layout', () => {
    const source = {
      ...createFreeCanvasMediaNode('imageAsset', { x: 100, y: 80 }, 700),
      assetId: 'asset-1',
      width: 300,
      height: 240
    }
    const nodes = createFreeCanvasCroppedNodes(source, { horizontal: [0.5], vertical: [0.5] }, 800)

    expect(nodes).toHaveLength(4)
    expect(nodes.map(node => node.assetId)).toEqual(['asset-1', 'asset-1', 'asset-1', 'asset-1'])
    expect(nodes.map(node => node.sourceNodeId)).toEqual([source.id, source.id, source.id, source.id])
    expect(nodes.map(node => node.crop)).toEqual([
      { x: 0, y: 0, width: 0.5, height: 0.5 },
      { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      { x: 0, y: 0.5, width: 0.5, height: 0.5 },
      { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }
    ])
    expect(nodes.map(node => node.position)).toEqual([
      { x: 440, y: 80 },
      { x: 600, y: 80 },
      { x: 440, y: 210 },
      { x: 600, y: 210 }
    ])
  })

  test('preserves unequal crop region proportions and grid offsets', () => {
    const source = {
      ...createFreeCanvasMediaNode('imageAsset', { x: 10, y: 20 }, 900),
      assetId: 'asset-2',
      width: 400,
      height: 300
    }
    const nodes = createFreeCanvasCroppedNodes(source, { horizontal: [0.25], vertical: [0.75] }, 901)

    expect(nodes.map(node => ({ width: node.width, height: node.height, position: node.position }))).toEqual([
      { width: 300, height: 75, position: { x: 450, y: 20 } },
      { width: 100, height: 75, position: { x: 760, y: 20 } },
      { width: 300, height: 225, position: { x: 450, y: 105 } },
      { width: 100, height: 225, position: { x: 760, y: 105 } }
    ])
  })

  test('duplicates a media node with a new id and offset while sharing its asset', () => {
    const source = {
      ...createFreeCanvasMediaNode('imageAsset', { x: 40, y: 60 }, 1000),
      assetId: 'asset-copy.png',
      crop: { x: 0.25, y: 0, width: 0.5, height: 1 }
    }

    const copy = duplicateFreeCanvasMediaNode(source, 1100)

    expect(copy.id).not.toBe(source.id)
    expect(copy.position).toEqual({ x: 68, y: 88 })
    expect(copy.assetId).toBe(source.assetId)
    expect(copy.crop).toEqual(source.crop)
    expect(copy.title).toBe(`${source.title} 副本`)
  })

  test('projects an object board as an independent canvas form node', () => {
    const threeStage = createThreeStageProject(100)
    const pageId = normalizeThreeStagePages(threeStage)[0].id
    const withObject = addObjectFormToPage(threeStage, pageId)
    const objectNode = buildFreeCanvasGraph(withObject).nodes.find(node => node.data.formType === 'object')

    expect(objectNode?.data.title).toBe('物品版 #1')
    expect(objectNode?.data.subtitle).toBe('物品版节点')
    expect(objectNode?.data.pairId).toBeNull()
  })

  test('removes deleted media flow nodes and their user edges from canvas meta', () => {
    const image = createFreeCanvasMediaNode('imageAsset', { x: 20, y: 40 }, 800)
    const text = createFreeCanvasMediaNode('textOverlay', { x: 60, y: 80 }, 801)
    let threeStage = addFreeCanvasMediaNode(createThreeStageProject(100), image)
    threeStage = addFreeCanvasMediaNode(threeStage, text)
    threeStage = addFreeCanvasEdge(threeStage, {
      id: 'edge-image-text',
      source: mediaNodeFlowId(image.id),
      target: mediaNodeFlowId(text.id)
    }, 900)

    const updated = removeFreeCanvasFlowNodes(threeStage, [mediaNodeFlowId(text.id)])

    expect(getFreeCanvasMeta(updated).mediaNodes.map(node => node.id)).toEqual([image.id])
    expect(getFreeCanvasMeta(updated).edges).toEqual([])
  })

  test('removes user edges for deleted three-stage form nodes', () => {
    const threeStage = createThreeStageProject(100)
    const graph = buildFreeCanvasGraph(threeStage)
    const withEdge = addFreeCanvasEdge(threeStage, {
      id: 'edge-character-story',
      source: graph.nodes[0].id,
      target: graph.nodes[1].id
    }, 900)

    const updated = removeFreeCanvasFlowNodes(withEdge, [graph.nodes[0].id])

    expect(getFreeCanvasMeta(updated).mediaNodes).toEqual([])
    expect(getFreeCanvasMeta(updated).edges).toEqual([])
  })

  test('atomically removes standalone forms and their user edges from the source model', () => {
    const base = createThreeStageProject(100)
    const pageId = normalizeThreeStagePages(base)[0].id
    const withObject = addObjectFormToPage(base, pageId)
    const graph = buildFreeCanvasGraph(withObject)
    const objectNode = graph.nodes.find(node => node.data.formType === 'object')!
    const withEdge = addFreeCanvasEdge(withObject, {
      id: 'edge-object-story',
      source: objectNode.id,
      target: graph.nodes.find(node => node.data.formType === 'storyboard')!.id
    }, 900)

    const result = removeFreeCanvasNodes(withEdge, [objectNode.id])
    const remainingForms = normalizeThreeStagePages(result.threeStage).flatMap(page => page.items)

    expect(result.blockedReason).toBeNull()
    expect(result.removedNodeIds).toEqual([objectNode.id])
    expect(remainingForms.some(item => item.kind === 'character' && item.form.type === 'object')).toBe(false)
    expect(getFreeCanvasMeta(result.threeStage).edges).toEqual([])
  })

  test('keeps the selected form when deleting a different standalone form', () => {
    const base = createThreeStageProject(100)
    const page = normalizeThreeStagePages(base)[0]
    const withObject = addObjectFormToPage(base, page.id)
    const selected = normalizeThreeStagePages(withObject)[0].items.find(item => item.kind === 'storyVideoPair')
    if (!selected || selected.kind !== 'storyVideoPair') throw new Error('Expected story pair')
    const selectedProject = { ...withObject, selectedFormId: selected.storyboardForm.id }
    const objectNode = buildFreeCanvasGraph(selectedProject).nodes.find(node => node.data.formType === 'object')!

    const result = removeFreeCanvasNodes(selectedProject, [objectNode.id])

    expect(result.threeStage.selectedFormId).toBe(selected.storyboardForm.id)
  })

  test('removes a whole story video pair when either bound node is deleted', () => {
    const base = createThreeStageProject(100)
    const pageId = normalizeThreeStagePages(base)[0].id
    const withSecondPair = addStoryVideoPairToPage(base, pageId)
    const graph = buildFreeCanvasGraph(withSecondPair)
    const secondPair = normalizeThreeStagePages(withSecondPair)[0].items.filter(item => item.kind === 'storyVideoPair')[1]
    if (!secondPair || secondPair.kind !== 'storyVideoPair') throw new Error('Expected second pair')
    const pairNodes = graph.nodes.filter(node => node.data.pairId === secondPair.pairId)
    const result = removeFreeCanvasNodes(withSecondPair, [pairNodes[0].id])

    expect(result.blockedReason).toBeNull()
    expect(result.removedNodeIds).toEqual(expect.arrayContaining(pairNodes.map(node => node.id)))
    expect(normalizeThreeStagePages(result.threeStage)[0].items.filter(item => item.kind === 'storyVideoPair')).toHaveLength(1)
  })

  test('atomically blocks a multi-node deletion that would empty a page', () => {
    const base = createThreeStageProject(100)
    const graph = buildFreeCanvasGraph(base)

    const result = removeFreeCanvasNodes(base, graph.nodes.map(node => node.id))

    expect(result.blockedReason).toBe('每页至少保留一个表单。')
    expect(result.removedNodeIds).toEqual([])
    expect(buildFreeCanvasGraph(result.threeStage).nodes).toHaveLength(3)
  })

  test('removes media and form nodes together and clears every related user edge', () => {
    const media = createFreeCanvasMediaNode('imageAsset', { x: 20, y: 40 }, 800)
    let threeStage = addFreeCanvasMediaNode(createThreeStageProject(100), media)
    const graph = buildFreeCanvasGraph(threeStage)
    const characterNode = graph.nodes.find(node => node.data.formType === 'character')!
    const storyNode = graph.nodes.find(node => node.data.formType === 'storyboard')!
    threeStage = addFreeCanvasEdge(threeStage, { id: 'edge-media-character', source: mediaNodeFlowId(media.id), target: characterNode.id }, 801)
    threeStage = addFreeCanvasEdge(threeStage, { id: 'edge-character-story', source: characterNode.id, target: storyNode.id }, 802)

    const result = removeFreeCanvasNodes(threeStage, [mediaNodeFlowId(media.id), characterNode.id])

    expect(result.blockedReason).toBeNull()
    expect(getFreeCanvasMeta(result.threeStage).mediaNodes).toEqual([])
    expect(getFreeCanvasMeta(result.threeStage).edges).toEqual([])
    expect(buildFreeCanvasGraph(result.threeStage).nodes.some(node => node.id === characterNode.id)).toBe(false)
  })

  test('projects media nodes into React Flow nodes', () => {
    const threeStage = addFreeCanvasMediaNode(
      createThreeStageProject(100),
      {
        ...createFreeCanvasMediaNode('textOverlay', { x: 90, y: 120 }, 600),
        text: 'Hello canvas'
      }
    )
    const graph = buildFreeCanvasGraph(threeStage)
    const mediaNode = graph.nodes.find(node => node.id.startsWith('media:'))

    expect(mediaNode?.type).toBe('freeCanvasMedia')
    expect(mediaNode?.position).toEqual({ x: 90, y: 120 })
    expect(mediaNode?.data.nodeKind).toBe('textOverlay')
    expect(mediaNode?.data.subtitle).toBe('Hello canvas')
  })

  test('persists user-created edges alongside fixed pair edges', () => {
    const threeStage = createThreeStageProject(100)
    const graph = buildFreeCanvasGraph(threeStage)
    const updated = addFreeCanvasEdge(threeStage, {
      id: 'edge-character-story',
      source: graph.nodes[0].id,
      target: graph.nodes[1].id,
      label: 'context chain'
    }, 700)
    const updatedGraph = buildFreeCanvasGraph(updated)

    expect(getFreeCanvasMeta(updated).edges).toEqual([{
      id: 'edge-character-story',
      source: graph.nodes[0].id,
      target: graph.nodes[1].id,
      label: 'context chain',
      createdAt: 700
    }])
    expect(updatedGraph.edges.map(edge => edge.id)).toContain('three-stage-pair:100-pair-1')
    expect(updatedGraph.edges.map(edge => edge.id)).toContain('edge-character-story')
  })

  test('persists unlock, custom value, relock, and reset on one form only', () => {
    const threeStage = createThreeStageProject(100)
    const item = normalizeThreeStagePages(threeStage)[0].items[0]
    if (item.kind !== 'character') throw new Error('Expected character form')

    const unlocked = updateFreeCanvasFormFixedContent(threeStage, item.form.id, 'character-reference', {
      value: 'Custom reference',
      unlocked: true
    })
    const relocked = updateFreeCanvasFormFixedContent(unlocked, item.form.id, 'character-reference', { unlocked: false })
    const relockedItem = normalizeThreeStagePages(relocked)[0].items[0]
    if (relockedItem.kind !== 'character') throw new Error('Expected character form')
    const reset = updateFreeCanvasFormFixedContent(relocked, item.form.id, 'character-reference', null)
    const resetItem = normalizeThreeStagePages(reset)[0].items[0]
    if (resetItem.kind !== 'character') throw new Error('Expected character form')

    expect(getFormFixedContentOverrides(relockedItem.form)['character-reference']).toEqual({
      value: 'Custom reference',
      unlocked: false
    })
    expect(buildFreeCanvasFormOutput(relockedItem.form)).toContain('Custom reference')
    expect(getFormFixedContentOverrides(resetItem.form)).toEqual({})
  })

  test('filters malformed fixed content stored on a canvas form', () => {
    const threeStage = createThreeStageProject(100)
    const item = normalizeThreeStagePages(threeStage)[0].items[0]
    if (item.kind !== 'character') throw new Error('Expected character form')
    const form = {
      ...item.form,
      meta: {
        ...item.form.meta,
        canvas: {
          fixedContent: {
            'character-reference': { value: 3, unlocked: true },
            unknown: { value: 'bad', unlocked: false }
          }
        }
      }
    }

    expect(getFormFixedContentOverrides(form)).toEqual({})
  })

  test('new forms do not inherit fixed content overrides from their source', () => {
    const threeStage = createThreeStageProject(100)
    const pair = normalizeThreeStagePages(threeStage)[0].items.find(item => item.kind === 'storyVideoPair')
    if (!pair || pair.kind !== 'storyVideoPair') throw new Error('Expected story/video pair')
    const customized = updateFreeCanvasFormFixedContent(threeStage, pair.videoPromptForm.id, 'duration', {
      value: 'Custom duration',
      unlocked: false
    })
    const pageId = normalizeThreeStagePages(customized)[0].id
    const next = addStoryVideoPairToPage(customized, pageId, pair.pairId)
    const pairs = normalizeThreeStagePages(next)[0].items.filter(item => item.kind === 'storyVideoPair')
    const newPair = pairs[1]
    if (!newPair || newPair.kind !== 'storyVideoPair') throw new Error('Expected copied pair')

    expect(getFormFixedContentOverrides(newPair.videoPromptForm)).toEqual({})
  })

  test('collects the full connected chain for a selected edge', () => {
    const image = createFreeCanvasMediaNode('imageAsset', { x: 20, y: 40 }, 800)
    let threeStage = addFreeCanvasMediaNode(createThreeStageProject(100), image)
    let graph = buildFreeCanvasGraph(threeStage)
    threeStage = addFreeCanvasEdge(threeStage, { id: 'edge-character-story', source: graph.nodes[0].id, target: graph.nodes[1].id }, 801)
    threeStage = addFreeCanvasEdge(threeStage, { id: 'edge-image-character', source: mediaNodeFlowId(image.id), target: graph.nodes[0].id }, 802)
    graph = buildFreeCanvasGraph(threeStage)

    const chain = getFreeCanvasConnectedChain(graph, 'edge-character-story')

    expect(chain.nodeIds).toEqual(expect.arrayContaining([graph.nodes[0].id, graph.nodes[1].id, graph.nodes[2].id, mediaNodeFlowId(image.id)]))
    expect(chain.edges.map(edge => edge.id)).toEqual(expect.arrayContaining(['edge-character-story', 'edge-image-character', 'three-stage-pair:100-pair-1']))
  })
})
