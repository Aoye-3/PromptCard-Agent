import { beforeEach, describe, expect, test, vi } from 'vitest'
import localforage from 'localforage'
import { storage } from './storage'
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

  test('loads presets from storage API without browser preset fallback or seed writes', async () => {
    await expect(storage.presets.getAll()).resolves.toEqual([samplePreset])

    expect(fetch).toHaveBeenCalledWith('/storage-api/presets', expect.any(Object))
    expect(localforage.setItem).not.toHaveBeenCalledWith('presets', expect.anything())
  })

  test('moves projects and presets to trash through storage API', async () => {
    await storage.projects.trash(['project-1'])
    await storage.presets.trash(['preset-1'])

    expect(fetch).toHaveBeenCalledWith('/storage-api/projects/trash', expect.objectContaining({ method: 'POST' }))
    expect(fetch).toHaveBeenCalledWith('/storage-api/presets/trash', expect.objectContaining({ method: 'POST' }))
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

  test('keeps prompt history snapshots unique in browser UI cache', async () => {
    const pages = [{ id: 'page-1', cards: [] }]
    await storage.history.addSnapshot({ content: 'A prompt', pages, cards: [] })
    await storage.history.addSnapshot({ content: 'A prompt', pages, cards: [] })
    await storage.history.addSnapshot({ content: 'Another prompt', pages, cards: [] })

    const history = await storage.history.getAll()

    expect(history).toHaveLength(2)
    expect(history[0].content).toBe('Another prompt')
  })

  test('deletes and clears prompt history from browser UI cache', async () => {
    const pages = [{ id: 'page-1', cards: [] }]
    const first = await storage.history.addSnapshot({ content: 'First prompt', pages, cards: [] })
    await storage.history.addSnapshot({ content: 'Second prompt', pages, cards: [] })

    expect(first).not.toBeNull()
    if (!first) throw new Error('Expected first history snapshot')

    await storage.history.delete(first.id)
    expect((await storage.history.getAll()).map(item => item.content)).toEqual(['Second prompt'])

    await storage.history.clear()
    expect(await storage.history.getAll()).toEqual([])
  })
})

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response
}
