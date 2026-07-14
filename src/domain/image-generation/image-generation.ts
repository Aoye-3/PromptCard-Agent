export type ImageGenerationMode = 'generate' | 'edit' | 'region-edit'
export type ImageMentionStrategy = 'ordered-image-labels'
export type ImageRegionInputType = 'point' | 'bbox'

export interface ImageInput {
  id: string
}

export interface ImagePointRegion {
  type: 'point'
  x: number
  y: number
}

export interface ImageBoundingBoxRegion {
  type: 'bbox'
  x: number
  y: number
  width: number
  height: number
}

export type ImageRegion = ImagePointRegion | ImageBoundingBoxRegion

export interface ImageCapabilityManifest {
  modelId: string
  modes: readonly ImageGenerationMode[]
  maxReferenceImages: number
  mentionStrategy: ImageMentionStrategy
  regionInputs: readonly ImageRegionInputType[]
  resolutions: readonly string[]
  outputCount: number
  streaming: boolean
}

export interface ImageGenerationIntent {
  mode: ImageGenerationMode
  prompt: string
  resolution: string
  referenceImages: readonly ImageInput[]
  outputCount: number
  sourceImage?: ImageInput
  regions?: readonly ImageRegion[]
}

export type ImageGenerationValidationErrorCode =
  | 'missing_prompt'
  | 'unsupported_mode'
  | 'too_many_references'
  | 'unsupported_resolution'
  | 'unsupported_output_count'
  | 'missing_source_image'
  | 'missing_region'

export interface ImageGenerationValidationError {
  code: ImageGenerationValidationErrorCode
}

export const SEEDREAM_5_PRO_IMAGE_CAPABILITIES: ImageCapabilityManifest = {
  modelId: 'doubao-seedream-5-0-pro-260628',
  modes: ['generate', 'edit', 'region-edit'],
  maxReferenceImages: 10,
  mentionStrategy: 'ordered-image-labels',
  regionInputs: ['point', 'bbox'],
  resolutions: ['1K', '2K'],
  outputCount: 1,
  streaming: false
}

export const validateImageGenerationIntent = (
  intent: ImageGenerationIntent,
  capabilities: ImageCapabilityManifest
): ImageGenerationValidationError[] => {
  const errors: ImageGenerationValidationError[] = []

  if (!intent.prompt.trim()) errors.push({ code: 'missing_prompt' })
  if (!capabilities.modes.includes(intent.mode)) errors.push({ code: 'unsupported_mode' })
  if (intent.referenceImages.length > capabilities.maxReferenceImages) {
    errors.push({ code: 'too_many_references' })
  }
  if (!capabilities.resolutions.includes(intent.resolution)) {
    errors.push({ code: 'unsupported_resolution' })
  }
  if (intent.outputCount !== capabilities.outputCount) {
    errors.push({ code: 'unsupported_output_count' })
  }

  if (intent.mode === 'region-edit') {
    if (!intent.sourceImage) errors.push({ code: 'missing_source_image' })
    const hasSupportedRegion = intent.regions?.some(region => capabilities.regionInputs.includes(region.type))
    if (!hasSupportedRegion) errors.push({ code: 'missing_region' })
  }

  return errors
}
