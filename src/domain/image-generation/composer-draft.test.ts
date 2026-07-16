import { describe, expect, it } from 'vitest'
import type { PromptDocument } from '@/models/PromptHistory.model'
import {
  DEFAULT_IMAGE_GENERATION_PREFERENCES,
  moveComposerImageInput,
  removeComposerImageInput,
  switchComposerImageInputRole,
  unresolvedPromptReferenceIds,
  validateComposerCustomSize,
  validateComposerImageInputs,
  type ComposerImageInput
} from './composer-draft'

const inputs: ComposerImageInput[] = [
  {
    referenceId: 'ref-source',
    assetId: 'asset-source',
    label: 'Source',
    imageUrl: '/source.png',
    role: 'source-image',
    order: 0
  },
  {
    referenceId: 'ref-one',
    assetId: 'asset-one',
    label: 'One',
    imageUrl: '/one.png',
    role: 'reference-image',
    order: 1
  },
  {
    referenceId: 'ref-two',
    assetId: 'asset-two',
    label: 'Two',
    imageUrl: '/two.png',
    role: 'reference-image',
    order: 2
  }
]

describe('image generation composer draft inputs', () => {
  it('defaults new Seedream turns to 2K standard optimization without watermark', () => {
    expect(DEFAULT_IMAGE_GENERATION_PREFERENCES).toEqual({
      resolution: '2K',
      promptOptimization: 'standard',
      outputFormat: 'png',
      watermark: false
    })
  })

  it('switches the source role without allowing two source images', () => {
    expect(switchComposerImageInputRole(inputs, 'ref-two', 'source-image')).toEqual([
      { ...inputs[0], role: 'reference-image', order: 0 },
      inputs[1],
      { ...inputs[2], role: 'source-image' }
    ])
  })

  it('reorders inputs while preserving stable reference ids and normalized order', () => {
    expect(moveComposerImageInput(inputs, 'ref-two', -1)).toEqual([
      inputs[0],
      { ...inputs[2], order: 1 },
      { ...inputs[1], order: 2 }
    ])
  })

  it('keeps removed prompt tokens unresolved instead of silently deleting them', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [
        { type: 'text', text: 'Use ' },
        { type: 'reference', referenceId: 'ref-two', label: 'Two' }
      ]
    }
    const remaining = removeComposerImageInput(inputs, 'ref-two')

    expect(remaining.map(input => input.referenceId)).toEqual(['ref-source', 'ref-one'])
    expect(unresolvedPromptReferenceIds(document, remaining)).toEqual(['ref-two'])
  })

  it('counts the source image in the ten-image total limit', () => {
    const ten = Array.from({ length: 10 }, (_, order): ComposerImageInput => ({
      referenceId: `ref-${order}`,
      assetId: `asset-${order}`,
      label: `${order}`,
      imageUrl: `/${order}.png`,
      role: order === 0 ? 'source-image' : 'reference-image',
      order
    }))

    expect(validateComposerImageInputs(ten)).toEqual([])
    expect(validateComposerImageInputs([
      ...ten,
      { ...ten[9], referenceId: 'ref-10', assetId: 'asset-10', order: 10 }
    ])).toEqual([{ code: 'too_many_images', limit: 10 }])
  })

  it('validates Seedream custom dimensions against pixel and aspect-ratio limits', () => {
    expect(validateComposerCustomSize(1200, 1200)).toEqual([])
    expect(validateComposerCustomSize(900, 900)).toEqual(['custom_size_pixel_budget'])
    expect(validateComposerCustomSize(1600, 100)).toEqual(['custom_size_pixel_budget'])
    expect(validateComposerCustomSize(4800, 1000)).toEqual(['custom_size_pixel_budget'])
    expect(validateComposerCustomSize(3840, 240)).toEqual([])
    expect(validateComposerCustomSize(3841, 240)).toEqual(['custom_size_aspect_ratio'])
  })
})
