import { describe, expect, it } from 'vitest'
import type { IUserSettings } from '@/models/UserSettings.model'
import { imageGenerationNodeV1Enabled } from './feature-flags'

const settings = (meta: IUserSettings['meta']): IUserSettings => ({
  theme: 'light', defaultMode: 'learn', autoSave: true, autoSaveIdleSeconds: 10, presetSort: 'usage', meta
})

describe('imageGenerationNodeV1 feature flag', () => {
  it('is closed by default and only opens for an explicit persisted boolean', () => {
    expect(imageGenerationNodeV1Enabled(settings({}))).toBe(false)
    expect(imageGenerationNodeV1Enabled(settings({ featureFlags: { imageGenerationNodeV1: 'true' } }))).toBe(false)
    expect(imageGenerationNodeV1Enabled(settings({ featureFlags: { imageGenerationNodeV1: true } }))).toBe(true)
  })
})
