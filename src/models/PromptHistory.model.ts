import type { ICard } from './Card.model'
import type { IPage } from '@/stores/card-initial-state'

export interface IPromptHistory {
  id: string
  content: string
  cards: ICard[]
  pages?: IPage[]
  title?: string
  score: number
  variants?: string[]
  createdAt: number
  meta: Record<string, any>
}

export interface IPromptProject {
  id: string
  title: string
  type: 'card' | 'storyboard' | 'three-stage'
  revision: number
  pages: IPage[]
  currentPage: number
  storyboard?: IStoryboardProject
  threeStage?: IThreeStageProject
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  meta: Record<string, any>
}

export type ThreeStageKey = 'character' | 'storyboard' | 'videoPrompt'

export interface IThreeStageProject {
  character: IThreeStageSection
  storyboard: IThreeStageSection
  videoPrompt: IThreeStageSection
  selectedStage: ThreeStageKey
  selectedFieldId: string
  meta: Record<string, any>
}

export interface IThreeStageSection {
  fields: Record<string, string>
  focusedFieldId?: string | null
  updatedAt: number
  meta: Record<string, any>
}

export interface IStoryboardProject {
  aspectRatio: '16:9' | '9:16' | '1:1'
  sequences: IStoryboardSequence[]
  selectedSequenceId?: string | null
  selectedRowId?: string | null
  meta: Record<string, any>
  /** @deprecated Legacy flat storyboard data; normalized into sequences on load. */
  sequenceStyle?: string
  /** @deprecated Legacy flat storyboard data; normalized into sequences on load. */
  sequenceConstraints?: string
  /** @deprecated Legacy flat storyboard data; normalized into sequences on load. */
  rows?: IStoryboardRow[]
}

export interface IStoryboardSequence {
  id: string
  name: string
  description: string
  style: string
  constraints: string
  rows: IStoryboardRow[]
  createdAt: number
  updatedAt: number
  meta: Record<string, any>
}

export interface IStoryboardRow {
  id: string
  cutLabel: string
  timeRange: string
  imageUrl?: string
  subject: string
  action: string
  scene: string
  camera: string
  lighting?: string
  audio?: string
  duration: string
  createdAt: number
  updatedAt: number
}
