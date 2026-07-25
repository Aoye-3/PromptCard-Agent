import { describe, expect, it } from 'vitest'
import type { ModelCatalogEntry } from '@/domain/models/model-management'
import {
  imageSizeCapabilitiesFromModel,
  recommendedImageSizeSettings,
  validateImageSizeSettings,
  type ImageSizeCapabilities
} from './size-validation'

const testSizeCapabilities: ImageSizeCapabilities = {
  modelId: 'image-model',
  resolutions: ['1K', '2K'],
  aspectRatios: ['smart', '1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9', 'custom'],
  customSize: {
    minPixels: 921_600,
    maxPixels: 4_624_220,
    minAspectRatio: 1 / 16,
    maxAspectRatio: 16
  }
}

const validationCodes = (
  settings: Parameters<typeof validateImageSizeSettings>[0]
) => validateImageSizeSettings(settings, testSizeCapabilities)
  .map(error => error.code)

describe('image size validation', () => {
  it('uses every ratio and resolution from the selected catalog model', () => {
    expect(testSizeCapabilities).toEqual({
      modelId: 'image-model',
      resolutions: ['1K', '2K'],
      aspectRatios: ['smart', '1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9', 'custom'],
      customSize: {
        minPixels: 921_600,
        maxPixels: 4_624_220,
        minAspectRatio: 1 / 16,
        maxAspectRatio: 16
      }
    })
    expect(testSizeCapabilities.resolutions).not.toContain('4K')
  })

  it.each([
    'smart', '1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'
  ])('accepts the %s preset', aspectRatio => {
    expect(validationCodes({ resolution: '2K', aspectRatio })).toEqual([])
  })

  it('rejects a resolution outside the selected model manifest', () => {
    expect(validationCodes({ resolution: '4K', aspectRatio: '1:1' })).toEqual([
      'unsupported_resolution'
    ])
  })

  it('accepts inclusive custom pixel and aspect-ratio boundaries', () => {
    expect(validationCodes({
      resolution: '1K',
      aspectRatio: 'custom',
      width: 3_840,
      height: 240
    })).toEqual([])
    expect(validationCodes({
      resolution: '2K',
      aspectRatio: 'custom',
      width: 240,
      height: 3_840
    })).toEqual([])
    expect(validationCodes({
      resolution: '2K',
      aspectRatio: 'custom',
      width: 2_830,
      height: 1_634
    })).toEqual([])
  })

  it.each([
    [{ width: 1_199, height: 768 }, 'custom_pixel_count_out_of_range'],
    [{ width: 4_625, height: 1_000 }, 'custom_pixel_count_out_of_range'],
    [{ width: 3_856, height: 240 }, 'custom_aspect_ratio_out_of_range'],
    [{ width: 240, height: 3_856 }, 'custom_aspect_ratio_out_of_range'],
    [{ width: 1_200.5, height: 768 }, 'invalid_custom_dimensions']
  ] as const)('rejects invalid custom dimensions %o', (dimensions, expectedCode) => {
    expect(validationCodes({
      resolution: '1K',
      aspectRatio: 'custom',
      ...dimensions
    })).toContain(expectedCode)
  })

  it('requires both custom dimensions', () => {
    expect(validationCodes({ resolution: '1K', aspectRatio: 'custom', width: 1_200 })).toEqual([
      'missing_custom_dimensions'
    ])
  })

  it('recommends the first supported non-custom setting after a model switch', () => {
    expect(recommendedImageSizeSettings({
      modelId: 'model-one-k-square',
      resolutions: ['1K'],
      aspectRatios: ['1:1'],
      customSize: null
    })).toEqual({ resolution: '1K', aspectRatio: '1:1' })
  })

  it('does not recommend an incomplete custom-only default', () => {
    expect(recommendedImageSizeSettings({
      modelId: 'custom-only',
      resolutions: ['1K'],
      aspectRatios: ['custom'],
      customSize: testSizeCapabilities.customSize
    })).toBeNull()
  })

  it('derives size capabilities from a provider-neutral catalog entry', () => {
    const model: ModelCatalogEntry = {
      id: 'fake-size-model',
      providerId: 'fake-provider',
      displayName: 'Fake size model',
      modality: 'image',
      capabilities: {
        resolutions: ['1K'],
        aspectRatios: ['1:1'],
        customSize: null
      }
    }

    expect(imageSizeCapabilitiesFromModel(model)).toEqual({
      modelId: 'fake-size-model',
      resolutions: ['1K'],
      aspectRatios: ['1:1'],
      customSize: null
    })
    expect(imageSizeCapabilitiesFromModel({
      ...model,
      id: 'incomplete-size-model',
      capabilities: { resolutions: ['1K'] }
    })).toBeNull()
  })
})
