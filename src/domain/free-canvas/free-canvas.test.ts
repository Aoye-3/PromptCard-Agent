import { describe, expect, test, vi } from 'vitest'
import { createThreeStageProject } from '@/domain/projects/project-normalization'
import {
  addFreeCanvasMediaNode,
  addFreeCanvasEdge,
  buildFreeCanvasGraph,
  createFreeCanvasMediaNode,
  getFreeCanvasConnectedChain,
  getFreeCanvasMeta,
  mediaNodeFlowId,
  removeFreeCanvasFlowNodes,
  removeFreeCanvasMediaNode,
  threeStageFormNodeId,
  updateFreeCanvasMediaNode,
  updateFreeCanvasNodePosition
} from './free-canvas'

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
