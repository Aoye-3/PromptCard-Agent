import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  updateLayout: vi.fn()
}))

vi.mock('@/storage/storage-service-client', async importOriginal => {
  const original = await importOriginal<typeof import('@/storage/storage-service-client')>()
  return {
    ...original,
    storageServiceClient: {
      ...original.storageServiceClient,
      projectResources: {
        ...original.storageServiceClient.projectResources,
        getSnapshot: mocks.getSnapshot,
        updateLayout: mocks.updateLayout
      }
    }
  }
})

import { ProjectResourceLibrary } from './ProjectResourceLibrary'

const subject = {
  id: 'subject-1',
  projectId: 'project-1',
  kind: 'subject' as const,
  name: 'Hero',
  sourceAssetId: 'source-1',
  previewAssetId: 'preview-1',
  providerAssetId: 'provider-1',
  width: 640,
  height: 480,
  contentType: 'image/png',
  folderId: null,
  sortOrder: 0,
  revision: 1,
  createdAt: 1,
  updatedAt: 1
}

describe('ProjectResourceLibrary', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      innerHeight: 900,
      setTimeout: (...args: Parameters<typeof globalThis.setTimeout>) => globalThis.setTimeout(...args),
      clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => globalThis.clearTimeout(id),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
    mocks.getSnapshot.mockResolvedValue({ folders: [], resources: [subject] })
    mocks.updateLayout.mockResolvedValue({ folders: [], resources: [subject] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('uses a 44px collapsed rail and a compact three-column expanded grid', async () => {
    const onExpandedChange = vi.fn()
    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(
        <ProjectResourceLibrary
          projectId="project-1"
          expanded={false}
          onExpandedChange={onExpandedChange}
          onPlaceMaterial={vi.fn()}
          onAddSubject={vi.fn(() => ({ reason: null }))}
        />
      )
    })

    expect(renderer!.root.findByProps({ 'data-project-resource-library': true }).props.className).toContain('w-11')
    expect(onExpandedChange).toHaveBeenCalledWith(false)

    await act(async () => {
      renderer!.update(
        <ProjectResourceLibrary
          projectId="project-1"
          expanded
          onExpandedChange={onExpandedChange}
          onPlaceMaterial={vi.fn()}
          onAddSubject={vi.fn(() => ({ reason: null }))}
        />
      )
    })

    expect(renderer!.root.findByProps({ 'data-project-resource-library': true }).props.className).toContain('w-[280px]')
    expect(renderer!.root.find(node => node.props.className === 'grid grid-cols-3 gap-1.5')).toBeTruthy()
  })

  test('opens the large preview after 250ms and cancels it on leave', async () => {
    vi.useFakeTimers()
    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(
        <ProjectResourceLibrary
          projectId="project-1"
          expanded
          onExpandedChange={vi.fn()}
          onPlaceMaterial={vi.fn()}
          onAddSubject={vi.fn(() => ({ reason: null }))}
        />
      )
    })
    const card = renderer!.root.find(node => node.props.title === 'Hero' && node.props.draggable === true)
    const currentTarget = { getBoundingClientRect: () => ({ top: 120 }) }

    act(() => card.props.onMouseEnter({ currentTarget }))
    act(() => { vi.advanceTimersByTime(249) })
    expect(renderer!.root.findAllByProps({ role: 'tooltip' })).toHaveLength(0)
    act(() => { vi.advanceTimersByTime(1) })
    expect(renderer!.root.findAllByProps({ role: 'tooltip' })).toHaveLength(1)

    act(() => card.props.onMouseLeave())
    act(() => { vi.advanceTimersByTime(149) })
    expect(renderer!.root.findAllByProps({ role: 'tooltip' })).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(1) })
    expect(renderer!.root.findAllByProps({ role: 'tooltip' })).toHaveLength(0)
  })
})
