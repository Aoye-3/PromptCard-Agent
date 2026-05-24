import { describe, expect, it } from 'vitest'
import type { IPromptProject } from '@/models/PromptHistory.model'
import type { IPage } from '@/stores/card-initial-state'
import { buildCardWorkspaceContext, buildStoryboardWorkspaceContext } from './agent-workspace'

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
})
