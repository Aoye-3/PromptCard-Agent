import type { FreeCanvasImageAspectRatio } from '@/models/PromptHistory.model'
import type { ModelCatalogEntry } from '@/domain/models/model-management'

export interface CustomImageSizeConstraints {
  minPixels: number
  maxPixels: number
  minAspectRatio: number
  maxAspectRatio: number
}

export interface ImageSizeCapabilities {
  modelId: string
  resolutions: readonly string[]
  aspectRatios: readonly FreeCanvasImageAspectRatio[]
  customSize: CustomImageSizeConstraints | null
}

export interface ImageSizeSettings {
  resolution: string
  aspectRatio: string
  width?: number
  height?: number
}

export type ImageSizeValidationErrorCode =
  | 'unsupported_resolution'
  | 'unsupported_aspect_ratio'
  | 'custom_size_unsupported'
  | 'missing_custom_dimensions'
  | 'invalid_custom_dimensions'
  | 'custom_pixel_count_out_of_range'
  | 'custom_aspect_ratio_out_of_range'

export interface ImageSizeValidationError {
  code: ImageSizeValidationErrorCode
}

export const validateImageSizeSettings = (
  settings: ImageSizeSettings,
  capabilities: ImageSizeCapabilities
): ImageSizeValidationError[] => {
  const errors: ImageSizeValidationError[] = []

  if (!capabilities.resolutions.includes(settings.resolution)) {
    errors.push({ code: 'unsupported_resolution' })
  }
  if (!capabilities.aspectRatios.includes(settings.aspectRatio as FreeCanvasImageAspectRatio)) {
    errors.push({ code: 'unsupported_aspect_ratio' })
  }

  if (settings.aspectRatio !== 'custom') return errors
  if (!capabilities.customSize) {
    errors.push({ code: 'custom_size_unsupported' })
    return errors
  }
  if (settings.width === undefined || settings.height === undefined) {
    errors.push({ code: 'missing_custom_dimensions' })
    return errors
  }
  if (
    !Number.isInteger(settings.width)
    || !Number.isInteger(settings.height)
    || settings.width <= 0
    || settings.height <= 0
  ) {
    errors.push({ code: 'invalid_custom_dimensions' })
    return errors
  }

  const pixelCount = settings.width * settings.height
  if (pixelCount < capabilities.customSize.minPixels || pixelCount > capabilities.customSize.maxPixels) {
    errors.push({ code: 'custom_pixel_count_out_of_range' })
  }

  const aspectRatio = settings.width / settings.height
  if (
    aspectRatio < capabilities.customSize.minAspectRatio
    || aspectRatio > capabilities.customSize.maxAspectRatio
  ) {
    errors.push({ code: 'custom_aspect_ratio_out_of_range' })
  }

  return errors
}

export const recommendedImageSizeSettings = (
  capabilities: ImageSizeCapabilities
): ImageSizeSettings | null => {
  const resolution = capabilities.resolutions[0]
  const aspectRatio = capabilities.aspectRatios.find(candidate => candidate !== 'custom')
  return resolution && aspectRatio ? { resolution, aspectRatio } : null
}

export const imageSizeCapabilitiesFromModel = (
  model: ModelCatalogEntry
): ImageSizeCapabilities | null => {
  const capabilities = model.capabilities
  if (
    model.modality !== 'image'
    || !capabilities?.resolutions?.length
    || !capabilities.aspectRatios?.length
    || !capabilities.aspectRatios.every(isImageAspectRatio)
  ) {
    return null
  }
  return {
    modelId: model.id,
    resolutions: capabilities.resolutions,
    aspectRatios: capabilities.aspectRatios,
    customSize: capabilities.customSize || null
  }
}

const isImageAspectRatio = (value: string): value is FreeCanvasImageAspectRatio => (
  value === 'smart'
  || value === '1:1'
  || value === '4:3'
  || value === '3:4'
  || value === '16:9'
  || value === '9:16'
  || value === '3:2'
  || value === '2:3'
  || value === '21:9'
  || value === 'custom'
)
