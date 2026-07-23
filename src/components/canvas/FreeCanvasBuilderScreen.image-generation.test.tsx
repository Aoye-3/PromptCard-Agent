import { Fragment, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPromptProject } from '@/models/PromptHistory.model'
import {
  createFreeCanvasImageGenerationPlaceholder,
  createFreeCanvasProject
} from '@/domain/free-canvas/free-canvas-project'

const mocks = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  listConnections: vi.fn(),
  listAssignments: vi.fn(),
  getImageGenerationStatus: vi.fn(),
  getConversations: vi.fn(),
  getConversationRuns: vi.fn(),
  getRunById: vi.fn(),
  getPendingPlacements: vi.fn(),
  markPlacementPlaced: vi.fn(),
  requestGeneration: vi.fn()
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
vi.mock('@/services/image-generation-client', async importOriginal => {
  const original = await importOriginal<typeof import('@/services/image-generation-client')>()
  return { ...original, requestImageGeneration: mocks.requestGeneration }
})
vi.mock('@/storage/storage-service-client', async importOriginal => {
  const original = await importOriginal<typeof import('@/storage/storage-service-client')>()
  return {
    ...original,
    storageServiceClient: {
      ...original.storageServiceClient,
      imageGenerationConversations: {
        ...original.storageServiceClient.imageGenerationConversations,
        getPage: mocks.getConversations,
        getRuns: mocks.getConversationRuns
      },
      imageGenerationRuns: {
        ...original.storageServiceClient.imageGenerationRuns,
        getById: mocks.getRunById
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

const configureReadyImageModel = () => {
  mocks.getCatalog.mockResolvedValue({
    providers: [],
    models: [{
      id: 'seedream-model',
      providerId: 'volcengine-ark',
      modality: 'image',
      displayName: 'Seedream'
    }]
  })
  mocks.listConnections.mockResolvedValue([{
    id: 'ark-primary',
    providerId: 'volcengine-ark',
    displayName: 'Ark',
    apiBase: 'https://ark.example',
    enabled: true,
    credentialConfigured: true,
    createdAt: 1,
    updatedAt: 1,
    lastTest: { ok: true, checkedAt: 1, message: 'ok' }
  }])
  mocks.listAssignments.mockResolvedValue([{
    slot: 'image.primary',
    connectionId: 'ark-primary',
    modelId: 'seedream-model'
  }])
  mocks.getImageGenerationStatus.mockResolvedValue({
    serverEnabled: true,
    checkedAt: 1,
    credentialStore: { available: true },
    providers: [{ providerId: 'volcengine-ark', status: 'ready' }]
  })
}

const openImageGenerationPanel = (renderer: ReturnType<typeof create>) => {
  const switcher = renderer.root.findByProps({ 'data-free-canvas-panel-switcher': true })
  act(() => switcher.findAllByType('button')[1].props.onClick())
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
    mocks.getConversationRuns.mockResolvedValue({ runs: [], nextCursor: null })
    mocks.getRunById.mockResolvedValue(null)
    mocks.getPendingPlacements.mockResolvedValue([])
    mocks.requestGeneration.mockResolvedValue({
      runId: 'image-run-0123456789abcdef0123456789abcdef',
      state: 'succeeded',
      assetId: 'asset-output.png',
      captureId: 'capture-output',
      contentType: 'image/png',
      width: 1024,
      height: 1024
    })
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
    expect(renderer.root.findAllByType('aside').some(node => (
      String(node.props.className).includes('w-[456px]')
    ))).toBe(true)
    expect(renderer.root.findAll(node => (
      typeof node.props.className === 'string' && node.props.className.includes('pr-[456px]')
    ))).not.toHaveLength(0)

    const imageTab = renderer.root.findAllByType('button').find(button => (
      button.findAll(node => node.type === 'span' && node.children.includes('图片生成')).length > 0
    ))!
    act(() => imageTab.props.onClick())
    expect(renderer.root.findByProps({ 'data-free-canvas-image-generation-panel': true })).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps an empty prompt quiet while leaving generation disabled', async () => {
    configureReadyImageModel()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <FreeCanvasBuilderScreen
          activeProject={{ id: 'project-a', title: 'Project A' } as IPromptProject}
          freeCanvas={createFreeCanvasProject(1)}
          imageGenerationNodeV1
          onBack={vi.fn()}
          onRenameProject={vi.fn()}
          onSave={vi.fn()}
          onChange={vi.fn()}
        />
      )
    })

    openImageGenerationPanel(renderer)
    expect(renderer.root.findAllByType('details')).toHaveLength(0)
    expect(renderer.root.findByProps({ type: 'submit' }).props.disabled).toBe(true)
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

  it('creates and saves a movable placeholder before starting the provider request', async () => {
    configureReadyImageModel()
    const onChange = vi.fn()
    let finishPlaceholderSave: ((saved: boolean) => void) | undefined
    const onPersistCanvas = vi.fn()
      .mockImplementationOnce(() => new Promise<boolean>(resolve => { finishPlaceholderSave = resolve }))
      .mockResolvedValue(true)
    let finishGeneration: ((result: Record<string, unknown>) => void) | undefined
    mocks.requestGeneration.mockImplementation(() => new Promise(resolve => { finishGeneration = resolve }))
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(
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
    openImageGenerationPanel(renderer)
    const prompt = renderer.root.findByProps({ 'aria-label': '图片描述' })
    await act(async () => {
      prompt.props.onChange({ target: { value: 'A red apple', selectionStart: 11 } })
      await Promise.resolve()
    })
    expect(renderer.root.findByProps({ type: 'submit' }).props.disabled).toBe(false)
    const form = renderer.root.findAllByType('form')[0]
    await act(async () => {
      form.props.onSubmit({ preventDefault: vi.fn() })
      await Promise.resolve()
    })

    const placeholderCanvas = onChange.mock.calls[0][0]
    const placeholder = placeholderCanvas.nodes[0]
    expect(placeholder).toMatchObject({
      id: expect.stringMatching(/^free-image-generation-image-run-[0-9a-f]{32}$/),
      width: 320,
      height: 320,
      meta: { generationState: 'running' }
    })
    expect(onPersistCanvas).toHaveBeenCalledWith(placeholderCanvas)
    expect(mocks.requestGeneration).not.toHaveBeenCalled()

    await act(async () => {
      finishPlaceholderSave?.(true)
      await Promise.resolve()
    })
    expect(mocks.requestGeneration).toHaveBeenCalledWith(expect.objectContaining({
      runId: placeholder.meta.generationRunId
    }))

    await act(async () => {
      finishGeneration?.({
        runId: placeholder.meta.generationRunId,
        state: 'succeeded',
        assetId: 'asset-output.png',
        captureId: 'capture-output',
        contentType: 'image/png',
        width: 1024,
        height: 1024
      })
      await Promise.resolve()
    })
  })

  it('does not start the provider request when placeholder persistence fails', async () => {
    configureReadyImageModel()
    const onChange = vi.fn()
    const onPersistCanvas = vi.fn().mockResolvedValue(false)
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
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
    openImageGenerationPanel(renderer)
    const prompt = renderer.root.findByProps({ 'aria-label': '图片描述' })
    await act(async () => {
      prompt.props.onChange({ target: { value: 'A red apple', selectionStart: 11 } })
      await Promise.resolve()
    })
    expect(renderer.root.findByProps({ type: 'submit' }).props.disabled).toBe(false)
    await act(async () => {
      renderer.root.findAllByType('form')[0].props.onSubmit({ preventDefault: vi.fn() })
      await Promise.resolve()
    })

    expect(mocks.requestGeneration).not.toHaveBeenCalled()
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0].nodes[0]).toMatchObject({
      meta: { generationState: 'failed', generationErrorCode: 'storage_write_failed' }
    })
  })

  it('hydrates an existing generation node in place before marking the placement', async () => {
    const runId = 'image-run-0123456789abcdef0123456789abcdef'
    const placeholder = createFreeCanvasImageGenerationPlaceholder({
      runId,
      conversationId: 'conversation-1',
      prompt: 'A red apple',
      position: { x: 450, y: 330 },
      width: 480,
      height: 270
    })
    const onChange = vi.fn()
    const onPersistCanvas = vi.fn().mockResolvedValue(true)
    mocks.getRunById.mockResolvedValue({ id: runId, state: 'running', outputAssetIds: [] })
    mocks.getPendingPlacements.mockResolvedValue([{
      runId,
      projectId: 'project-a',
      conversationId: 'conversation-1',
      assetId: 'asset-output.png',
      state: 'pending',
      createdAt: 1,
      updatedAt: 1
    }])

    await act(async () => {
      create(
        <FreeCanvasBuilderScreen
          activeProject={{ id: 'project-a', title: 'Project A' } as IPromptProject}
          freeCanvas={createFreeCanvasProject(1, { nodes: [placeholder] })}
          imageGenerationNodeV1
          onBack={vi.fn()}
          onRenameProject={vi.fn()}
          onSave={vi.fn()}
          onChange={onChange}
          onPersistCanvas={onPersistCanvas}
        />
      )
    })

    const hydratedCanvas = onPersistCanvas.mock.calls.find(call => call[0].nodes[0]?.assetId === 'asset-output.png')?.[0]
    expect(hydratedCanvas.nodes).toHaveLength(1)
    expect(hydratedCanvas.nodes[0]).toMatchObject({
      id: placeholder.id,
      position: { x: 450, y: 330 },
      width: 480,
      height: 270,
      assetId: 'asset-output.png',
      meta: { generationState: 'succeeded', generatedResult: true }
    })
    expect(mocks.markPlacementPlaced).toHaveBeenCalledWith(runId, placeholder.id)
  })

  it('restores a persisted running node as failed when the stored run failed', async () => {
    const runId = 'image-run-fedcba9876543210fedcba9876543210'
    const placeholder = createFreeCanvasImageGenerationPlaceholder({
      runId,
      conversationId: 'conversation-1',
      prompt: 'A red apple',
      position: { x: 100, y: 120 },
      width: 320,
      height: 320
    })
    mocks.getRunById.mockResolvedValue({
      id: runId,
      state: 'failed',
      outputAssetIds: [],
      error: { code: 'rate_limited', message: 'provider detail', retryable: true }
    })
    const onChange = vi.fn()
    const onPersistCanvas = vi.fn().mockResolvedValue(true)

    await act(async () => {
      create(
        <FreeCanvasBuilderScreen
          activeProject={{ id: 'project-a', title: 'Project A' } as IPromptProject}
          freeCanvas={createFreeCanvasProject(1, { nodes: [placeholder] })}
          imageGenerationNodeV1
          onBack={vi.fn()}
          onRenameProject={vi.fn()}
          onSave={vi.fn()}
          onChange={onChange}
          onPersistCanvas={onPersistCanvas}
        />
      )
    })

    const reconciledNode = onChange.mock.calls[onChange.mock.calls.length - 1][0].nodes[0]
    expect(reconciledNode).toMatchObject({
      id: placeholder.id,
      position: placeholder.position,
      meta: { generationState: 'failed', generationErrorCode: 'rate_limited' }
    })
    expect(reconciledNode.meta).not.toHaveProperty('providerMessage')
    expect(onPersistCanvas).toHaveBeenCalled()
  })
})
