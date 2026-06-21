import { describe, expect, test, vi } from 'vitest'
import { createThreeStageProject } from '@/domain/projects/project-normalization'
import { updateFreeCanvasNodePosition, threeStageFormNodeId, createFreeCanvasMediaNode, addFreeCanvasMediaNode, addFreeCanvasEdge, mediaNodeFlowId } from './free-canvas'
import {
  appendFreeCanvasUserText,
  createFreeCanvasProject,
  createQuickTextNode,
  migrateLegacyThreeStageFreeCanvasProject,
  replaceFreeCanvasTextRange,
  removeFreeCanvasProjectNodes,
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
