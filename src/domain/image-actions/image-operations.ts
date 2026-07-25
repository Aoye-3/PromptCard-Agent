import type {
  ImageAnnotationInput,
  ImageModelMode,
  ImageRegionInput
} from '@/domain/models/model-management'

export type ImageProductOperation =
  | 'reference-generate'
  | 'effect-render'
  | 'global-edit'
  | 'region-redraw'
  | 'erase'
  | 'outpaint'
  | 'text-edit'
  | 'multi-view'
  | 'upscale'
  | 'subject-extract'

export type ImageOperationSupport = 'native' | 'recipe' | 'unsupported'
export type ImageOperationImplementationStatus = 'planned' | 'implemented'
export type ImageOperationQualityStatus = 'untested' | 'experimental' | 'ready'

export type ImageCapabilityRequirement =
  | { kind: 'mode'; value: ImageModelMode }
  | { kind: 'reference-count'; minimum: number }
  | { kind: 'region-input'; value: ImageRegionInput | 'mask' }
  | { kind: 'annotation-input'; value: ImageAnnotationInput }
  | { kind: 'output-count'; minimum: number }

export interface ImageOperationDefinition {
  id: ImageProductOperation
  support: ImageOperationSupport
  implementationStatus: ImageOperationImplementationStatus
  qualityStatus: ImageOperationQualityStatus
  requiredCapabilities: readonly ImageCapabilityRequirement[]
}

export interface ImageOperationSourceSnapshot {
  nodeId: string
  originalAssetId: string
  canvasAssetId: string
  providerAssetId: string
}

export interface ImageOperationRecipeSnapshot {
  operation: ImageProductOperation
  recipeId: string
  recipeVersion: string
  source: ImageOperationSourceSnapshot
  preservationIntents: string[]
  parameters: Record<string, string | number | boolean | string[]>
  operationGroupId?: string
  operationItemId?: string
  viewSpec?: string
}
