export interface IUserSettings {
  theme: 'light' | 'dark'
  defaultMode: 'learn' | 'creative' | 'evaluate'
  autoSave: boolean
  autoSaveIdleSeconds: number
  presetSort: 'usage' | 'name' | 'time'
  meta: Record<string, any>
}
