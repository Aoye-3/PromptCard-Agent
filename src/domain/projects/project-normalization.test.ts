import { describe, expect, test, vi } from 'vitest'
import type { IPromptProject } from '@/models/PromptHistory.model'
import { mergeProjects, normalizeProject } from './project-normalization'

describe('project normalization', () => {
  test('defaults legacy projects to card projects with normalized pages', () => {
    const project = normalizeProject({
      id: 'legacy',
      title: 'Legacy',
      pages: [{ id: 'page-1', cards: undefined as never }],
      currentPage: undefined as never,
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
      meta: undefined as never
    } as unknown as IPromptProject)

    expect(project.type).toBe('card')
    expect(project.currentPage).toBe(0)
    expect(project.pages).toEqual([{ id: 'page-1', cards: [] }])
    expect(project.meta).toEqual({})
  })

  test('creates missing three-stage payloads for three-stage projects', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)

    const project = normalizeProject({
      id: 'three-stage',
      title: 'Three Stage',
      type: 'three-stage',
      revision: 1,
      pages: [],
      currentPage: 0,
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
      meta: {}
    } as IPromptProject)

    expect(project.threeStage?.pages).toHaveLength(1)
    expect(project.threeStage?.pages?.[0].items.map(item => item.kind)).toEqual(['character', 'storyVideoPair'])
    expect(project.threeStage?.selectedStage).toBe('character')
    expect(project.threeStage?.selectedFieldId).toBe('characterNotes')
  })

  test('merges duplicate browser and file projects by newer updatedAt and sorts by activity', () => {
    const merged = mergeProjects(
      [
        {
          id: 'same',
          title: 'Browser newer',
          type: 'card',
          revision: 1,
          pages: [],
          currentPage: 0,
          createdAt: 1,
          updatedAt: 5,
          lastOpenedAt: 10,
          meta: {}
        }
      ],
      [
        {
          id: 'same',
          title: 'File older',
          type: 'card',
          revision: 1,
          pages: [],
          currentPage: 0,
          createdAt: 1,
          updatedAt: 4,
          lastOpenedAt: 99,
          meta: {}
        },
        {
          id: 'file-only',
          title: 'File only',
          type: 'card',
          revision: 1,
          pages: [],
          currentPage: 0,
          createdAt: 1,
          updatedAt: 6,
          lastOpenedAt: 20,
          meta: {}
        }
      ]
    )

    expect(merged.map(project => project.id)).toEqual(['file-only', 'same'])
    expect(merged.find(project => project.id === 'same')?.title).toBe('Browser newer')
  })
})
