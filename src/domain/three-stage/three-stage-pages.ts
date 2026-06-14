import type {
  IThreeStageForm,
  IThreeStageFormItem,
  IThreeStageItem,
  IThreeStagePage,
  IThreeStageProject,
  IThreeStageSection,
  IThreeStageStoryVideoPairItem,
  ThreeStageKey
} from '@/models/PromptHistory.model'
import {
  getFormFixedContentOverrides,
  getTemplateFixedContentForStage,
  type FixedContentDefaults,
  type ThreeStageTemplateSettings
} from './three-stage-definitions'

const stageTitle = (type: ThreeStageKey, number: number): string => {
  return readableStageTitle(type, number)
}

const readableStageTitle = (type: ThreeStageKey, number: number): string => {
  if (type === 'character') return `人物版 #${number}`
  if (type === 'object') return `物品版 #${number}`
  if (type === 'storyboard') return `故事版 #${number}`
  return `提示词版 #${number}`
}

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value ?? {}))

const createSection = (timestamp = Date.now(), section?: Partial<IThreeStageSection>): IThreeStageSection => ({
  fields: { ...(section?.fields || {}) },
  focusedFieldId: section?.focusedFieldId || null,
  updatedAt: section?.updatedAt || timestamp,
  meta: cloneJson(section?.meta || {})
})

const cloneSection = (section: IThreeStageSection | undefined, timestamp = Date.now()): IThreeStageSection => ({
  fields: { ...(section?.fields || {}) },
  focusedFieldId: section?.focusedFieldId || null,
  updatedAt: timestamp,
  meta: cloneJson(section?.meta || {})
})

const templateMeta = (fixedContent?: FixedContentDefaults): Record<string, unknown> => {
  if (!fixedContent || Object.keys(fixedContent).length === 0) return {}
  return { template: { fixedContent: { ...fixedContent } } }
}

export const createThreeStageForm = ({
  type,
  number,
  section,
  sourceFormId,
  timestamp = Date.now(),
  templateFixedContent,
  meta
}: {
  type: ThreeStageKey
  number: number
  section?: Partial<IThreeStageSection>
  sourceFormId?: string | null
  timestamp?: number
  templateFixedContent?: FixedContentDefaults
  meta?: Record<string, unknown>
}): IThreeStageForm => ({
  id: `${timestamp}-${type}-${number}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  number,
  title: stageTitle(type, number),
  section: createSection(timestamp, section),
  sourceFormId: sourceFormId || null,
  createdAt: timestamp,
  updatedAt: timestamp,
  meta: meta ? cloneJson(meta) : templateMeta(templateFixedContent)
})

export const createFormItem = (form: IThreeStageForm, timestamp = Date.now(), id?: string): IThreeStageFormItem => ({
  id: id || `${form.id}-item`,
  kind: 'form',
  form,
  createdAt: timestamp,
  updatedAt: timestamp,
  meta: {}
})

/** @deprecated Kept for callers that still create character-shaped items. */
export const createCharacterItem = (form: IThreeStageForm, timestamp = Date.now()): IThreeStageItem =>
  createFormItem(form, timestamp)

/** @deprecated Legacy pair factory kept only for compatibility with old tests/imports. */
export const createStoryVideoPairItem = ({
  number,
  storyboardForm,
  videoPromptForm,
  pairId,
  timestamp = Date.now()
}: {
  number: number
  storyboardForm: IThreeStageForm
  videoPromptForm: IThreeStageForm
  pairId?: string
  timestamp?: number
}): IThreeStageStoryVideoPairItem => ({
  id: pairId || `${timestamp}-pair-${number}`,
  kind: 'storyVideoPair',
  pairId: pairId || `${timestamp}-pair-${number}`,
  number,
  storyboardForm,
  videoPromptForm,
  createdAt: timestamp,
  updatedAt: timestamp,
  meta: {}
})

const allFormItems = (pages: IThreeStagePage[]): IThreeStageFormItem[] =>
  pages.flatMap(page => page.items)

const allForms = (pages: IThreeStagePage[]): IThreeStageForm[] =>
  allFormItems(pages).map(item => item.form)

const maxFormNumber = (pages: IThreeStagePage[], type: ThreeStageKey): number =>
  Math.max(0, ...allForms(pages).filter(form => form.type === type).map(form => form.number || 0))

export const createDefaultThreeStagePage = (
  timestamp = Date.now(),
  templateSettings?: ThreeStageTemplateSettings
): IThreeStagePage => {
  const characterForm = createThreeStageForm({
    type: 'character',
    number: 1,
    timestamp,
    templateFixedContent: getTemplateFixedContentForStage('character', templateSettings)
  })
  const storyboardForm = createThreeStageForm({
    type: 'storyboard',
    number: 1,
    timestamp,
    templateFixedContent: getTemplateFixedContentForStage('storyboard', templateSettings)
  })
  const videoPromptForm = createThreeStageForm({
    type: 'videoPrompt',
    number: 1,
    timestamp,
    templateFixedContent: getTemplateFixedContentForStage('videoPrompt', templateSettings)
  })

  return {
    id: `${timestamp}-three-stage-page-1`,
    title: 'Page 1',
    items: [
      createFormItem(characterForm, timestamp),
      createFormItem(storyboardForm, timestamp),
      createFormItem(videoPromptForm, timestamp)
    ],
    selectedItemId: characterForm.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    meta: {}
  }
}

const normalizeForm = (
  form: Partial<IThreeStageForm>,
  fallbackType: ThreeStageKey,
  fallbackNumber: number,
  timestamp: number
): IThreeStageForm => {
  const type = form.type || fallbackType
  const number = Number(form.number || fallbackNumber)
  return {
    id: form.id || `${timestamp}-${type}-${number}`,
    type,
    number,
    title: form.title || stageTitle(type, number),
    section: createSection(timestamp, form.section),
    sourceFormId: form.sourceFormId || null,
    createdAt: form.createdAt || timestamp,
    updatedAt: form.updatedAt || timestamp,
    meta: cloneJson(form.meta || {})
  }
}

const normalizeItem = (item: Partial<IThreeStageItem>, timestamp: number): IThreeStageFormItem[] => {
  if (item.kind === 'form' && 'form' in item) {
    const form = normalizeForm(item.form || {}, item.form?.type || 'character', item.form?.number || 1, timestamp)
    return [{
      id: item.id || `${form.id}-item`,
      kind: 'form',
      form,
      createdAt: item.createdAt || form.createdAt,
      updatedAt: item.updatedAt || form.updatedAt,
      meta: cloneJson(item.meta || {})
    }]
  }

  if (item.kind === 'character' && 'form' in item) {
    const form = normalizeForm(item.form || {}, 'character', 1, timestamp)
    return [createFormItem(form, item.updatedAt || form.updatedAt, item.id)]
  }

  if (item.kind === 'storyVideoPair' && 'storyboardForm' in item && 'videoPromptForm' in item) {
    const number = Number(item.number || 1)
    const storyboardForm = normalizeForm(item.storyboardForm || {}, 'storyboard', number, timestamp)
    const videoPromptForm = normalizeForm(item.videoPromptForm || {}, 'videoPrompt', number, timestamp)
    return [
      createFormItem(storyboardForm, item.updatedAt || storyboardForm.updatedAt, `${storyboardForm.id}-item`),
      createFormItem(videoPromptForm, item.updatedAt || videoPromptForm.updatedAt, `${videoPromptForm.id}-item`)
    ]
  }

  return []
}

export const normalizeThreeStagePages = (threeStage: Partial<IThreeStageProject> | undefined, timestamp = Date.now()): IThreeStagePage[] => {
  const rawPages = Array.isArray(threeStage?.pages) ? threeStage.pages : []
  const normalizedPages = rawPages.map((page, index) => {
    const items = Array.isArray(page.items)
      ? page.items.flatMap(item => normalizeItem(item, timestamp))
      : []
    return {
      id: page.id || `${timestamp}-three-stage-page-${index + 1}`,
      title: page.title || `Page ${index + 1}`,
      items,
      selectedItemId: page.selectedItemId || items[0]?.form.id || null,
      createdAt: page.createdAt || timestamp,
      updatedAt: page.updatedAt || timestamp,
      meta: cloneJson(page.meta || {})
    }
  }).filter(page => page.items.length > 0)

  if (normalizedPages.length > 0) return normalizedPages

  const page = createDefaultThreeStagePage(timestamp)
  const character = page.items.find(item => item.form.type === 'character')
  const storyboard = page.items.find(item => item.form.type === 'storyboard')
  const videoPrompt = page.items.find(item => item.form.type === 'videoPrompt')
  if (character) character.form.section = createSection(timestamp, threeStage?.character)
  if (storyboard) storyboard.form.section = createSection(timestamp, threeStage?.storyboard)
  if (videoPrompt) videoPrompt.form.section = createSection(timestamp, threeStage?.videoPrompt)
  return [page]
}

export const getSelectedThreeStagePage = (threeStage: IThreeStageProject): IThreeStagePage => {
  const pages = normalizeThreeStagePages(threeStage)
  return pages.find(page => page.id === threeStage.selectedPageId) || pages[0]
}

export const getSelectedThreeStageFormContext = (threeStage: IThreeStageProject) => {
  const page = getSelectedThreeStagePage(threeStage)
  for (const item of page.items) {
    if (item.kind === 'form' && item.form.id === threeStage.selectedFormId) {
      return { page, item, form: item.form }
    }
  }

  const firstItem = page.items[0] as IThreeStageFormItem
  return { page, item: firstItem, form: firstItem.form }
}

export const syncThreeStageLegacyFields = (threeStage: IThreeStageProject): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const selectedPage = pages.find(page => page.id === threeStage.selectedPageId) || pages[0]
  const firstCharacter = allForms(pages).find(form => form.type === 'character')
  const firstStoryboard = allForms(pages).find(form => form.type === 'storyboard')
  const firstVideoPrompt = allForms(pages).find(form => form.type === 'videoPrompt')
  const selectedContext = getSelectedThreeStageFormContext({ ...threeStage, pages, selectedPageId: selectedPage.id })

  return {
    ...threeStage,
    pages,
    selectedPageId: selectedPage.id,
    selectedFormId: selectedContext.form.id,
    selectedPairId: null,
    selectedStage: selectedContext.form.type,
    selectedFieldId: selectedContext.form.section.focusedFieldId || defaultFieldId(selectedContext.form.type),
    character: firstCharacter?.section || createSection(),
    storyboard: firstStoryboard?.section || createSection(),
    videoPrompt: firstVideoPrompt?.section || createSection()
  }
}

export const selectThreeStageForm = (threeStage: IThreeStageProject, pageId: string, formId: string, fieldId?: string): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const page = pages.find(candidate => candidate.id === pageId) || pages[0]
  const form = allForms([page]).find(candidate => candidate.id === formId) || allForms([page])[0]
  const nextPages = pages.map(candidate => candidate.id === page.id ? { ...candidate, selectedItemId: form.id } : candidate)
  return syncThreeStageLegacyFields({
    ...threeStage,
    pages: nextPages,
    selectedPageId: page.id,
    selectedFormId: form.id,
    selectedStage: form.type,
    selectedFieldId: fieldId || form.section.focusedFieldId || defaultFieldId(form.type),
    selectedPairId: null
  })
}

export const updateThreeStageFormSection = (
  threeStage: IThreeStageProject,
  formId: string,
  section: IThreeStageSection
): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const nextPages = pages.map(page => ({
    ...page,
    items: page.items.map(item => item.form.id === formId
      ? { ...item, form: { ...item.form, section, updatedAt: section.updatedAt }, updatedAt: section.updatedAt }
      : item),
    updatedAt: Date.now()
  }))

  return syncThreeStageLegacyFields({ ...threeStage, pages: nextPages })
}

export const updateThreeStageFormFixedContent = (
  threeStage: IThreeStageProject,
  formId: string,
  contentId: string,
  update: { value?: string; unlocked?: boolean } | null
): IThreeStageProject => {
  const timestamp = Date.now()
  const updateForm = (form: IThreeStageForm): IThreeStageForm => {
    if (form.id !== formId) return form
    const canvas = typeof form.meta.canvas === 'object' && form.meta.canvas
      ? form.meta.canvas as Record<string, unknown>
      : {}
    const fixedContent = { ...getFormFixedContentOverrides(form) }
    if (update === null) {
      delete fixedContent[contentId]
    } else {
      fixedContent[contentId] = { ...fixedContent[contentId], ...update }
    }
    return {
      ...form,
      meta: { ...form.meta, canvas: { ...canvas, fixedContent } },
      updatedAt: timestamp
    }
  }
  const pages = normalizeThreeStagePages(threeStage).map(page => ({
    ...page,
    items: page.items.map(item => {
      const form = updateForm(item.form)
      return form === item.form ? item : { ...item, form, updatedAt: timestamp }
    })
  }))
  return syncThreeStageLegacyFields({ ...threeStage, pages })
}

const cloneFormForCopy = (
  form: IThreeStageForm,
  number: number,
  timestamp: number,
  options: { keepTitle?: boolean; copyMeta?: boolean } = {}
): IThreeStageForm => ({
  ...createThreeStageForm({
    type: form.type,
    number,
    section: cloneSection(form.section, timestamp),
    sourceFormId: form.id,
    timestamp,
    meta: options.copyMeta ? cloneJson(form.meta || {}) : {}
  }),
  title: options.keepTitle ? form.title : stageTitle(form.type, number)
})

export const duplicateThreeStagePage = (threeStage: IThreeStageProject, pageId: string): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const sourcePage = pages.find(page => page.id === pageId) || pages[pages.length - 1]
  const timestamp = Date.now()
  const nextNumbers: Record<ThreeStageKey, number> = {
    character: maxFormNumber(pages, 'character') + 1,
    object: maxFormNumber(pages, 'object') + 1,
    storyboard: maxFormNumber(pages, 'storyboard') + 1,
    videoPrompt: maxFormNumber(pages, 'videoPrompt') + 1
  }

  const nextItems = sourcePage.items.map(item => {
    const form = cloneFormForCopy(item.form, nextNumbers[item.form.type]++, timestamp, { copyMeta: true })
    return createFormItem(form, timestamp)
  })

  const page: IThreeStagePage = {
    id: `${timestamp}-three-stage-page-${pages.length + 1}`,
    title: `Page ${pages.length + 1}`,
    items: nextItems,
    selectedItemId: nextItems[0]?.form.id || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    meta: { sourcePageId: sourcePage.id }
  }
  const firstForm = allForms([page])[0]
  return selectThreeStageForm({ ...threeStage, pages: [...pages, page], selectedPageId: page.id }, page.id, firstForm.id)
}

export const addThreeStagePage = (threeStage: IThreeStageProject, templateSettings?: ThreeStageTemplateSettings): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const timestamp = Date.now()
  const page = createDefaultThreeStagePage(timestamp, templateSettings)
  const nextNumbers: Record<ThreeStageKey, number> = {
    character: maxFormNumber(pages, 'character') + 1,
    object: maxFormNumber(pages, 'object') + 1,
    storyboard: maxFormNumber(pages, 'storyboard') + 1,
    videoPrompt: maxFormNumber(pages, 'videoPrompt') + 1
  }
  page.id = `${timestamp}-three-stage-page-${pages.length + 1}`
  page.title = `Page ${pages.length + 1}`
  page.items = page.items.map(item => {
    const form = { ...item.form, number: nextNumbers[item.form.type]++, title: stageTitle(item.form.type, nextNumbers[item.form.type] - 1) }
    return { ...item, id: `${form.id}-item`, form }
  })
  page.selectedItemId = page.items[0]?.form.id || null

  return selectThreeStageForm({ ...threeStage, pages: [...pages, page], selectedPageId: page.id }, page.id, page.items[0].form.id)
}

export const addThreeStageFormToPage = (
  threeStage: IThreeStageProject,
  pageId: string,
  type: ThreeStageKey,
  sourceFormId?: string,
  templateSettings?: ThreeStageTemplateSettings
): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const sourceForm = sourceFormId ? allForms(pages).find(form => form.id === sourceFormId && form.type === type) : undefined
  const timestamp = Date.now()
  const number = maxFormNumber(pages, type) + 1
  const form = sourceForm
    ? cloneFormForCopy(sourceForm, number, timestamp, { copyMeta: true })
    : createThreeStageForm({
        type,
        number,
        timestamp,
        templateFixedContent: getTemplateFixedContentForStage(type, templateSettings)
      })
  const item = createFormItem(form, timestamp)
  const nextPages = pages.map(page => page.id === pageId ? { ...page, items: [...page.items, item], updatedAt: timestamp } : page)
  return selectThreeStageForm({ ...threeStage, pages: nextPages }, pageId, form.id)
}

export const addCharacterFormToPage = (threeStage: IThreeStageProject, pageId: string, sourceFormId?: string): IThreeStageProject =>
  addThreeStageFormToPage(threeStage, pageId, 'character', sourceFormId)

export const addObjectFormToPage = (threeStage: IThreeStageProject, pageId: string): IThreeStageProject =>
  addThreeStageFormToPage(threeStage, pageId, 'object')

/** @deprecated Adds adjacent independent storyboard and video prompt forms. */
export const addStoryVideoPairToPage = (threeStage: IThreeStageProject, pageId: string): IThreeStageProject => {
  const withStoryboard = addThreeStageFormToPage(threeStage, pageId, 'storyboard')
  return addThreeStageFormToPage(withStoryboard, pageId, 'videoPrompt')
}

export const duplicateThreeStageForm = (
  threeStage: IThreeStageProject,
  pageId: string,
  formId: string
): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const page = pages.find(candidate => candidate.id === pageId) || pages[0]
  const sourceIndex = page.items.findIndex(item => item.form.id === formId)
  if (sourceIndex < 0) return threeStage
  const source = page.items[sourceIndex].form
  const timestamp = Date.now()
  const form = cloneFormForCopy(source, maxFormNumber(pages, source.type) + 1, timestamp, {
    keepTitle: true,
    copyMeta: true
  })
  const item = createFormItem(form, timestamp)
  const nextItems = [
    ...page.items.slice(0, sourceIndex + 1),
    item,
    ...page.items.slice(sourceIndex + 1)
  ]
  const nextPages = pages.map(candidate => candidate.id === page.id ? { ...candidate, items: nextItems, updatedAt: timestamp } : candidate)
  return selectThreeStageForm({ ...threeStage, pages: nextPages }, page.id, form.id)
}

export const renameThreeStageForm = (
  threeStage: IThreeStageProject,
  formId: string,
  title: string
): IThreeStageProject => {
  const nextTitle = title.trim()
  if (!nextTitle) return threeStage
  const timestamp = Date.now()
  const pages = normalizeThreeStagePages(threeStage).map(page => ({
    ...page,
    items: page.items.map(item => item.form.id === formId
      ? { ...item, form: { ...item.form, title: nextTitle, updatedAt: timestamp }, updatedAt: timestamp }
      : item)
  }))
  return syncThreeStageLegacyFields({ ...threeStage, pages })
}

export const reorderThreeStageItem = (
  threeStage: IThreeStageProject,
  pageId: string,
  itemId: string,
  targetIndex: number
): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const nextPages = pages.map(page => {
    if (page.id !== pageId) return page
    const currentIndex = page.items.findIndex(item => item.id === itemId)
    if (currentIndex < 0) return page
    const nextItems = [...page.items]
    const [item] = nextItems.splice(currentIndex, 1)
    nextItems.splice(Math.max(0, Math.min(targetIndex, nextItems.length)), 0, item)
    return { ...page, items: nextItems, updatedAt: Date.now() }
  })
  return syncThreeStageLegacyFields({ ...threeStage, pages: nextPages })
}

export const removeThreeStageItem = (threeStage: IThreeStageProject, pageId: string, itemId: string): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const page = pages.find(candidate => candidate.id === pageId) || pages[0]
  if (page.items.length <= 1) return threeStage

  const nextItems = page.items.filter(item => item.id !== itemId)
  const nextPage = { ...page, items: nextItems, selectedItemId: nextItems[0]?.form.id || null, updatedAt: Date.now() }
  const nextPages = pages.map(candidate => candidate.id === page.id ? nextPage : candidate)
  return selectThreeStageFormAfterRemoval(threeStage, nextPages, page.id)
}

export const selectThreeStageFormAfterRemoval = (
  threeStage: IThreeStageProject,
  pages: IThreeStagePage[],
  preferredPageId?: string
): IThreeStageProject => {
  const preferredForm = allForms(pages).find(form => form.id === threeStage.selectedFormId)
  if (preferredForm) {
    const page = pages.find(candidate => allForms([candidate]).some(form => form.id === preferredForm.id)) || pages[0]
    return selectThreeStageForm({ ...threeStage, pages }, page.id, preferredForm.id)
  }
  const page = pages.find(candidate => candidate.id === preferredPageId) || pages[0]
  const fallbackForm = allForms([page])[0]
  return selectThreeStageForm({ ...threeStage, pages }, page.id, fallbackForm.id)
}

export const removeThreeStagePage = (threeStage: IThreeStageProject, pageId: string): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  if (pages.length <= 1) return threeStage
  const removedIndex = pages.findIndex(page => page.id === pageId)
  const nextPages = pages.filter(page => page.id !== pageId)
  const nextPage = nextPages[Math.max(0, Math.min(removedIndex, nextPages.length - 1))]
  const firstForm = allForms([nextPage])[0]
  return selectThreeStageForm({ ...threeStage, pages: nextPages }, nextPage.id, firstForm.id)
}

export const getCharacterCopySources = (threeStage: IThreeStageProject): IThreeStageForm[] =>
  allForms(normalizeThreeStagePages(threeStage)).filter(form => form.type === 'character')

export const getThreeStageFormCopySources = (threeStage: IThreeStageProject, type: ThreeStageKey): IThreeStageForm[] =>
  allForms(normalizeThreeStagePages(threeStage)).filter(form => form.type === type)

/** @deprecated Storyboard and prompt forms are no longer paired. */
export const getPairCopySources = (): IThreeStageStoryVideoPairItem[] => []

const defaultFieldId = (stage: ThreeStageKey): string => {
  if (stage === 'character') return 'characterNotes'
  if (stage === 'object') return 'objectNotes'
  if (stage === 'storyboard') return 'theme'
  return 'actionSnapshot'
}
