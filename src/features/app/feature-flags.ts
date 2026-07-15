import type { IUserSettings } from '@/models/UserSettings.model'

export const imageGenerationNodeV1Enabled = (
  settings: IUserSettings,
  rolloutDefault = developmentRolloutDefault()
): boolean => {
  const featureFlags = settings.meta?.featureFlags
  const persisted = featureFlags && typeof featureFlags === 'object'
    ? featureFlags.imageGenerationNodeV1
    : undefined
  return typeof persisted === 'boolean' ? persisted : rolloutDefault
}

const developmentRolloutDefault = (): boolean => Boolean(
  (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV
)
