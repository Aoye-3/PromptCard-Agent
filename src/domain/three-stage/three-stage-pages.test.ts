import { afterEach, describe, expect, test, vi } from 'vitest'
import { buildThreeStageOutput } from './three-stage-definitions'
import {
  addObjectFormToPage,
  addThreeStagePage,
  addStoryVideoPairToPage,
  duplicateThreeStagePage,
  getSelectedThreeStageFormContext,
  normalizeThreeStagePages,
  removeThreeStagePage,
  removeThreeStageItem,
  selectThreeStageForm,
  syncThreeStageLegacyFields
} from './three-stage-pages'
import type { IThreeStageProject, IThreeStageStoryVideoPairItem } from '@/models/PromptHistory.model'
import type { IThreeStageCharacterItem } from '@/models/PromptHistory.model'

const legacyProject = (): IThreeStageProject => ({
  selectedStage: 'character',
  selectedFieldId: 'characterNotes',
  character: {
    fields: { characterNotes: 'Hero A' },
    focusedFieldId: 'characterNotes',
    updatedAt: 1,
    meta: {}
  },
  storyboard: {
    fields: { theme: 'Storyboard A', storyMotion: 'Motion A' },
    focusedFieldId: 'theme',
    updatedAt: 1,
    meta: {}
  },
  videoPrompt: {
    fields: { actionSnapshot: 'Video A' },
    focusedFieldId: 'actionSnapshot',
    updatedAt: 1,
    meta: {}
  },
  meta: {}
})

const pairsOf = (threeStage: IThreeStageProject): IThreeStageStoryVideoPairItem[] =>
  normalizeThreeStagePages(threeStage)
    .flatMap(page => page.items)
    .filter((item): item is IThreeStageStoryVideoPairItem => item.kind === 'storyVideoPair')

describe('three-stage pages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('migrates legacy sections into page 1 with one character and one bound pair', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)

    const pages = normalizeThreeStagePages(legacyProject(), 100)

    expect(pages).toHaveLength(1)
    expect(pages[0].items.map(item => item.kind)).toEqual(['character', 'storyVideoPair'])
    const pair = pages[0].items[1] as IThreeStageStoryVideoPairItem
    expect(pair.storyboardForm.number).toBe(1)
    expect(pair.videoPromptForm.number).toBe(1)
    expect(pair.storyboardForm.section.fields.theme).toBe('Storyboard A')
    expect(pair.videoPromptForm.section.fields.actionSnapshot).toBe('Video A')
  })

  test('repairs a first page that only contains a character item', () => {
    const [page] = normalizeThreeStagePages(legacyProject(), 100)
    const repaired = normalizeThreeStagePages({
      ...legacyProject(),
      pages: [{ ...page, items: [page.items[0]] }]
    }, 200)

    expect(repaired[0].items.map(item => item.kind)).toEqual(['character'])
  })

  test('duplicates a page with a new pair id and one-to-one storyboard/video binding', () => {
    vi.spyOn(Date, 'now').mockReturnValue(300)
    const source = syncThreeStageLegacyFields(legacyProject())

    const duplicated = duplicateThreeStagePage(source, source.pages![0].id)
    const pairs = pairsOf(duplicated)

    expect(duplicated.pages).toHaveLength(2)
    expect(pairs).toHaveLength(2)
    expect(pairs[1].pairId).not.toBe(pairs[0].pairId)
    expect(pairs[1].storyboardForm.number).toBe(2)
    expect(pairs[1].videoPromptForm.number).toBe(2)
    expect(pairs[1].storyboardForm.sourceFormId).toBe(pairs[0].storyboardForm.id)
    expect(pairs[1].videoPromptForm.sourceFormId).toBe(pairs[0].videoPromptForm.id)
  })

  test('adds a blank page with fresh character and story/video forms', () => {
    vi.spyOn(Date, 'now').mockReturnValue(350)
    const source = syncThreeStageLegacyFields(legacyProject())

    const next = addThreeStagePage(source)
    const pages = normalizeThreeStagePages(next)

    expect(pages).toHaveLength(2)
    expect(next.selectedPageId).toBe(pages[1].id)
    expect(pages[1].items.map(item => item.kind)).toEqual(['character', 'storyVideoPair'])
    expect(getSelectedThreeStageFormContext(next).form.type).toBe('character')
    expect(getSelectedThreeStageFormContext(next).form.number).toBe(2)
    expect(pairsOf(next)[1].storyboardForm.number).toBe(2)
  })

  test('removes a page and selects the remaining page', () => {
    const source = addThreeStagePage(syncThreeStageLegacyFields(legacyProject()))
    const removedPageId = source.pages![1].id

    const next = removeThreeStagePage(source, removedPageId)

    expect(next.pages).toHaveLength(1)
    expect(next.pages?.some(page => page.id === removedPageId)).toBe(false)
    expect(next.selectedPageId).toBe(next.pages![0].id)
  })

  test('creates a story/video pair from an existing bound pair source', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    const firstPair = pairsOf(source)[0]
    vi.spyOn(Date, 'now').mockReturnValue(400)

    const next = addStoryVideoPairToPage(source, source.pages![0].id, firstPair.pairId)
    const pairs = pairsOf(next)

    expect(pairs).toHaveLength(2)
    expect(pairs[1].storyboardForm.section.fields.theme).toBe('Storyboard A')
    expect(pairs[1].videoPromptForm.section.fields.actionSnapshot).toBe('Video A')
    expect(pairs[1].storyboardForm.number).toBe(2)
    expect(pairs[1].videoPromptForm.number).toBe(2)
  })

  test('adds an independent object board form to the selected page', () => {
    vi.spyOn(Date, 'now').mockReturnValue(375)
    const source = syncThreeStageLegacyFields(legacyProject())

    const next = addObjectFormToPage(source, source.pages![0].id)
    const context = getSelectedThreeStageFormContext(next)

    expect(context.form.type).toBe('object')
    expect(context.form.title).toBe('物品版 #1')
    expect(context.item.kind).toBe('character')
  })

  test('keeps object board type when duplicating a page', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    const withObject = addObjectFormToPage(source, source.pages![0].id)

    const duplicated = duplicateThreeStagePage(withObject, withObject.pages![0].id)
    const objectForms = normalizeThreeStagePages(duplicated)
      .flatMap(page => page.items)
      .filter((item): item is IThreeStageCharacterItem => item.kind === 'character' && item.form.type === 'object')

    expect(objectForms).toHaveLength(2)
    expect(objectForms.map(item => item.form.number)).toEqual([1, 2])
  })

  test('removes the whole bound pair when deleting either paired card', () => {
    const base = syncThreeStageLegacyFields(legacyProject())
    const source = syncThreeStageLegacyFields(addStoryVideoPairToPage(base, base.pages![0].id))
    const firstPage = source.pages![0]
    const pair = firstPage.items.find((item): item is IThreeStageStoryVideoPairItem => item.kind === 'storyVideoPair')!

    const next = removeThreeStageItem(source, firstPage.id, pair.id)

    expect(pairsOf(next)).toHaveLength(1)
    expect(pairsOf(next).some(candidate => candidate.pairId === pair.pairId)).toBe(false)
  })

  test('keeps the current selection when removing a different item', () => {
    const base = syncThreeStageLegacyFields(legacyProject())
    const source = addObjectFormToPage(base, base.pages![0].id)
    const page = source.pages![0]
    const pair = page.items.find((item): item is IThreeStageStoryVideoPairItem => item.kind === 'storyVideoPair')!
    const object = page.items.find(item => item.kind === 'character' && item.form.type === 'object')!
    const selected = selectThreeStageForm(source, page.id, pair.storyboardForm.id)

    const next = removeThreeStageItem(selected, page.id, object.id)

    expect(next.selectedFormId).toBe(pair.storyboardForm.id)
  })

  test('does not recreate a deliberately deleted first-page character form', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    const firstPage = source.pages![0]
    const character = firstPage.items.find(item => item.kind === 'character')!

    const next = removeThreeStageItem(source, firstPage.id, character.id)

    expect(normalizeThreeStagePages(next)[0].items.map(item => item.kind)).toEqual(['storyVideoPair'])
    expect(getSelectedThreeStageFormContext(next).form.type).toBe('storyboard')
  })

  test('injects only the storyboard bound to the selected video prompt form', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    const withSecondPair = addStoryVideoPairToPage(source, source.pages![0].id)
    const pairs = pairsOf(withSecondPair)
    const nextPages = withSecondPair.pages!.map(page => ({
      ...page,
      items: page.items.map(item => {
        if (item.kind !== 'storyVideoPair') return item
        if (item.pairId === pairs[0].pairId) {
          return { ...item, storyboardForm: { ...item.storyboardForm, section: { ...item.storyboardForm.section, fields: { theme: 'Other storyboard' } } } }
        }
        return { ...item, storyboardForm: { ...item.storyboardForm, section: { ...item.storyboardForm.section, fields: { theme: 'Bound storyboard' } } } }
      })
    }))
    const selected = selectThreeStageForm({ ...withSecondPair, pages: nextPages }, withSecondPair.pages![0].id, pairs[1].videoPromptForm.id)
    const context = getSelectedThreeStageFormContext(selected)
    const output = buildThreeStageOutput('videoPrompt', context.form.section.fields, {
      ...selected,
      storyboard: context.pairedStoryboardForm!.section
    })

    expect(output).toContain('Bound storyboard')
    expect(output).not.toContain('Other storyboard')
  })
})
