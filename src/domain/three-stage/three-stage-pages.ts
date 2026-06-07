import type {
  IThreeStageForm,
  IThreeStageItem,
  IThreeStagePage,
  IThreeStageProject,
  IThreeStageSection,
  IThreeStageStoryVideoPairItem,
  ThreeStageKey
} from '@/models/PromptHistory.model'

const stageTitle = (type: ThreeStageKey, number: number): string => {
  if (type === 'character') return `人物版 #${number}`
  if (type === 'storyboard') return `故事版 #${number}`
  return `提示词版 #${number}`
}

const createSection = (timestamp = Date.now(), section?: Partial<IThreeStageSection>): IThreeStageSection => ({
  fields: { ...(section?.fields || {}) },
  focusedFieldId: section?.focusedFieldId || null,
  updatedAt: section?.updatedAt || timestamp,
  meta: { ...(section?.meta || {}) }
})

const cloneSection = (section: IThreeStageSection | undefined, timestamp = Date.now()): IThreeStageSection => ({
  fields: { ...(section?.fields || {}) },
  focusedFieldId: section?.focusedFieldId || null,
  updatedAt: timestamp,
  meta: { ...(section?.meta || {}) }
})

export const createThreeStageForm = ({
  type,
  number,
  section,
  sourceFormId,
  timestamp = Date.now()
}: {
  type: ThreeStageKey
  number: number
  section?: Partial<IThreeStageSection>
  sourceFormId?: string | null
  timestamp?: number
}): IThreeStageForm => ({
  id: `${timestamp}-${type}-${number}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  number,
  title: stageTitle(type, number),
  section: createSection(timestamp, section),
  sourceFormId: sourceFormId || null,
  createdAt: timestamp,
  updatedAt: timestamp,
  meta: {}
})

export const createCharacterItem = (form: IThreeStageForm, timestamp = Date.now()): IThreeStageItem => ({
  id: `${form.id}-item`,
  kind: 'character',
  form,
  createdAt: timestamp,
  updatedAt: timestamp,
  meta: {}
})

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

const allForms = (pages: IThreeStagePage[]): IThreeStageForm[] =>
  pages.flatMap(page => page.items.flatMap(item =>
    item.kind === 'character' ? [item.form] : [item.storyboardForm, item.videoPromptForm]
  ))

const maxFormNumber = (pages: IThreeStagePage[], type: ThreeStageKey): number =>
  Math.max(0, ...allForms(pages).filter(form => form.type === type).map(form => form.number || 0))

const maxPairNumber = (pages: IThreeStagePage[]): number =>
  Math.max(0, ...pages.flatMap(page => page.items)
    .filter((item): item is IThreeStageStoryVideoPairItem => item.kind === 'storyVideoPair')
    .map(item => item.number || 0))

export const createDefaultThreeStagePage = (timestamp = Date.now()): IThreeStagePage => {
  const characterForm = createThreeStageForm({ type: 'character', number: 1, timestamp })
  const storyboardForm = createThreeStageForm({ type: 'storyboard', number: 1, timestamp })
  const videoPromptForm = createThreeStageForm({ type: 'videoPrompt', number: 1, timestamp })
  const pair = createStoryVideoPairItem({ number: 1, storyboardForm, videoPromptForm, timestamp })

  return {
    id: `${timestamp}-three-stage-page-1`,
    title: 'Page 1',
    items: [createCharacterItem(characterForm, timestamp), pair],
    selectedItemId: characterForm.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    meta: {}
  }
}

const normalizeForm = (form: Partial<IThreeStageForm>, fallbackType: ThreeStageKey, fallbackNumber: number, timestamp: number): IThreeStageForm => {
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
    meta: form.meta || {}
  }
}

const normalizeItem = (item: Partial<IThreeStageItem>, timestamp: number): IThreeStageItem | null => {
  if (item.kind === 'character' && 'form' in item) {
    const form = normalizeForm(item.form || {}, 'character', 1, timestamp)
    return {
      id: item.id || `${form.id}-item`,
      kind: 'character',
      form,
      createdAt: item.createdAt || form.createdAt,
      updatedAt: item.updatedAt || form.updatedAt,
      meta: item.meta || {}
    }
  }

  if (item.kind === 'storyVideoPair' && 'storyboardForm' in item && 'videoPromptForm' in item) {
    const number = Number(item.number || 1)
    const storyboardForm = normalizeForm(item.storyboardForm || {}, 'storyboard', number, timestamp)
    const videoPromptForm = normalizeForm(item.videoPromptForm || {}, 'videoPrompt', number, timestamp)
    const pairId = item.pairId || item.id || `${timestamp}-pair-${number}`
    return {
      id: item.id || pairId,
      kind: 'storyVideoPair',
      pairId,
      number,
      storyboardForm,
      videoPromptForm,
      createdAt: item.createdAt || timestamp,
      updatedAt: item.updatedAt || timestamp,
      meta: item.meta || {}
    }
  }

  return null
}

export const normalizeThreeStagePages = (threeStage: Partial<IThreeStageProject> | undefined, timestamp = Date.now()): IThreeStagePage[] => {
  const rawPages = Array.isArray(threeStage?.pages) ? threeStage.pages : []
  const normalizedPages = rawPages.map((page, index) => {
    let items = Array.isArray(page.items)
      ? page.items.map(item => normalizeItem(item, timestamp)).filter((item): item is IThreeStageItem => Boolean(item))
      : []
    if (index === 0) {
      const hasCharacter = items.some(item => item.kind === 'character')
      const hasPair = items.some(item => item.kind === 'storyVideoPair')
      if (!hasCharacter) {
        const characterForm = createThreeStageForm({
          type: 'character',
          number: maxFormNumber([{ ...page, items }], 'character') + 1,
          section: threeStage?.character,
          timestamp
        })
        items = [createCharacterItem(characterForm, timestamp), ...items]
      }
      if (!hasPair) {
        const number = maxPairNumber([{ ...page, items }]) + 1
        const storyboardForm = createThreeStageForm({
          type: 'storyboard',
          number,
          section: threeStage?.storyboard,
          timestamp
        })
        const videoPromptForm = createThreeStageForm({
          type: 'videoPrompt',
          number,
          section: threeStage?.videoPrompt,
          timestamp
        })
        items = [...items, createStoryVideoPairItem({ number, storyboardForm, videoPromptForm, timestamp })]
      }
    }
    return {
      id: page.id || `${timestamp}-three-stage-page-${index + 1}`,
      title: page.title || `Page ${index + 1}`,
      items,
      selectedItemId: page.selectedItemId || items[0]?.id || null,
      createdAt: page.createdAt || timestamp,
      updatedAt: page.updatedAt || timestamp,
      meta: page.meta || {}
    }
  }).filter(page => page.items.length > 0)

  if (normalizedPages.length > 0) return normalizedPages

  const page = createDefaultThreeStagePage(timestamp)
  const character = page.items.find(item => item.kind === 'character')
  const pair = page.items.find((item): item is IThreeStageStoryVideoPairItem => item.kind === 'storyVideoPair')
  if (character?.kind === 'character') {
    character.form.section = createSection(timestamp, threeStage?.character)
  }
  if (pair) {
    pair.storyboardForm.section = createSection(timestamp, threeStage?.storyboard)
    pair.videoPromptForm.section = createSection(timestamp, threeStage?.videoPrompt)
  }
  return [page]
}

export const getSelectedThreeStagePage = (threeStage: IThreeStageProject): IThreeStagePage => {
  const pages = normalizeThreeStagePages(threeStage)
  return pages.find(page => page.id === threeStage.selectedPageId) || pages[0]
}

export const getSelectedThreeStageFormContext = (threeStage: IThreeStageProject) => {
  const page = getSelectedThreeStagePage(threeStage)
  for (const item of page.items) {
    if (item.kind === 'character' && item.form.id === threeStage.selectedFormId) {
      return { page, item, form: item.form, pairedStoryboardForm: null }
    }
    if (item.kind === 'storyVideoPair') {
      if (item.storyboardForm.id === threeStage.selectedFormId) {
        return { page, item, form: item.storyboardForm, pairedStoryboardForm: item.storyboardForm }
      }
      if (item.videoPromptForm.id === threeStage.selectedFormId) {
        return { page, item, form: item.videoPromptForm, pairedStoryboardForm: item.storyboardForm }
      }
    }
  }

  const firstItem = page.items[0]
  if (firstItem.kind === 'character') return { page, item: firstItem, form: firstItem.form, pairedStoryboardForm: null }
  return { page, item: firstItem, form: firstItem.storyboardForm, pairedStoryboardForm: firstItem.storyboardForm }
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
    selectedPairId: selectedContext.item.kind === 'storyVideoPair' ? selectedContext.item.pairId : null,
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
    selectedFieldId: fieldId || form.section.focusedFieldId || defaultFieldId(form.type)
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
    items: page.items.map(item => {
      if (item.kind === 'character' && item.form.id === formId) {
        return { ...item, form: { ...item.form, section, updatedAt: section.updatedAt }, updatedAt: section.updatedAt }
      }
      if (item.kind === 'storyVideoPair') {
        if (item.storyboardForm.id === formId) {
          return { ...item, storyboardForm: { ...item.storyboardForm, section, updatedAt: section.updatedAt }, updatedAt: section.updatedAt }
        }
        if (item.videoPromptForm.id === formId) {
          return { ...item, videoPromptForm: { ...item.videoPromptForm, section, updatedAt: section.updatedAt }, updatedAt: section.updatedAt }
        }
      }
      return item
    }),
    updatedAt: Date.now()
  }))

  return syncThreeStageLegacyFields({ ...threeStage, pages: nextPages })
}

export const duplicateThreeStagePage = (threeStage: IThreeStageProject, pageId: string): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const sourcePage = pages.find(page => page.id === pageId) || pages[pages.length - 1]
  const timestamp = Date.now()
  let nextCharacterNumber = maxFormNumber(pages, 'character') + 1
  let nextPairNumber = maxPairNumber(pages) + 1

  const nextItems = sourcePage.items.map(item => {
    if (item.kind === 'character') {
      const form = createThreeStageForm({
        type: 'character',
        number: nextCharacterNumber++,
        section: cloneSection(item.form.section, timestamp),
        sourceFormId: item.form.id,
        timestamp
      })
      return createCharacterItem(form, timestamp)
    }

    const pairNumber = nextPairNumber++
    const storyboardForm = createThreeStageForm({
      type: 'storyboard',
      number: pairNumber,
      section: cloneSection(item.storyboardForm.section, timestamp),
      sourceFormId: item.storyboardForm.id,
      timestamp
    })
    const videoPromptForm = createThreeStageForm({
      type: 'videoPrompt',
      number: pairNumber,
      section: cloneSection(item.videoPromptForm.section, timestamp),
      sourceFormId: item.videoPromptForm.id,
      timestamp
    })
    return createStoryVideoPairItem({ number: pairNumber, storyboardForm, videoPromptForm, timestamp })
  })

  const page: IThreeStagePage = {
    id: `${timestamp}-three-stage-page-${pages.length + 1}`,
    title: `Page ${pages.length + 1}`,
    items: nextItems,
    selectedItemId: nextItems[0]?.id || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    meta: { sourcePageId: sourcePage.id }
  }
  const firstForm = allForms([page])[0]
  return selectThreeStageForm({ ...threeStage, pages: [...pages, page], selectedPageId: page.id }, page.id, firstForm.id)
}

export const addThreeStagePage = (threeStage: IThreeStageProject): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const timestamp = Date.now()
  const characterForm = createThreeStageForm({
    type: 'character',
    number: maxFormNumber(pages, 'character') + 1,
    timestamp
  })
  const pairNumber = maxPairNumber(pages) + 1
  const storyboardForm = createThreeStageForm({
    type: 'storyboard',
    number: pairNumber,
    timestamp
  })
  const videoPromptForm = createThreeStageForm({
    type: 'videoPrompt',
    number: pairNumber,
    timestamp
  })
  const pair = createStoryVideoPairItem({ number: pairNumber, storyboardForm, videoPromptForm, timestamp })
  const page: IThreeStagePage = {
    id: `${timestamp}-three-stage-page-${pages.length + 1}`,
    title: `Page ${pages.length + 1}`,
    items: [createCharacterItem(characterForm, timestamp), pair],
    selectedItemId: characterForm.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    meta: {}
  }

  return selectThreeStageForm({ ...threeStage, pages: [...pages, page], selectedPageId: page.id }, page.id, characterForm.id)
}

export const addCharacterFormToPage = (threeStage: IThreeStageProject, pageId: string, sourceFormId?: string): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const sourceForm = allForms(pages).filter(form => form.type === 'character').find(form => form.id === sourceFormId) ||
    lastOf(allForms(pages).filter(form => form.type === 'character'))
  const timestamp = Date.now()
  const form = createThreeStageForm({
    type: 'character',
    number: maxFormNumber(pages, 'character') + 1,
    section: sourceForm ? cloneSection(sourceForm.section, timestamp) : createSection(timestamp),
    sourceFormId: sourceForm?.id,
    timestamp
  })
  const item = createCharacterItem(form, timestamp)
  const nextPages = pages.map(page => page.id === pageId ? { ...page, items: [...page.items, item], updatedAt: timestamp } : page)
  return selectThreeStageForm({ ...threeStage, pages: nextPages }, pageId, form.id)
}

export const addStoryVideoPairToPage = (threeStage: IThreeStageProject, pageId: string, sourcePairId?: string): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const pairs = pages.flatMap(page => page.items).filter((item): item is IThreeStageStoryVideoPairItem => item.kind === 'storyVideoPair')
  const sourcePair = pairs.find(pair => pair.pairId === sourcePairId) || lastOf(pairs)
  const timestamp = Date.now()
  const number = maxPairNumber(pages) + 1
  const storyboardForm = createThreeStageForm({
    type: 'storyboard',
    number,
    section: sourcePair ? cloneSection(sourcePair.storyboardForm.section, timestamp) : createSection(timestamp),
    sourceFormId: sourcePair?.storyboardForm.id,
    timestamp
  })
  const videoPromptForm = createThreeStageForm({
    type: 'videoPrompt',
    number,
    section: sourcePair ? cloneSection(sourcePair.videoPromptForm.section, timestamp) : createSection(timestamp),
    sourceFormId: sourcePair?.videoPromptForm.id,
    timestamp
  })
  const item = createStoryVideoPairItem({ number, storyboardForm, videoPromptForm, timestamp })
  const nextPages = pages.map(page => page.id === pageId ? { ...page, items: [...page.items, item], updatedAt: timestamp } : page)
  return selectThreeStageForm({ ...threeStage, pages: nextPages }, pageId, storyboardForm.id)
}

export const removeThreeStageItem = (threeStage: IThreeStageProject, pageId: string, itemId: string): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage)
  const page = pages.find(candidate => candidate.id === pageId) || pages[0]
  if (page.items.length <= 1) return threeStage

  const nextItems = page.items.filter(item => item.id !== itemId)
  const nextPage = { ...page, items: nextItems, selectedItemId: nextItems[0]?.id || null, updatedAt: Date.now() }
  const nextPages = pages.map(candidate => candidate.id === page.id ? nextPage : candidate)
  const firstForm = allForms([nextPage])[0]
  return selectThreeStageForm({ ...threeStage, pages: nextPages }, nextPage.id, firstForm.id)
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

export const getPairCopySources = (threeStage: IThreeStageProject): IThreeStageStoryVideoPairItem[] =>
  normalizeThreeStagePages(threeStage).flatMap(page => page.items)
    .filter((item): item is IThreeStageStoryVideoPairItem => item.kind === 'storyVideoPair')

const defaultFieldId = (stage: ThreeStageKey): string => {
  if (stage === 'character') return 'characterNotes'
  if (stage === 'storyboard') return 'theme'
  return 'actionSnapshot'
}

const lastOf = <T,>(items: T[]): T | undefined => items.length > 0 ? items[items.length - 1] : undefined
