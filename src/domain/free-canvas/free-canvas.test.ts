import { describe, expect, test, vi } from 'vitest'
import { createThreeStageProject } from '@/domain/projects/project-normalization'
import {
  addFreeCanvasMediaNode,
  buildFreeCanvasGraph,
  createFreeCanvasMediaNode,
  getFreeCanvasMeta,
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
})
