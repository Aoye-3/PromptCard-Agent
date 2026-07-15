import { Fragment, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPromptProject } from '@/models/PromptHistory.model'
import { createFreeCanvasProject } from '@/domain/free-canvas/free-canvas-project'

const mocks = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  listConnections: vi.fn(),
  listAssignments: vi.fn(),
  getImageGenerationStatus: vi.fn(),
  getConversations: vi.fn(),
  getPendingPlacements: vi.fn(),
  markPlacementPlaced: vi.fn()
}))

vi.mock('@xyflow/react', () => {
  const PassThrough = ({ children }: { children?: ReactNode }) => <Fragment>{children}</Fragment>
  return {
    Background: () => null,
    BackgroundVariant: { Lines: 'lines' },
    Controls: () => null,
    Handle: () => null,
    MiniMap: () => null,
    NodeResizer: () => null,
    NodeToolbar: PassThrough,
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    ReactFlow: PassThrough,
    ReactFlowProvider: PassThrough,
    SelectionMode: { Partial: 'partial' },
    applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
    useReactFlow: () => ({ screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }) }),
    useStore: (selector: (state: { nodes: unknown[]; transform: [number, number, number] }) => unknown) => selector({ nodes: [], transform: [0, 0, 1] })
  }
})

vi.mock('@/components/AgentCollaborationPanel', () => ({ AIChatbotBox: () => <div data-agent-panel /> }))
vi.mock('@/components/PromptLibraryPreviewMode', () => ({ PromptLibraryPreviewPanel: () => <div data-prompt-panel /> }))
vi.mock('@/components/prompt-media/PromptPresetPreviewDialog', () => ({ PromptPresetPreviewDialog: () => null }))
vi.mock('@/components/canvas/ImageCropEditor', () => ({ ImageCropEditor: () => null }))
vi.mock('@/i18n', () => ({ useI18n: () => ({ cardTypeLabel: (value: string) => value }) }))
vi.mock('@/stores/preset.store', () => ({
  usePresetStore: () => ({
    presets: [], initialized: true, init: vi.fn(), addPreset: vi.fn(), updatePreset: vi.fn(), deletePreset: vi.fn()
  })
}))
vi.mock('@/services/model-management-client', () => ({
  modelManagementClient: {
    getCatalog: mocks.getCatalog,
    listConnections: mocks.listConnections,
    listAssignments: mocks.listAssignments,
    getImageGenerationStatus: mocks.getImageGenerationStatus
  }
}))
vi.mock('@/storage/storage-service-client', async importOriginal => {
  const original = await importOriginal<typeof import('@/storage/storage-service-client')>()
  return {
    ...original,
    storageServiceClient: {
      ...original.storageServiceClient,
      imageGenerationConversations: {
        ...original.storageServiceClient.imageGenerationConversations,
        getPage: mocks.getConversations,
        getRuns: vi.fn().mockResolvedValue({ runs: [], nextCursor: null })
      },
      imageGenerationPlacements: {
        ...original.storageServiceClient.imageGenerationPlacements,
        getPending: mocks.getPendingPlacements,
        markPlaced: mocks.markPlacementPlaced
      }
    }
  }
})

import { CanvasBottomToolbar, FreeCanvasBuilderScreen } from './FreeCanvasBuilderScreen'

const baseProps = {
  quickDrawerOpen: false,
  quickPresets: [],
  onCreateText: vi.fn(),
  onCreateImage: vi.fn(),
  onToggleQuickDrawer: vi.fn(),
  onOpenQuickPresetComposer: vi.fn(),
  onEditQuickPreset: vi.fn(),
  onUseQuickPreset: vi.fn()
}

describe('project-level free canvas image generation entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', {
      addEventListener: vi.fn(), removeEventListener: vi.fn(), setTimeout, clearTimeout,
      innerWidth: 1200, innerHeight: 800
    })
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn(), activeElement: null })
    mocks.getCatalog.mockResolvedValue({ providers: [], models: [] })
    mocks.listConnections.mockResolvedValue([])
    mocks.listAssignments.mockResolvedValue([])
    mocks.getImageGenerationStatus.mockResolvedValue({ serverEnabled: false, checkedAt: 1, credentialStore: { available: true }, providers: [] })
    mocks.getConversations.mockResolvedValue({ conversations: [], nextCursor: null })
    mocks.getPendingPlacements.mockResolvedValue([])
  })

  it('uses the toolbar as a manual open action and never as a node drag source', () => {
    const onOpen = vi.fn()
    const markup = renderToStaticMarkup(<CanvasBottomToolbar {...baseProps} onCreateImageGenerator={onOpen} />)
    expect(markup).toContain('title="打开图片生成"')
    expect(markup).toContain('aria-label="打开图片生成"')
    expect(markup).not.toContain('draggable="true"')

    const renderer = create(<CanvasBottomToolbar {...baseProps} onCreateImageGenerator={onOpen} />)
    const button = renderer.root.findAllByType('button').find(candidate => candidate.props.title === '打开图片生成')!
    act(() => button.props.onClick())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('keeps the entry hidden when no manual open callback is supplied', () => {
    expect(renderToStaticMarkup(<CanvasBottomToolbar {...baseProps} />)).not.toContain('打开图片生成')
  })

  it('renders Agent, 图片生成 and Prompt库 as mutually exclusive peer tabs without creating a node', async () => {
    const onChange = vi.fn()
    const activeProject = { id: 'project-a', title: 'Project A' } as IPromptProject
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <FreeCanvasBuilderScreen
          activeProject={activeProject}
          freeCanvas={createFreeCanvasProject(1)}
          imageGenerationNodeV1
          onBack={vi.fn()}
          onRenameProject={vi.fn()}
          onSave={vi.fn()}
          onChange={onChange}
        />
      )
    })

    const tabLabels = renderer.root.findAll(node => node.type === 'span').flatMap(node => node.children)
    expect(tabLabels).toContain('Agent')
    expect(tabLabels).toContain('图片生成')
    expect(tabLabels).toContain('Prompt库')

    const imageTab = renderer.root.findAllByType('button').find(button => (
      button.findAll(node => node.type === 'span' && node.children.includes('图片生成')).length > 0
    ))!
    act(() => imageTab.props.onClick())
    expect(renderer.root.findByProps({ 'data-free-canvas-image-generation-panel': true })).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('persists a generated result node before marking its placement as placed', async () => {
    const onChange = vi.fn()
    const onPersistCanvas = vi.fn().mockResolvedValue(true)
    mocks.getPendingPlacements.mockResolvedValue([{
      runId: 'run-1',
      projectId: 'project-a',
      conversationId: 'conversation-1',
      assetId: 'asset-1',
      state: 'pending',
      createdAt: 1,
      updatedAt: 1
    }])

    await act(async () => {
      create(
        <FreeCanvasBuilderScreen
          activeProject={{ id: 'project-a', title: 'Project A' } as IPromptProject}
          freeCanvas={createFreeCanvasProject(1)}
          imageGenerationNodeV1
          onBack={vi.fn()}
          onRenameProject={vi.fn()}
          onSave={vi.fn()}
          onChange={onChange}
          onPersistCanvas={onPersistCanvas}
        />
      )
    })

    expect(onChange).toHaveBeenCalled()
    const persistedCanvas = onPersistCanvas.mock.calls[0][0]
    expect(persistedCanvas.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetId: 'asset-1',
        meta: expect.objectContaining({
          generationRunId: 'run-1',
          conversationId: 'conversation-1'
        })
      })
    ]))
    expect(mocks.markPlacementPlaced).toHaveBeenCalledWith('run-1', 'free-image-generation-run-1')
    expect(onPersistCanvas.mock.invocationCallOrder[0]).toBeLessThan(mocks.markPlacementPlaced.mock.invocationCallOrder[0])
  })
})
