import type { FreeCanvasImageAspectRatio } from '@/models/PromptHistory.model'
import { SEEDREAM_5_PRO_IMAGE_CAPABILITIES } from './image-generation'

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

const SEEDREAM_ASPECT_RATIOS: readonly FreeCanvasImageAspectRatio[] = [
  'smart',
  '1:1',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
  '3:2',
  '2:3',
  '21:9',
  'custom'
]

export const SEEDREAM_5_PRO_SIZE_CAPABILITIES: ImageSizeCapabilities = {
  modelId: SEEDREAM_5_PRO_IMAGE_CAPABILITIES.modelId,
  resolutions: SEEDREAM_5_PRO_IMAGE_CAPABILITIES.resolutions,
  aspectRatios: SEEDREAM_ASPECT_RATIOS,
  customSize: {
    minPixels: 921_600,
    maxPixels: 4_624_220,
    minAspectRatio: 1 / 16,
    maxAspectRatio: 16
  }
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

export const imageSizeCapabilitiesForModel = (
  modelId: string
): ImageSizeCapabilities | null => (
  modelId === SEEDREAM_5_PRO_SIZE_CAPABILITIES.modelId
    ? SEEDREAM_5_PRO_SIZE_CAPABILITIES
    : null
)
