import type { ICard } from '@/models/Card.model'
import type {
  IPromptProject,
  IStoryboardProject,
  IStoryboardRow,
  IStoryboardSequence,
  IThreeStageProject,
  IThreeStageSection,
  ThreeStageKey
} from '@/models/PromptHistory.model'
import type { IPage } from '@/stores/card-initial-state'
import {
  createDefaultThreeStagePage,
  normalizeThreeStagePages,
  syncThreeStageLegacyFields
} from '@/domain/three-stage/three-stage-pages'

const DEFAULT_SEQUENCE_NAME = '单个镜头序列'
const DEFAULT_SEQUENCE_DESCRIPTION = '先确定整段共用的视觉风格和生成约束，再编辑序列内每个镜头。'

const CARD_TITLE_BY_TYPE: Partial<Record<ICard['type'], string>> = {
  timing: '鏃堕暱',
  subject: '涓讳綋',
  action: '鍔ㄤ綔',
  scene: '鍦烘櫙',
  style: '椋庢牸',
  camera: '闀滃ご',
  lighting: '鐏厜',
  audio: '闊抽',
  constraint: '绾︽潫'
}

const textFromCodes = (codes: number[]): string => String.fromCharCode(...codes)

const mojibakePattern = (codes: number[], suffix = ''): RegExp =>
  new RegExp(`^${textFromCodes(codes)}${suffix}$`)

const REPAIR_TEXT_RULES: Array<[RegExp, string]> = [
  [mojibakePattern([37832, 57412, 25057, 37722, 23945, 12301, 37929], '\\??\\s*(\\d*)'), '鏈懡鍚嶉」鐩?$1'],
  [mojibakePattern([37714, 21979, 26245, 26916, 22317, 27952], '\\s*(\\d*)'), '鍒嗛暅椤圭洰 $1'],
  [mojibakePattern([37719, 26330, 37340, 38336, 28355, 12372, 25652, 24531, 22442]), DEFAULT_SEQUENCE_NAME],
  [mojibakePattern([37711, 22562, 8216, 28729, 27693, 26275, 23048, 38747, 21473, 37922, 12583, 27537, 29785, 21978, 59214, 26891, 24226, 29304, 37724, 23680, 25939, 37812, 24878, 23475, 37833, 29122, 32029, 37712, 23943, 32042, 26440, 25117, 31789, 37714, 26944, 21812, 23011, 24526, 37340, 38336, 28355, 12372, 37510, 63]), DEFAULT_SEQUENCE_DESCRIPTION],
  [mojibakePattern([37827, 22549, 26289]), '鏃堕暱'],
  [mojibakePattern([28051, 35763, 32139]), '涓讳綋'],
  [mojibakePattern([37716, 12580, 32148]), '鍔ㄤ綔'],
  [mojibakePattern([37734, 28888, 27353]), '鍦烘櫙'],
  [mojibakePattern([26891, 24226, 29304]), '椋庢牸'],
  [mojibakePattern([38336, 28355, 12372]), '闀滃ご'],
  [mojibakePattern([37903, 57882, 21404]), '鐏厜'],
  [mojibakePattern([38346, 25277, 58742]), '闊抽'],
  [mojibakePattern([32510, 65085, 28523]), '绾︽潫']
]

export const repairDisplayText = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  for (const [pattern, replacement] of REPAIR_TEXT_RULES) {
    if (pattern.test(value)) {
      return value.replace(pattern, replacement).trim()
    }
  }
  return value
}

const normalizeCard = (card: ICard): ICard => {
  const repairedTitle = repairDisplayText(card.title)
  const defaultTitle = CARD_TITLE_BY_TYPE[card.type]
  return {
    ...card,
    title: repairedTitle || defaultTitle || card.title
  }
}

export const normalizePage = (page: IPage): IPage => ({
  ...page,
  cards: Array.isArray(page.cards) ? page.cards.map(normalizeCard) : []
})

export const createStoryboardRow = (index = 0, timestamp = Date.now()): IStoryboardRow => ({
  id: `${timestamp}-${index}`,
  cutLabel: `Cut ${index + 1}`,
  timeRange: '',
  subject: '',
  action: '',
  scene: '',
  camera: '',
  lighting: '',
  audio: '',
  duration: '',
  createdAt: timestamp,
  updatedAt: timestamp
})

export const createStoryboardSequence = (index = 0, timestamp = Date.now()): IStoryboardSequence => {
  const firstRow = createStoryboardRow(0, timestamp)
  return {
    id: `${timestamp}-sequence-${index}`,
    name: DEFAULT_SEQUENCE_NAME,
    description: DEFAULT_SEQUENCE_DESCRIPTION,
    style: '',
    constraints: '',
    rows: [firstRow],
    createdAt: timestamp,
    updatedAt: timestamp,
    meta: {}
  }
}

export const createStoryboardProject = (timestamp = Date.now()): IStoryboardProject => {
  const firstSequence = createStoryboardSequence(0, timestamp)
  return {
    aspectRatio: '16:9',
    sequences: [firstSequence],
    selectedSequenceId: firstSequence.id,
    selectedRowId: firstSequence.rows[0]?.id || null,
    meta: {}
  }
}

const createThreeStageSection = (timestamp = Date.now()): IThreeStageSection => ({
  fields: {},
  focusedFieldId: null,
  updatedAt: timestamp,
  meta: {}
})

export const createThreeStageProject = (timestamp = Date.now()): IThreeStageProject => {
  const page = createDefaultThreeStagePage(timestamp)
  return syncThreeStageLegacyFields({
    character: createThreeStageSection(timestamp),
    storyboard: createThreeStageSection(timestamp),
    videoPrompt: createThreeStageSection(timestamp),
    selectedStage: 'character',
    selectedFieldId: 'characterNotes',
    pages: [page],
    selectedPageId: page.id,
    selectedFormId: null,
    selectedPairId: null,
    meta: {}
  })
}

const normalizeStoryboardSequence = (sequence: Partial<IStoryboardSequence>, index = 0, timestamp = Date.now()): IStoryboardSequence => {
  const rows = Array.isArray(sequence.rows) && sequence.rows.length > 0
    ? sequence.rows
    : [createStoryboardRow(0, timestamp)]

  return {
    id: sequence.id || `${timestamp}-sequence-${index}`,
    name: repairDisplayText(sequence.name) || DEFAULT_SEQUENCE_NAME,
    description: repairDisplayText(sequence.description) || DEFAULT_SEQUENCE_DESCRIPTION,
    style: sequence.style || '',
    constraints: sequence.constraints || '',
    rows,
    createdAt: sequence.createdAt || timestamp,
    updatedAt: sequence.updatedAt || timestamp,
    meta: sequence.meta || {}
  }
}

const normalizeStoryboard = (storyboard: IStoryboardProject | undefined): IStoryboardProject | undefined => {
  if (!storyboard) return undefined

  const timestamp = Date.now()
  const legacyRows = Array.isArray(storyboard.rows) && storyboard.rows.length > 0
    ? storyboard.rows
    : [createStoryboardRow(0, timestamp)]
  const sequences = Array.isArray(storyboard.sequences) && storyboard.sequences.length > 0
    ? storyboard.sequences.map((sequence, index) => normalizeStoryboardSequence(sequence, index, timestamp))
    : [
        normalizeStoryboardSequence({
          name: DEFAULT_SEQUENCE_NAME,
          description: DEFAULT_SEQUENCE_DESCRIPTION,
          style: storyboard.sequenceStyle || '',
          constraints: storyboard.sequenceConstraints || '',
          rows: legacyRows,
          createdAt: legacyRows[0]?.createdAt || timestamp,
          updatedAt: legacyRows[0]?.updatedAt || timestamp
        }, 0, timestamp)
      ]

  const selectedSequence = sequences.find(sequence => sequence.id === storyboard.selectedSequenceId) || sequences[0]
  const selectedRow = selectedSequence.rows.find(row => row.id === storyboard.selectedRowId) || selectedSequence.rows[0]

  return {
    aspectRatio: storyboard.aspectRatio || '16:9',
    sequences,
    selectedSequenceId: selectedSequence.id,
    selectedRowId: selectedRow?.id || null,
    meta: storyboard.meta || {}
  }
}

const normalizeThreeStageSection = (section: Partial<IThreeStageSection> | undefined, timestamp = Date.now()): IThreeStageSection => ({
  fields: section?.fields && typeof section.fields === 'object' ? section.fields : {},
  focusedFieldId: section?.focusedFieldId || null,
  updatedAt: section?.updatedAt || timestamp,
  meta: section?.meta || {}
})

const normalizeThreeStage = (threeStage: IThreeStageProject | undefined): IThreeStageProject | undefined => {
  if (!threeStage) return undefined

  const timestamp = Date.now()
  const selectedStage: ThreeStageKey = ['character', 'storyboard', 'videoPrompt'].includes(threeStage.selectedStage)
    ? threeStage.selectedStage
    : 'character'

  const base = {
    character: normalizeThreeStageSection(threeStage.character, timestamp),
    storyboard: normalizeThreeStageSection(threeStage.storyboard, timestamp),
    videoPrompt: normalizeThreeStageSection(threeStage.videoPrompt, timestamp),
    selectedStage,
    selectedFieldId: threeStage.selectedFieldId || 'characterNotes',
    pages: normalizeThreeStagePages(threeStage, timestamp),
    selectedPageId: threeStage.selectedPageId || null,
    selectedFormId: threeStage.selectedFormId || null,
    selectedPairId: threeStage.selectedPairId || null,
    meta: threeStage.meta || {}
  }

  return syncThreeStageLegacyFields(base)
}

export const normalizeProject = (project: IPromptProject): IPromptProject => ({
  ...project,
  title: repairDisplayText(project.title) || project.title,
  type: project.type || 'card',
  revision: project.revision || 1,
  pages: Array.isArray(project.pages) ? project.pages.map(normalizePage) : [],
  currentPage: project.currentPage || 0,
  storyboard: normalizeStoryboard(project.storyboard),
  threeStage: project.type === 'three-stage'
    ? normalizeThreeStage(project.threeStage) || createThreeStageProject(project.createdAt || Date.now())
    : normalizeThreeStage(project.threeStage),
  meta: project.meta || {}
})

export const sortProjects = (projects: IPromptProject[]): IPromptProject[] =>
  [...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || b.updatedAt - a.updatedAt)

export const mergeProjects = (browserProjects: IPromptProject[], fileProjects: IPromptProject[]): IPromptProject[] => {
  const byId = new Map<string, IPromptProject>()

  for (const project of [...fileProjects, ...browserProjects]) {
    const normalized = normalizeProject(project)
    const existing = byId.get(normalized.id)
    if (!existing || normalized.updatedAt >= existing.updatedAt) {
      byId.set(normalized.id, normalized)
    }
  }

  return sortProjects([...byId.values()])
}
