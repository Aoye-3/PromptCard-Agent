import { describe, expect, it } from 'vitest'
import type { IUserSettings } from '@/models/UserSettings.model'
import { imageGenerationNodeV1Enabled } from './feature-flags'

const settings = (meta: IUserSettings['meta']): IUserSettings => ({
  theme: 'light', defaultMode: 'learn', autoSave: true, autoSaveIdleSeconds: 10, presetSort: 'usage', meta
})

describe('imageGenerationNodeV1 feature flag', () => {
  it('uses the environment rollout default until an explicit persisted boolean overrides it', () => {
    expect(imageGenerationNodeV1Enabled(settings({}), true)).toBe(true)
    expect(imageGenerationNodeV1Enabled(settings({}), false)).toBe(false)
    expect(imageGenerationNodeV1Enabled(settings({ featureFlags: { imageGenerationNodeV1: 'true' } }), true)).toBe(true)
    expect(imageGenerationNodeV1Enabled(settings({ featureFlags: { imageGenerationNodeV1: false } }), true)).toBe(false)
    expect(imageGenerationNodeV1Enabled(settings({ featureFlags: { imageGenerationNodeV1: true } }), false)).toBe(true)
  })
})
