export interface IUserSettings {
  theme: 'light' | 'dark'
  defaultMode: 'learn' | 'creative' | 'evaluate'
  autoSave: boolean
  presetSort: 'usage' | 'name' | 'time'
  meta: Record<string, any>
}
