import { describe, expect, test } from 'vitest'
import type { IPromptProject } from '@/models/PromptHistory.model'
import { mergeStoredProjectMetadata } from './project-storage-merge'

const createProject = (overrides: Partial<IPromptProject> = {}): IPromptProject => ({
  id: 'project-1',
  title: 'Local title',
  type: 'three-stage',
  revision: 1,
  pages: [],
  currentPage: 0,
  storyboard: {
    aspectRatio: '16:9',
    sequences: [],
    selectedSequenceId: null,
    selectedRowId: null,
    meta: {}
  },
  threeStage: {
    character: { fields: { notes: 'local character' }, focusedFieldId: null, updatedAt: 100, meta: {} },
    storyboard: { fields: { theme: 'local story' }, focusedFieldId: null, updatedAt: 100, meta: {} },
    videoPrompt: { fields: { prompt: 'local prompt' }, focusedFieldId: null, updatedAt: 100, meta: {} },
    selectedStage: 'character',
    selectedFieldId: 'notes',
    pages: [],
    selectedPageId: null,
    selectedFormId: null,
    selectedPairId: null,
    meta: {}
  },
  createdAt: 1,
  updatedAt: 100,
  lastOpenedAt: 100,
  meta: {},
  ...overrides
})

describe('project storage merge', () => {
  test('preserves local editable content when a stale save response returns later', () => {
    const localProject = createProject({
      threeStage: {
        ...createProject().threeStage!,
        storyboard: { fields: { theme: 'new user edit' }, focusedFieldId: null, updatedAt: 200, meta: {} }
      },
      updatedAt: 200
    })
    const staleStoredProject = createProject({
      revision: 2,
      threeStage: {
        ...createProject().threeStage!,
        storyboard: { fields: { theme: 'old saved value' }, focusedFieldId: null, updatedAt: 100, meta: {} }
      },
      updatedAt: 150,
      lastOpenedAt: 150
    })

    const [merged] = mergeStoredProjectMetadata([localProject], staleStoredProject)

    expect(merged.revision).toBe(2)
    expect(merged.updatedAt).toBe(200)
    expect(merged.lastOpenedAt).toBe(150)
    expect(merged.threeStage?.storyboard.fields.theme).toBe('new user edit')
  })

  test('can apply title-only metadata without replacing card pages', () => {
    const localProject = createProject({
      type: 'card',
      pages: [{ id: 'page-1', cards: [{ id: 'card-1', type: 'subject', title: 'Subject', content: 'local content', mode: 'edit', color: '#fff', createdAt: 1, updatedAt: 2, meta: {} }] }],
      currentPage: 0
    })
    const renamedStoredProject = createProject({
      title: 'Remote title',
      revision: 3,
      pages: [{ id: 'page-1', cards: [{ id: 'card-1', type: 'subject', title: 'Subject', content: 'old content', mode: 'edit', color: '#fff', createdAt: 1, updatedAt: 2, meta: {} }] }]
    })

    const [merged] = mergeStoredProjectMetadata([localProject], renamedStoredProject, { includeTitle: true })

    expect(merged.title).toBe('Remote title')
    expect(merged.revision).toBe(3)
    expect(merged.pages[0].cards[0].content).toBe('local content')
  })
})
