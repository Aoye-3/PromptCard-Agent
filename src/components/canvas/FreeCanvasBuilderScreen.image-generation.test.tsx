import { Fragment, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPromptProject } from '@/models/PromptHistory.model'
import {
  createFreeCanvasImageGenerationPlaceholder,
  createFreeCanvasImageNodeFromMedia,
  createFreeCanvasProject,
  createFreeCanvasTextNode
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
  prepareGeneration: vi.fn(),
  requestGeneration: vi.fn()
}))

vi.mock('@xyflow/react', () => {
  const PassThrough = ({ children }: { children?: ReactNode }) => <Fragment>{children}</Fragment>
  const reactFlow = {
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y })
  }
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
    applyNodeChanges: (
      changes: Array<{ id: string; type: string; dimensions?: { width: number; height: number } }>,
      nodes: Array<{ id: string; measured?: { width: number; height: number } }>
    ) => nodes.map(node => {
      const dimensions = changes.find(change => change.id === node.id && change.type === 'dimensions')?.dimensions
      return dimensions ? { ...node, measured: dimensions } : node
    }),
    useReactFlow: () => reactFlow,
    useStore: (selector: (state: { nodes: unknown[]; transform: [number, number, number] }) => unknown) => selector({ nodes: [], transform: [0, 0, 1] })
  }
})

vi.mock('@/components/AgentCollaborationPanel', () => ({
  AIChatbotBox: ({ draftRequest }: { draftRequest?: { content: string } }) => (
    <div data-agent-panel data-agent-draft={draftRequest?.content || ''} />
  )
}))
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
  return {
    ...original,
    prepareImageGenerationBatch: mocks.prepareGeneration,
    requestImageGeneration: mocks.requestGeneration
  }
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
import { ImageGenerationConversationPanel } from './image-generation/ImageGenerationConversationPanel'

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

const promptEditorWithText = (text: string) => ({
  childNodes: [{ nodeType: 3, textContent: text }],
  contains: () => false
})

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

const storedImageGenerationRun = (overrides: Record<string, unknown> = {}) => ({
  id: 'run-latest',
  projectId: 'project-a',
  conversationId: 'conversation-latest',
  connectionId: 'ark-primary',
  providerId: 'volcengine-ark',
  modelId: 'seedream-model',
  state: 'succeeded' as const,
  requestSnapshot: {
    mode: 'generate',
    promptOptimization: 'standard' as const,
    promptDocument: { version: 1, segments: [{ type: 'text' as const, text: 'Remember this image request' }] },
    inputAssets: [],
    regions: [],
    resolution: '2K',
    aspectRatio: '1:1',
    outputFormat: 'png',
    watermark: false
  },
  outputAssetIds: ['asset-latest'],
  createdAt: 20,
  finishedAt: 30,
  ...overrides
})

const openImageGenerationPanel = (renderer: ReturnType<typeof create>) => {
  const switcher = renderer.root.findByProps({ 'data-free-canvas-panel-switcher': true })
  act(() => switcher.findAllByType('button')[1].props.onClick())
}

describe('project-level free canvas image generation entry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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
    mocks.prepareGeneration.mockImplementation(async members => members.map((member: { runId: string }) => ({
      runId: member.runId,
      state: 'queued'
    })))
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

  it('resumes the most recently updated image conversation in the main panel', async () => {
    mocks.getConversations.mockResolvedValue({
      conversations: [
        {
          id: 'conversation-latest', projectId: 'project-a', title: 'Latest image conversation',
          createdAt: 10, updatedAt: 30, turnCount: 1
        },
        {
          id: 'conversation-older', projectId: 'project-a', title: 'Older image conversation',
          createdAt: 1, updatedAt: 5, turnCount: 1
        }
      ],
      nextCursor: null
    })
    mocks.getConversationRuns.mockResolvedValue({ runs: [storedImageGenerationRun()], nextCursor: null })

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

    const panel = renderer.root.findByType(ImageGenerationConversationPanel)
    expect(mocks.getConversationRuns).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-a',
      conversationId: 'conversation-latest'
    }))
    expect(panel.props.conversationLabel).toBe('Latest image conversation')
    expect(panel.props.turns).toEqual([
      expect.objectContaining({ id: 'run-latest', prompt: 'Remember this image request' })
    ])
  })

  it('keeps an explicitly new conversation blank when history finishes loading later', async () => {
    let resolveConversations!: (value: {
      conversations: Array<Record<string, unknown>>
      nextCursor: null
    }) => void
    mocks.getConversations.mockReturnValue(new Promise(resolve => {
      resolveConversations = resolve
    }))

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
    act(() => renderer.root.findByType(ImageGenerationConversationPanel).props.onNewConversation())

    await act(async () => {
      resolveConversations({
        conversations: [{
          id: 'conversation-latest', projectId: 'project-a', title: 'Latest image conversation',
          createdAt: 10, updatedAt: 30, turnCount: 1
        }],
        nextCursor: null
      })
      await Promise.resolve()
    })

    const panel = renderer.root.findByType(ImageGenerationConversationPanel)
    expect(panel.props.turns).toEqual([])
    expect(mocks.getConversationRuns).not.toHaveBeenCalled()
  })

  it('adds an image directly to the Composer when 作为参考 is clicked without opening a workbench', async () => {
    const imageNode = createFreeCanvasImageNodeFromMedia({
      id: 'reference-source',
      kind: 'imageAsset',
      title: '产品参考图',
      position: { x: 120, y: 160 },
      width: 320,
      height: 240,
      assetId: 'asset-reference.png',
      imageUrl: '/storage-api/assets/asset-reference.png',
      meta: {}
    })
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <FreeCanvasBuilderScreen
          activeProject={{ id: 'project-a', title: 'Project A' } as IPromptProject}
          freeCanvas={createFreeCanvasProject(1, {
            nodes: [imageNode],
            selectedNodeId: imageNode.id
          })}
          imageGenerationNodeV1
          onBack={vi.fn()}
          onRenameProject={vi.fn()}
          onSave={vi.fn()}
          onChange={vi.fn()}
        />
      )
    })

    const getImageNodeData = () => renderer.root.find(candidate => (
      Array.isArray(candidate.props.nodes) && candidate.props.nodes[0]?.data?.onImageCommand
    )).props.nodes[0].data

    act(() => getImageNodeData().onImageCommand(imageNode.id, 'as-reference'))

    expect(renderer.root.findAllByProps({ 'aria-label': '查看图1 产品参考图' })).toHaveLength(1)
    expect(renderer.root.findByProps({ 'data-free-canvas-image-generation-panel': true })).toBeTruthy()
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0)
    expect(mocks.requestGeneration).not.toHaveBeenCalled()

    act(() => getImageNodeData().onImageCommand(imageNode.id, 'as-reference'))
    expect(renderer.root.findAllByProps({ 'aria-label': '查看图1 产品参考图' })).toHaveLength(1)

    act(() => renderer.root.findByProps({
      'aria-label': '从参考图列表移除图1 产品参考图'
    }).props.onClick({ stopPropagation: vi.fn() }))

    expect(renderer.root.findAllByProps({ 'aria-label': '查看图1 产品参考图' })).toHaveLength(0)
    expect(getImageNodeData()).toBeTruthy()
    expect(mocks.requestGeneration).not.toHaveBeenCalled()
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

  it('preserves measured node dimensions when canvas selection changes', async () => {
    const node = createFreeCanvasTextNode('Measured node', { x: 120, y: 160 }, 1)
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <FreeCanvasBuilderScreen
          activeProject={{ id: 'project-a', title: 'Project A' } as IPromptProject}
          freeCanvas={createFreeCanvasProject(1, { nodes: [node] })}
          imageGenerationNodeV1
          onBack={vi.fn()}
          onRenameProject={vi.fn()}
          onSave={vi.fn()}
          onChange={vi.fn()}
        />
      )
    })

    const getReactFlow = () => renderer.root.find(candidate => (
      typeof candidate.props.onNodesChange === 'function' && Array.isArray(candidate.props.nodes)
    ))
    const initialSelectionHandler = getReactFlow().props.onSelectionChange

    act(() => getReactFlow().props.onNodesChange([{
      id: node.id,
      type: 'dimensions',
      dimensions: { width: 420, height: 180 }
    }]))
    expect(getReactFlow().props.nodes[0].measured).toEqual({ width: 420, height: 180 })

    act(() => getReactFlow().props.onSelectionChange({
      nodes: [getReactFlow().props.nodes[0]],
      edges: []
    }))

    expect(getReactFlow().props.onSelectionChange).toBe(initialSelectionHandler)
    expect(getReactFlow().props.nodes[0].measured).toEqual({ width: 420, height: 180 })
  })

  it('deletes the selected text node with Backspace outside text editing', async () => {
    const node = createFreeCanvasTextNode('Delete me', { x: 120, y: 160 }, 1)
    const onChange = vi.fn()
    const canvas = {
      ...createFreeCanvasProject(1, { nodes: [node] }),
      selectedNodeId: node.id
    }
    vi.stubGlobal('HTMLElement', class HTMLElement {})

    await act(async () => {
      create(
        <FreeCanvasBuilderScreen
          activeProject={{ id: 'project-a', title: 'Project A' } as IPromptProject}
          freeCanvas={canvas}
          imageGenerationNodeV1
          onBack={vi.fn()}
          onRenameProject={vi.fn()}
          onSave={vi.fn()}
          onChange={onChange}
        />
      )
    })
    onChange.mockClear()

    const keydownHandlers = vi.mocked(window.addEventListener).mock.calls
      .filter(([eventName]) => eventName === 'keydown')
      .map(([, handler]) => handler as EventListener)
    const event = {
      key: 'Backspace',
      target: null,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn()
    } as unknown as KeyboardEvent

    act(() => keydownHandlers.forEach(handler => handler(event)))

    expect(event.preventDefault).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      nodes: [],
      selectedNodeId: null
    }))
  })

  it('opens the compact text-node menu and stages completion in the Agent composer', async () => {
    const node = createFreeCanvasTextNode('待补全的文字节点', { x: 120, y: 160 }, 1)
    const canvas = {
      ...createFreeCanvasProject(1, { nodes: [node] }),
      selectedNodeId: node.id
    }
    const onChange = vi.fn()
    vi.stubGlobal('HTMLElement', class HTMLElement {})
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(
        <FreeCanvasBuilderScreen
          activeProject={{ id: 'project-a', title: 'Project A' } as IPromptProject}
          freeCanvas={canvas}
          imageGenerationNodeV1
          onBack={vi.fn()}
          onRenameProject={vi.fn()}
          onSave={vi.fn()}
          onChange={onChange}
        />
      )
    })
    onChange.mockClear()

    const reactFlow = renderer.root.find(candidate => (
      typeof candidate.props.onNodeContextMenu === 'function' && Array.isArray(candidate.props.nodes)
    ))
    act(() => reactFlow.props.onNodeContextMenu({
      preventDefault: vi.fn(),
      clientX: 240,
      clientY: 180,
      currentTarget: null
    }, reactFlow.props.nodes[0]))

    const menu = renderer.root.findByProps({ 'aria-label': '文字节点菜单' })
    const labels = menu.findAllByType('button').map(button => button.findAllByType('span')[1]?.children[0])
    expect(labels).toEqual(expect.arrayContaining(['复制', '补全', '删除']))
    expect(onChange).not.toHaveBeenCalled()

    const complete = menu.findAllByType('button').find(button => (
      button.findAllByType('span').some(span => span.children.includes('补全'))
    ))!
    act(() => complete.props.onClick())

    expect(renderer.root.findByProps({ 'data-agent-panel': true }).props['data-agent-draft'])
      .toContain('待补全的文字节点')
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
      prompt.props.onInput({ currentTarget: promptEditorWithText('A red apple') })
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
      prompt.props.onInput({ currentTarget: promptEditorWithText('A red apple') })
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

  it('persists all multi-view placeholders and prepares all runs before any generation request', async () => {
    configureReadyImageModel()
    vi.stubGlobal('HTMLElement', class HTMLElement {})
    const source = createFreeCanvasImageNodeFromMedia({
      id: 'node-source',
      kind: 'imageAsset',
      title: 'Source',
      position: { x: 100, y: 120 },
      width: 320,
      height: 320,
      assetId: 'asset-source.png',
      imageUrl: '/storage-api/assets/asset-source.png',
      imagePrompt: '',
      sourceNodeId: null,
      generatedFromAgent: false,
      crop: null,
      text: '',
      color: '#111827',
      meta: {}
    })
    const canvas = {
      ...createFreeCanvasProject(1, { nodes: [source] }),
      selectedNodeId: source.id
    }
    const onChange = vi.fn()
    const onPersistCanvas = vi.fn().mockResolvedValue(true)
    mocks.prepareGeneration.mockRejectedValue(new Error('storage unavailable'))
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(
        <FreeCanvasBuilderScreen
          activeProject={{ id: 'project-a', title: 'Project A' } as IPromptProject}
          freeCanvas={canvas}
          imageGenerationNodeV1
          onBack={vi.fn()}
          onRenameProject={vi.fn()}
          onSave={vi.fn()}
          onChange={onChange}
          onPersistCanvas={onPersistCanvas}
        />
      )
    })
    const reactFlow = renderer.root.find(candidate => (
      typeof candidate.props.onNodeContextMenu === 'function' && Array.isArray(candidate.props.nodes)
    ))
    await act(async () => {
      reactFlow.props.nodes[0].data.onImageCommand(source.id, 'multi-view')
      await Promise.resolve()
    })
    const dialog = renderer.root.findByProps({ 'data-image-operation-workbench': 'multi-view' })
    await act(async () => {
      dialog.findByType('textarea').props.onChange({ target: { value: 'Keep the same product identity' } })
    })
    const generate = dialog.findByProps({ 'aria-label': 'Generate 3' })
    await act(async () => {
      generate.props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    const persistedGroup = onPersistCanvas.mock.calls[0][0]
    const placeholders = persistedGroup.nodes.filter((node: { meta: { generationRunId?: string } }) => (
      Boolean(node.meta.generationRunId)
    ))
    expect(placeholders).toHaveLength(3)
    expect(mocks.prepareGeneration).toHaveBeenCalledWith(expect.arrayContaining(
      placeholders.map((node: { meta: { generationRunId: string } }) => expect.objectContaining({
        runId: node.meta.generationRunId
      }))
    ))
    expect(onPersistCanvas.mock.invocationCallOrder[0]).toBeLessThan(mocks.prepareGeneration.mock.invocationCallOrder[0])
    expect(mocks.requestGeneration).not.toHaveBeenCalled()
    const failedGroup = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(failedGroup.nodes.filter((node: { meta: { generationState?: string } }) => (
      node.meta.generationState === 'failed'
    ))).toHaveLength(3)
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
    expect(mocks.requestGeneration).not.toHaveBeenCalled()
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

  it('resumes an authorized queued multi-view member once from its immutable snapshot', async () => {
    const runId = 'image-run-0123456789abcdef0123456789abcdef'
    const placeholder = createFreeCanvasImageGenerationPlaceholder({
      runId,
      conversationId: `image-operation-${runId}`,
      prompt: 'front view',
      position: { x: 100, y: 120 },
      width: 320,
      height: 320
    })
    const queuedRun = storedImageGenerationRun({
      id: runId,
      nodeId: 'node-source',
      conversationId: undefined,
      state: 'queued',
      outputAssetIds: [],
      requestSnapshot: {
        mode: 'edit',
        promptOptimization: 'standard',
        promptDocument: { version: 1, segments: [{ type: 'text', text: 'front view' }] },
        inputAssets: [{
          referenceId: 'source', role: 'source-image', assetId: 'asset-provider',
          sourceAssetId: 'asset-original', order: 0
        }],
        regions: [],
        resolution: '2K',
        aspectRatio: '1:1',
        outputFormat: 'png',
        watermark: false,
        operation: {
          operation: 'multi-view',
          recipeId: 'multi-view/product-turntable',
          recipeVersion: '1',
          source: {
            nodeId: 'node-source', originalAssetId: 'asset-original',
            canvasAssetId: 'asset-canvas', providerAssetId: 'asset-provider'
          },
          preservationIntents: ['keep identity'],
          parameters: { view: 'front' },
          operationGroupId: 'group-1',
          operationItemId: 'item-1',
          viewSpec: 'front'
        }
      }
    })
    mocks.getRunById.mockResolvedValue(queuedRun)
    mocks.requestGeneration.mockResolvedValue({
      runId,
      state: 'succeeded',
      assetId: 'asset-resumed.png',
      captureId: 'capture-resumed',
      contentType: 'image/png',
      width: 1024,
      height: 1024
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
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mocks.requestGeneration).toHaveBeenCalledTimes(1)
    expect(mocks.requestGeneration).toHaveBeenCalledWith(expect.objectContaining({
      runId,
      nodeId: 'node-source',
      operation: expect.objectContaining({
        operation: 'multi-view',
        operationGroupId: 'group-1',
        viewSpec: 'front'
      })
    }))
    const completedCanvas = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(completedCanvas.nodes).toHaveLength(1)
    expect(completedCanvas.nodes[0].id).toBe(placeholder.id)
  })
})
