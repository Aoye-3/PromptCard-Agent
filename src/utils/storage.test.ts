import { beforeEach, describe, expect, test, vi } from 'vitest'
import localforage from 'localforage'
import { storage } from './storage'
import { storageServiceClient } from '@/storage/storage-service-client'
import type { IPreset } from '@/models/Card.model'
import type { IPromptProject } from '@/models/PromptHistory.model'

vi.mock('localforage', () => {
  const store = new Map<string, unknown>()

  return {
    default: {
      config: vi.fn(),
      getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      setItem: vi.fn((key: string, value: unknown) => {
        store.set(key, value)
        return Promise.resolve(value)
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key)
        return Promise.resolve()
      }),
      clear: vi.fn(() => {
        store.clear()
        return Promise.resolve()
      })
    }
  }
})

const sampleProject: IPromptProject = {
  id: 'project-1',
  title: 'Project',
  type: 'three-stage',
  revision: 1,
  pages: [],
  currentPage: 0,
  createdAt: 1,
  updatedAt: 2,
  lastOpenedAt: 2,
  meta: {}
}

const samplePreset: IPreset = {
  id: 'preset-1',
  type: 'subject',
  revision: 1,
  category: 'scene',
  label: 'Preset',
  content: 'Preset content',
  usageCount: 0,
  meta: {}
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await localforage.clear()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url === '/storage-api/projects') {
      return jsonResponse(init?.method === 'POST' ? sampleProject : { projects: [sampleProject] })
    }
    if (url === '/storage-api/projects/project-1') {
      return jsonResponse(init?.method === 'PUT' ? { ...sampleProject, title: 'Renamed', revision: 2 } : sampleProject)
    }
    if (url === '/storage-api/projects/trash') {
      return jsonResponse(init?.method === 'GET' ? { items: [] } : { ok: true, projects: [sampleProject] })
    }
    if (url === '/storage-api/projects/trash/restore') {
      return jsonResponse({ projects: [sampleProject] })
    }
    if (url === '/storage-api/presets') {
      return jsonResponse(init?.method === 'POST' ? samplePreset : { presets: [samplePreset] })
    }
    if (url === '/storage-api/presets/preset-1') {
      return jsonResponse(init?.method === 'PUT' ? { ...samplePreset, revision: 2 } : samplePreset)
    }
    if (url === '/storage-api/presets/preset-1/increment-usage') {
      return jsonResponse({ ...samplePreset, usageCount: 1, revision: 2 })
    }
    if (url === '/storage-api/presets/reorder') {
      return jsonResponse({ presets: [samplePreset] })
    }
    if (url === '/storage-api/presets/batch') {
      return jsonResponse({ presets: [samplePreset] })
    }
    if (url === '/storage-api/presets/trash') {
      return jsonResponse(init?.method === 'GET' ? { items: [] } : { ok: true, presets: [samplePreset] })
    }
    if (url === '/storage-api/migrations/browser-cache') {
      return jsonResponse({ projects: 0, presets: 0 })
    }
    return jsonResponse({}, 404)
  })
})

describe('storage service facade', () => {
  test('loads projects from storage API without persisting projects to localforage', async () => {
    await expect(storage.projects.getAll()).resolves.toMatchObject([sampleProject])

    expect(fetch).toHaveBeenCalledWith('/storage-api/projects', expect.any(Object))
    expect(localforage.setItem).not.toHaveBeenCalledWith('projects', expect.anything())
  })

  test('updates projects with the current revision through the storage API', async () => {
    await storage.projects.update('project-1', { title: 'Renamed' })

    expect(fetch).toHaveBeenCalledWith('/storage-api/projects/project-1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ revision: 1, updates: { title: 'Renamed' } })
    }))
  })

  test('updates projects with a provided revision without loading the project first', async () => {
    await storage.projects.update('project-1', { title: 'Renamed' }, { revision: 7 })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/storage-api/projects/project-1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ revision: 7, updates: { title: 'Renamed' } })
    }))
  })

  test('sets last opened with provided project state without refetching projects', async () => {
    await storage.projects.setLastOpened('project-1', { projects: [sampleProject], revision: 1 })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/storage-api/projects/project-1', expect.objectContaining({
      method: 'PUT'
    }))
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String(init?.body))).toMatchObject({
      revision: 1,
      updates: {
        lastOpenedAt: expect.any(Number),
        updatedAt: expect.any(Number)
      }
    })
  })

  test('loads presets from storage API without browser preset fallback or seed writes', async () => {
    await expect(storage.presets.getAll()).resolves.toEqual([samplePreset])

    expect(fetch).toHaveBeenCalledWith('/storage-api/presets', expect.any(Object))
    expect(localforage.setItem).not.toHaveBeenCalledWith('presets', expect.anything())
  })

  test('moves projects and presets to trash through storage API', async () => {
    await expect(storage.projects.trash(['project-1'])).resolves.toMatchObject([sampleProject])
    await storage.presets.trash(['preset-1'])

    expect(fetch).toHaveBeenCalledWith('/storage-api/projects/trash', expect.objectContaining({ method: 'POST' }))
    expect(fetch).toHaveBeenCalledWith('/storage-api/presets/trash', expect.objectContaining({ method: 'POST' }))
  })

  test('returns moved and restored projects from project trash operations', async () => {
    await expect(storage.projects.delete('project-1')).resolves.toMatchObject([sampleProject])
    await expect(storage.projects.restore(['project-1'])).resolves.toMatchObject([sampleProject])

    expect(fetch).toHaveBeenCalledWith('/storage-api/projects/trash', expect.objectContaining({ method: 'POST' }))
    expect(fetch).toHaveBeenCalledWith('/storage-api/projects/trash/restore', expect.objectContaining({ method: 'POST' }))
  })

  test('creates a single preset without rewriting existing presets', async () => {
    await storage.presets.create({
      ...samplePreset,
      id: 'preset-new',
      label: 'New preset'
    })

    expect(fetch).toHaveBeenCalledWith('/storage-api/presets', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        ...samplePreset,
        id: 'preset-new',
        label: 'New preset'
      })
    }))
    expect(fetch).not.toHaveBeenCalledWith('/storage-api/presets/preset-1', expect.objectContaining({ method: 'PUT' }))
  })

  test('uses one atomic request when replacing the prompt library', async () => {
    await storage.presets.saveAll([samplePreset])

    expect(fetch).toHaveBeenCalledWith('/storage-api/presets/batch', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ presets: [samplePreset] })
    }))
  })

  test('exposes structured storage errors without matching message text', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      detail: { code: 'service_version_incompatible', message: 'Upgrade required' }
    }, 503))

    await expect(storageServiceClient.projects.getAll()).rejects.toMatchObject({
      status: 503,
      code: 'service_version_incompatible',
      message: 'Upgrade required'
    })
  })

  test('keeps prompt history snapshots unique in browser UI cache', async () => {
    const pages = [{ id: 'page-1', cards: [] }]
    await storage.history.addSnapshot({ content: 'A prompt', pages, cards: [] })
    await storage.history.addSnapshot({ content: 'A prompt', pages, cards: [] })
    await storage.history.addSnapshot({ content: 'Another prompt', pages, cards: [] })

    const history = await storage.history.getAll()

    expect(history).toHaveLength(2)
    expect(history[0].content).toBe('Another prompt')
  })

  test('persists three-stage template settings in user settings meta', async () => {
    const saved = await storage.settings.save({
      meta: {
        threeStageTemplates: {
          videoPrompt: {
            negativePrompt: 'No text or arrows.'
          }
        }
      }
    })
    const loaded = await storage.settings.get()

    expect(saved.meta.threeStageTemplates.videoPrompt.negativePrompt).toBe('No text or arrows.')
    expect(loaded.meta.threeStageTemplates.videoPrompt.negativePrompt).toBe('No text or arrows.')
  })
})

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response
}
