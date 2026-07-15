import type { IUserSettings } from '@/models/UserSettings.model'

export const imageGenerationNodeV1Enabled = (settings: IUserSettings): boolean => {
  const featureFlags = settings.meta?.featureFlags
  return Boolean(
    featureFlags
    && typeof featureFlags === 'object'
    && featureFlags.imageGenerationNodeV1 === true
  )
}
