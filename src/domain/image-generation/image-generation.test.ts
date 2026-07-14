import { describe, expect, test } from 'vitest'
import {
  SEEDREAM_5_PRO_IMAGE_CAPABILITIES,
  validateImageGenerationIntent,
  type ImageGenerationIntent
} from './image-generation'

const validIntent: ImageGenerationIntent = {
  mode: 'generate',
  prompt: 'A paper-cut city at sunrise',
  resolution: '1K',
  referenceImages: [],
  outputCount: 1
}

const validationCodes = (intent: ImageGenerationIntent) =>
  validateImageGenerationIntent(intent, SEEDREAM_5_PRO_IMAGE_CAPABILITIES)
    .map(error => error.code)

describe('image generation domain', () => {
  test('defines the exact Seedream 5.0 Pro capability manifest', () => {
    expect(SEEDREAM_5_PRO_IMAGE_CAPABILITIES).toEqual({
      modelId: 'doubao-seedream-5-0-pro-260628',
      modes: ['generate', 'edit', 'region-edit'],
      maxReferenceImages: 10,
      mentionStrategy: 'ordered-image-labels',
      regionInputs: ['point', 'bbox'],
      resolutions: ['1K', '2K'],
      outputCount: 1,
      streaming: false
    })
  })

  test('accepts a supported image generation intent', () => {
    expect(validationCodes(validIntent)).toEqual([])
  })

  test('rejects a blank prompt with a stable code', () => {
    expect(validationCodes({ ...validIntent, prompt: '   ' })).toEqual(['missing_prompt'])
  })

  test('rejects more than ten reference images', () => {
    const referenceImages = Array.from({ length: 11 }, (_, index) => ({ id: `reference-${index}` }))

    expect(validationCodes({ ...validIntent, referenceImages })).toEqual(['too_many_references'])
  })

  test('accepts exactly ten reference images', () => {
    const referenceImages = Array.from({ length: 10 }, (_, index) => ({ id: `reference-${index}` }))

    expect(validationCodes({ ...validIntent, referenceImages })).toEqual([])
  })

  test('rejects an unsupported generation mode', () => {
    const intent = { ...validIntent, mode: 'unsupported' } as unknown as ImageGenerationIntent

    expect(validationCodes(intent)).toEqual(['unsupported_mode'])
  })

  test('rejects an unsupported resolution', () => {
    expect(validationCodes({ ...validIntent, resolution: '4K' })).toEqual(['unsupported_resolution'])
  })

  test.each([0, 2])('rejects output count %s when the manifest requires one output', outputCount => {
    expect(validationCodes({ ...validIntent, outputCount })).toEqual(['unsupported_output_count'])
  })

  test('rejects region-edit without a source image', () => {
    expect(validationCodes({
      ...validIntent,
      mode: 'region-edit',
      regions: [{ type: 'point', x: 0.25, y: 0.75 }]
    })).toEqual(['missing_source_image'])
  })

  test('rejects region-edit without a point or bbox region', () => {
    expect(validationCodes({
      ...validIntent,
      mode: 'region-edit',
      sourceImage: { id: 'source-image' },
      regions: []
    })).toEqual(['missing_region'])
  })

  test('accepts point and bbox region inputs', () => {
    expect(validationCodes({
      ...validIntent,
      mode: 'region-edit',
      sourceImage: { id: 'source-image' },
      regions: [
        { type: 'point', x: 0.25, y: 0.75 },
        { type: 'bbox', x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
      ]
    })).toEqual([])
  })
})
