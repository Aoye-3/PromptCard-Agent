import type { ImageGenerationMode } from './image-generation'

export type ImageGenerationWorkflow =
  | 'text-to-image'
  | 'reference-generate'
  | 'smart-edit'
  | 'region-edit'

export type ImageGenerationWorkflowMissingInput =
  | 'prompt'
  | 'reference-image'
  | 'source-image'
  | 'region'

export interface ImageGenerationWorkflowInputs {
  prompt: string
  sourceImageCount: number
  imageInputCount: number
  regionCount: number
}

export const imageGenerationModeForWorkflow = (
  workflow: ImageGenerationWorkflow
): ImageGenerationMode => {
  if (workflow === 'smart-edit') return 'edit'
  if (workflow === 'region-edit') return 'region-edit'
  return 'generate'
}

export const migrateImageGenerationWorkflow = (
  mode: ImageGenerationMode,
  imageInputCount: number
): ImageGenerationWorkflow => {
  if (mode === 'edit') return 'smart-edit'
  if (mode === 'region-edit') return 'region-edit'
  return imageInputCount > 0 ? 'reference-generate' : 'text-to-image'
}

export const validateImageGenerationWorkflow = (
  workflow: ImageGenerationWorkflow,
  inputs: ImageGenerationWorkflowInputs
): ImageGenerationWorkflowMissingInput[] => {
  const missing: ImageGenerationWorkflowMissingInput[] = []
  if (!inputs.prompt.trim()) missing.push('prompt')
  if (workflow === 'reference-generate' && inputs.imageInputCount < 1) missing.push('reference-image')
  if ((workflow === 'smart-edit' || workflow === 'region-edit') && inputs.sourceImageCount < 1) {
    missing.push('source-image')
  }
  if (workflow === 'region-edit' && inputs.regionCount < 1) missing.push('region')
  return missing
}
