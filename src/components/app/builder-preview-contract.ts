import type { BuilderTemplateId } from '@/domain/builder-templates/builder-templates'
import type { IFreeCanvasProject, IPromptProject, IStoryboardProject, IThreeStageProject } from '@/models/PromptHistory.model'

export interface BuilderModePreviewSnapshot {
  pages?: IPromptProject['pages']
  currentPage?: number
  storyboard?: IStoryboardProject
  threeStage?: IThreeStageProject
  freeCanvas?: IFreeCanvasProject
}

export const builderPreviewIds: BuilderTemplateId[] = ['free-canvas', 'card', 'storyboard', 'three-stage']
