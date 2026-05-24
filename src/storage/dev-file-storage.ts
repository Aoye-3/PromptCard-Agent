import type { IPreset } from '@/models/Card.model'
import type { IPromptProject } from '@/models/PromptHistory.model'
import { normalizeProject } from '@/domain/projects/project-normalization'

const PRESET_FILE_ENDPOINT = '/__promptcard/presets'
const PROJECT_FILE_ENDPOINT = '/__promptcard/projects'
const STATIC_PRESET_FILE_URL = '/prompt-library-presets.json'

export interface PresetFilePayload {
  schemaVersion: number
  updatedAt: string | null
  presets: IPreset[]
}

interface ProjectFilePayload {
  schemaVersion: number
  updatedAt: string | null
  projects: IPromptProject[]
}

export const devPresetFileStorage = {
  async getAll(): Promise<IPreset[] | null> {
    if (typeof fetch !== 'function') return null

    try {
      const response = await fetch(PRESET_FILE_ENDPOINT, {
        headers: { Accept: 'application/json' }
      })
      if (!response.ok) return null

      const data = await response.json() as PresetFilePayload
      return Array.isArray(data.presets) ? data.presets : null
    } catch {
      return null
    }
  },

  async saveAll(presets: IPreset[]): Promise<boolean> {
    if (typeof fetch !== 'function') return false

    try {
      const response = await fetch(PRESET_FILE_ENDPOINT, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ presets })
      })
      return response.ok
    } catch {
      return false
    }
  }
}

export const devProjectFileStorage = {
  async getAll(): Promise<IPromptProject[] | null> {
    if (typeof fetch !== 'function') return null

    try {
      const response = await fetch(PROJECT_FILE_ENDPOINT, {
        headers: { Accept: 'application/json' },
        cache: 'no-cache'
      })
      if (!response.ok) return null

      const data = await response.json() as ProjectFilePayload
      return Array.isArray(data.projects) ? data.projects.map(normalizeProject) : null
    } catch {
      return null
    }
  },

  async saveAll(projects: IPromptProject[]): Promise<boolean> {
    if (typeof fetch !== 'function') return false

    try {
      const response = await fetch(PROJECT_FILE_ENDPOINT, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projects })
      })
      return response.ok
    } catch {
      return false
    }
  }
}

export const staticPresetFileStorage = {
  async getPayload(): Promise<PresetFilePayload | null> {
    if (typeof fetch !== 'function') return null

    try {
      const response = await fetch(STATIC_PRESET_FILE_URL, {
        headers: { Accept: 'application/json' },
        cache: 'no-cache'
      })
      if (!response.ok) return null

      const data = await response.json() as PresetFilePayload
      return Array.isArray(data.presets) ? data : null
    } catch {
      return null
    }
  }
}
