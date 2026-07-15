import { describe, expect, it } from 'vitest'
import {
  imageGenerationModeForWorkflow,
  migrateImageGenerationWorkflow,
  validateImageGenerationWorkflow,
  type ImageGenerationWorkflow
} from './workflow'

describe('image generation workflows', () => {
  it.each<[ImageGenerationWorkflow, string]>([
    ['text-to-image', 'generate'],
    ['reference-generate', 'generate'],
    ['smart-edit', 'edit'],
    ['region-edit', 'region-edit']
  ])('maps %s to the runtime mode %s', (workflow, mode) => {
    expect(imageGenerationModeForWorkflow(workflow)).toBe(mode)
  })

  it('migrates legacy generate nodes according to their image inputs', () => {
    expect(migrateImageGenerationWorkflow('generate', 0)).toBe('text-to-image')
    expect(migrateImageGenerationWorkflow('generate', 2)).toBe('reference-generate')
    expect(migrateImageGenerationWorkflow('edit', 1)).toBe('smart-edit')
    expect(migrateImageGenerationWorkflow('region-edit', 1)).toBe('region-edit')
  })

  it('returns explicit missing inputs for each workflow', () => {
    expect(validateImageGenerationWorkflow('text-to-image', { prompt: '', sourceImageCount: 0, imageInputCount: 0, regionCount: 0 }))
      .toEqual(['prompt'])
    expect(validateImageGenerationWorkflow('reference-generate', { prompt: 'x', sourceImageCount: 0, imageInputCount: 0, regionCount: 0 }))
      .toEqual(['reference-image'])
    expect(validateImageGenerationWorkflow('smart-edit', { prompt: 'x', sourceImageCount: 0, imageInputCount: 1, regionCount: 0 }))
      .toEqual(['source-image'])
    expect(validateImageGenerationWorkflow('region-edit', { prompt: 'x', sourceImageCount: 1, imageInputCount: 1, regionCount: 0 }))
      .toEqual(['region'])
  })
})
