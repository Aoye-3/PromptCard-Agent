import type { BuilderTemplateId } from '@/domain/builder-templates/builder-templates'
import type { IPromptProject, IStoryboardProject, IThreeStageProject } from '@/models/PromptHistory.model'

export interface BuilderModePreviewSnapshot {
  pages?: IPromptProject['pages']
  currentPage?: number
  storyboard?: IStoryboardProject
  threeStage?: IThreeStageProject
}

export const builderPreviewIds: BuilderTemplateId[] = ['free-canvas', 'card', 'storyboard', 'three-stage']
