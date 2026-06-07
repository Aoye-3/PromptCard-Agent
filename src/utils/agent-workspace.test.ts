import { describe, expect, it } from 'vitest'
import type { IPromptProject } from '@/models/PromptHistory.model'
import type { IPage } from '@/stores/card-initial-state'
import { buildCardWorkspaceContext, buildStoryboardWorkspaceContext, buildThreeStageWorkspaceContext } from './agent-workspace'

describe('agent workspace context', () => {
  it('builds a bounded card workspace snapshot', () => {
    const pages: IPage[] = [{
      id: 'page-1',
      cards: [{
        id: 'card-1',
        type: 'subject',
        title: 'Subject',
        content: 'A'.repeat(1400),
        mode: 'edit',
        color: 'blue',
        createdAt: 1,
        updatedAt: 1,
        meta: {}
      }]
    }]
    const project: IPromptProject = {
      id: 'project-1',
      title: 'Card project',
      type: 'card',
      revision: 1,
      pages,
      currentPage: 0,
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
      meta: {}
    }

    const context = buildCardWorkspaceContext({
      activeProject: project,
      pages,
      currentPage: 0,
      currentPrompt: 'Prompt text',
      selectedCardIds: ['card-1']
    })

    expect(context.contextId).toBe('card:project-1:0')
    expect(context.mode).toBe('card-workspace')
    expect(context.snapshot.selectedCardIds).toEqual(['card-1'])
    expect(JSON.stringify(context.snapshot)).toContain('card-1')
    expect(JSON.stringify(context.snapshot)).toContain('...')
  })

  it('builds a storyboard workspace snapshot with selected sequence and row', () => {
    const project: IPromptProject = {
      id: 'project-2',
      title: 'Storyboard project',
      type: 'storyboard',
      revision: 1,
      pages: [],
      currentPage: 0,
      storyboard: {
        aspectRatio: '16:9',
        selectedSequenceId: 'sequence-1',
        selectedRowId: 'row-1',
        meta: {},
        sequences: [{
          id: 'sequence-1',
          name: 'Opening',
          description: 'Intro',
          style: 'Cinematic',
          constraints: 'No subtitles',
          createdAt: 1,
          updatedAt: 1,
          meta: {},
          rows: [{
            id: 'row-1',
            cutLabel: 'Cut 1',
            timeRange: '00:00-00:04',
            subject: 'Hero',
            action: 'Walks',
            scene: 'Street',
            camera: 'Wide',
            lighting: 'Soft',
            audio: 'Rain',
            duration: '4s',
            createdAt: 1,
            updatedAt: 1
          }]
        }]
      },
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
      meta: {}
    }

    const context = buildStoryboardWorkspaceContext({
      activeProject: project,
      storyboard: project.storyboard!
    })

    expect(context.contextId).toBe('storyboard:project-2:sequence-1:row-1')
    expect(context.mode).toBe('storyboard-workspace')
    expect(context.snapshot.selectedRowId).toBe('row-1')
    expect(JSON.stringify(context.snapshot)).toContain('Hero')
  })

  it('builds a three-stage workspace snapshot for the selected field', () => {
    const project: IPromptProject = {
      id: 'project-3',
      title: 'Three stage project',
      type: 'three-stage',
      revision: 1,
      pages: [],
      currentPage: 0,
      threeStage: {
        selectedStage: 'character',
        selectedFieldId: 'characterNotes',
        character: {
          fields: { characterNotes: 'A precise character description' },
          focusedFieldId: 'characterNotes',
          updatedAt: 1,
          meta: {}
        },
        storyboard: {
          fields: { storyTheme: 'A calm morning' },
          focusedFieldId: 'storyTheme',
          updatedAt: 1,
          meta: {}
        },
        videoPrompt: {
          fields: { finalPrompt: 'Final generated prompt' },
          focusedFieldId: 'finalPrompt',
          updatedAt: 1,
          meta: {}
        },
        meta: {}
      },
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
      meta: {}
    }

    const context = buildThreeStageWorkspaceContext({
      activeProject: project,
      threeStage: project.threeStage!,
      selectedOutput: 'Selected stage output'
    })

    expect(context.contextId).toContain('three-stage:project-3:')
    expect(context.mode).toBe('three-stage-workspace')
    expect(context.snapshot.selectedStage).toBe('character')
    expect(context.snapshot.selectedFieldId).toBe('characterNotes')
    expect(context.snapshot.selectedPageId).toBeTruthy()
    expect(context.snapshot.selectedFormId).toBeTruthy()
    expect(context.snapshot.selectedPairId).toBe(null)
    expect(Array.isArray(context.snapshot.pages)).toBe(true)
    expect(JSON.stringify(context.snapshot)).toContain('Selected stage output')
  })

  it('adds free-canvas selected node and media context to three-stage snapshots', () => {
    const project: IPromptProject = {
      id: 'project-4',
      title: 'Free canvas project',
      type: 'three-stage',
      revision: 1,
      pages: [],
      currentPage: 0,
      threeStage: {
        selectedStage: 'character',
        selectedFieldId: 'characterNotes',
        character: {
          fields: { characterNotes: 'Canvas character' },
          focusedFieldId: 'characterNotes',
          updatedAt: 1,
          meta: {}
        },
        storyboard: {
          fields: {},
          focusedFieldId: null,
          updatedAt: 1,
          meta: {}
        },
        videoPrompt: {
          fields: {},
          focusedFieldId: null,
          updatedAt: 1,
          meta: {}
        },
        meta: {}
      },
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
      meta: { builderTemplateId: 'free-canvas' }
    }

    const context = buildThreeStageWorkspaceContext({
      activeProject: project,
      threeStage: project.threeStage!,
      selectedOutput: 'Canvas output',
      freeCanvas: {
        selectedNodeId: 'media:image-1',
        selectedNodeType: 'imageAsset',
        selectedMediaAssetId: 'asset-1',
        nodes: [{ id: 'media:image-1', kind: 'imageAsset', title: 'Image node', mediaAssetId: 'asset-1' }]
      }
    })

    expect(context.snapshot.freeCanvas).toMatchObject({
      selectedNodeId: 'media:image-1',
      selectedNodeType: 'imageAsset',
      selectedMediaAssetId: 'asset-1'
    })
    expect(JSON.stringify(context.snapshot.freeCanvas)).toContain('Image node')
  })

  it('adds free-canvas selected chain context to three-stage snapshots', () => {
    const project: IPromptProject = {
      id: 'project-5',
      title: 'Free canvas chain project',
      type: 'three-stage',
      revision: 1,
      pages: [],
      currentPage: 0,
      threeStage: {
        selectedStage: 'storyboard',
        selectedFieldId: 'theme',
        character: {
          fields: { characterNotes: 'A lone pilot' },
          focusedFieldId: 'characterNotes',
          updatedAt: 1,
          meta: {}
        },
        storyboard: {
          fields: { theme: 'A launch sequence' },
          focusedFieldId: 'theme',
          updatedAt: 1,
          meta: {}
        },
        videoPrompt: {
          fields: { actionSnapshot: 'Rocket rises through fog' },
          focusedFieldId: 'actionSnapshot',
          updatedAt: 1,
          meta: {}
        },
        meta: {}
      },
      createdAt: 1,
      updatedAt: 1,
      lastOpenedAt: 1,
      meta: { builderTemplateId: 'free-canvas' }
    }

    const context = buildThreeStageWorkspaceContext({
      activeProject: project,
      threeStage: project.threeStage!,
      selectedOutput: 'Storyboard output',
      freeCanvas: {
        selectedEdgeId: 'edge-chain',
        selectedChainNodeIds: ['character-node', 'storyboard-node', 'prompt-node', 'text-node'],
        nodes: [],
        selectedChainNodes: [
          { id: 'character-node', kind: 'threeStageForm', title: '人物版 #1', formType: 'character', output: 'A lone pilot' },
          { id: 'storyboard-node', kind: 'threeStageForm', title: '故事版 #1', formType: 'storyboard', output: 'A launch sequence' },
          { id: 'prompt-node', kind: 'threeStageForm', title: '提示词版 #1', formType: 'videoPrompt', output: 'Rocket rises through fog' },
          { id: 'text-node', kind: 'textOverlay', title: '文字标注', text: 'Use dusk lighting' }
        ],
        selectedChainEdges: [{ id: 'edge-chain', source: 'character-node', target: 'storyboard-node', label: 'context' }]
      }
    })

    expect(context.snapshot.freeCanvas).toMatchObject({
      selectedEdgeId: 'edge-chain',
      selectedChainNodeIds: ['character-node', 'storyboard-node', 'prompt-node', 'text-node']
    })
    expect(JSON.stringify(context.snapshot.freeCanvas)).toContain('A lone pilot')
    expect(JSON.stringify(context.snapshot.freeCanvas)).toContain('Rocket rises through fog')
    expect(JSON.stringify(context.snapshot.freeCanvas)).toContain('Use dusk lighting')
  })
})
