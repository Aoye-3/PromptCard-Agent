import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  addThreeStageFormToPage,
  createFormItem,
  createStoryVideoPairItem,
  createThreeStageForm,
  duplicateThreeStageForm,
  duplicateThreeStagePage,
  getSelectedThreeStageFormContext,
  normalizeThreeStagePages,
  removeThreeStageItem,
  renameThreeStageForm,
  reorderThreeStageItem,
  selectThreeStageForm,
  syncThreeStageLegacyFields,
  updateThreeStageFormFixedContent
} from './three-stage-pages'
import { buildThreeStageFormOutput, getFormFixedContentOverrides } from './three-stage-definitions'
import type {
  IThreeStageFormItem,
  IThreeStageProject,
  ThreeStageKey
} from '@/models/PromptHistory.model'

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

const formItemsOf = (threeStage: IThreeStageProject): IThreeStageFormItem[] =>
  normalizeThreeStagePages(threeStage)
    .flatMap(page => page.items)
    .filter((item): item is IThreeStageFormItem => item.kind === 'form')

const formsOfType = (threeStage: IThreeStageProject, type: ThreeStageKey) =>
  formItemsOf(threeStage).map(item => item.form).filter(form => form.type === type)

describe('three-stage pages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('migrates legacy sections into page 1 as three independent forms', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)

    const normalized = syncThreeStageLegacyFields(legacyProject())
    const page = normalized.pages![0]

    expect(page.items.map(item => item.kind)).toEqual(['form', 'form', 'form'])
    expect(formItemsOf(normalized).map(item => item.form.type)).toEqual(['character', 'storyboard', 'videoPrompt'])
    expect(formsOfType(normalized, 'storyboard')[0].section.fields.theme).toBe('Storyboard A')
    expect(formsOfType(normalized, 'videoPrompt')[0].section.fields.actionSnapshot).toBe('Video A')
    expect(normalized.selectedPairId).toBeNull()
  })

  test('splits persisted bound pairs into adjacent independent forms', () => {
    const timestamp = 100
    const characterForm = createThreeStageForm({ type: 'character', number: 1, timestamp })
    const storyboardForm = createThreeStageForm({
      type: 'storyboard',
      number: 1,
      section: { fields: { theme: 'Legacy pair storyboard' } },
      timestamp
    })
    const videoPromptForm = createThreeStageForm({
      type: 'videoPrompt',
      number: 1,
      section: { fields: { actionSnapshot: 'Legacy pair prompt' } },
      timestamp
    })
    const pair = createStoryVideoPairItem({ number: 1, storyboardForm, videoPromptForm, timestamp })

    const normalized = normalizeThreeStagePages({
      ...legacyProject(),
      pages: [{
        id: 'legacy-page',
        title: 'Legacy',
        items: [createFormItem(characterForm, timestamp), pair as unknown as IThreeStageFormItem],
        createdAt: timestamp,
        updatedAt: timestamp,
        meta: {}
      }]
    }, 200)

    expect(normalized[0].items.map(item => item.kind)).toEqual(['form', 'form', 'form'])
    expect((normalized[0].items as IThreeStageFormItem[]).map(item => item.form.type)).toEqual([
      'character',
      'storyboard',
      'videoPrompt'
    ])
  })

  test('duplicates a page with independent form numbering and source links', () => {
    vi.spyOn(Date, 'now').mockReturnValue(300)
    const source = syncThreeStageLegacyFields(legacyProject())

    const duplicated = duplicateThreeStagePage(source, source.pages![0].id)
    const forms = formItemsOf(duplicated).map(item => item.form)

    expect(duplicated.pages).toHaveLength(2)
    expect(forms.filter(form => form.type === 'storyboard').map(form => form.number)).toEqual([1, 2])
    expect(forms.filter(form => form.type === 'videoPrompt').map(form => form.number)).toEqual([1, 2])
    expect(forms.find(form => form.type === 'storyboard' && form.number === 2)?.sourceFormId)
      .toBe(forms.find(form => form.type === 'storyboard' && form.number === 1)?.id)
    expect(forms.find(form => form.type === 'videoPrompt' && form.number === 2)?.sourceFormId)
      .toBe(forms.find(form => form.type === 'videoPrompt' && form.number === 1)?.id)
  })

  test('adds independent storyboard and prompt forms without creating a pair', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    vi.spyOn(Date, 'now').mockReturnValue(400)

    const withStoryboard = addThreeStageFormToPage(source, source.pages![0].id, 'storyboard')
    const withPrompt = addThreeStageFormToPage(withStoryboard, withStoryboard.pages![0].id, 'videoPrompt')

    expect(formItemsOf(withPrompt).map(item => item.form.type)).toEqual([
      'character',
      'storyboard',
      'videoPrompt',
      'storyboard',
      'videoPrompt'
    ])
    expect(withPrompt.selectedPairId).toBeNull()
  })

  test('removes only the selected independent form', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    const page = source.pages![0]
    const storyboard = formItemsOf(source).find(item => item.form.type === 'storyboard')!

    const next = removeThreeStageItem(source, page.id, storyboard.id)

    expect(formItemsOf(next).map(item => item.form.type)).toEqual(['character', 'videoPrompt'])
  })

  test('duplicates a form directly after its source with fields, title, and fixed-content metadata', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    const prompt = formItemsOf(source).find(item => item.form.type === 'videoPrompt')!
    const page = source.pages![0]
    const customized = {
      ...source,
      pages: source.pages!.map(candidate => candidate.id === page.id
        ? {
            ...candidate,
            items: candidate.items.map(item => item.id === prompt.id && item.kind === 'form'
              ? {
                  ...item,
                  form: {
                    ...item.form,
                    title: 'Prompt Alpha',
                    meta: {
                      ...item.form.meta,
                      template: { fixedContent: { negativePrompt: 'Template snapshot' } },
                      canvas: { fixedContent: { negativePrompt: { value: 'Local override', unlocked: true } } }
                    }
                  }
                }
              : item)
          }
        : candidate)
    }
    vi.spyOn(Date, 'now').mockReturnValue(500)

    const next = duplicateThreeStageForm(customized, page.id, prompt.form.id)
    const pageItems = next.pages![0].items as IThreeStageFormItem[]
    const promptIndex = pageItems.findIndex(item => item.form.id === prompt.form.id)
    const copy = pageItems[promptIndex + 1]

    expect(copy.form.type).toBe('videoPrompt')
    expect(copy.form.title).toBe('Prompt Alpha')
    expect(copy.form.sourceFormId).toBe(prompt.form.id)
    expect(copy.form.section.fields.actionSnapshot).toBe('Video A')
    expect(copy.form.meta).toMatchObject({
      template: { fixedContent: { negativePrompt: 'Template snapshot' } },
      canvas: { fixedContent: { negativePrompt: { value: 'Local override', unlocked: true } } }
    })
  })

  test('reorders forms within the current page and keeps selection stable', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    const page = source.pages![0]
    const prompt = formItemsOf(source).find(item => item.form.type === 'videoPrompt')!
    const selected = selectThreeStageForm(source, page.id, prompt.form.id)

    const next = reorderThreeStageItem(selected, page.id, prompt.id, 0)

    expect(next.pages![0].items.map(item => item.id)[0]).toBe(prompt.id)
    expect(next.selectedFormId).toBe(prompt.form.id)
  })

  test('renames any form without changing its type or fields', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    const storyboard = formItemsOf(source).find(item => item.form.type === 'storyboard')!

    const next = renameThreeStageForm(source, storyboard.form.id, 'Opening Storyboard')
    const renamed = formItemsOf(next).find(item => item.form.id === storyboard.form.id)!

    expect(renamed.form.title).toBe('Opening Storyboard')
    expect(renamed.form.type).toBe('storyboard')
    expect(renamed.form.section.fields.theme).toBe('Storyboard A')
  })

  test('unlocks and edits fixed content only on the selected form node', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    const prompt = formItemsOf(source).find(item => item.form.type === 'videoPrompt')!

    const unlocked = updateThreeStageFormFixedContent(source, prompt.form.id, 'duration', {
      value: 'Editable duration',
      unlocked: true
    })
    const unlockedPrompt = formItemsOf(unlocked).find(item => item.form.id === prompt.form.id)!

    expect(getFormFixedContentOverrides(unlockedPrompt.form).duration).toEqual({
      value: 'Editable duration',
      unlocked: true
    })

    const edited = updateThreeStageFormFixedContent(unlocked, prompt.form.id, 'duration', {
      value: 'Node-only duration edit',
      unlocked: true
    })
    const editedPrompt = formItemsOf(edited).find(item => item.form.id === prompt.form.id)!

    expect(buildThreeStageFormOutput(editedPrompt.form, edited)).toContain('Node-only duration edit')
    expect(buildThreeStageFormOutput(prompt.form, source)).not.toContain('Node-only duration edit')
  })

  test('does not recreate a deliberately deleted first-page character form', () => {
    const source = syncThreeStageLegacyFields(legacyProject())
    const firstPage = source.pages![0]
    const character = formItemsOf(source).find(item => item.form.type === 'character')!

    const next = removeThreeStageItem(source, firstPage.id, character.id)

    expect(normalizeThreeStagePages(next)[0].items.map(item => item.kind)).toEqual(['form', 'form'])
    expect(getSelectedThreeStageFormContext(next).form.type).toBe('storyboard')
  })
})
