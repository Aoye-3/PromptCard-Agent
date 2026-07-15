import { Fragment, useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPromptProject, IFreeCanvasProject } from '@/models/PromptHistory.model'
import { createFreeCanvasImageGeneratorNode, createFreeCanvasProject } from '@/domain/free-canvas/free-canvas-project'

const mocks = vi.hoisted(() => ({
  listAssignments: vi.fn(),
  requestImageGeneration: vi.fn()
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
    useReactFlow: () => ({
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y })
    }),
    useStore: (selector: (state: { transform: [number, number, number] }) => unknown) => selector({ transform: [0, 0, 1] })
  }
})

vi.mock('@/components/AgentCollaborationPanel', () => ({ AIChatbotBox: () => null }))
vi.mock('@/components/PromptLibraryPreviewMode', () => ({ PromptLibraryPreviewPanel: () => null }))
vi.mock('@/components/prompt-media/PromptPresetPreviewDialog', () => ({ PromptPresetPreviewDialog: () => null }))
vi.mock('@/components/canvas/ImageCropEditor', () => ({ ImageCropEditor: () => null }))
vi.mock('@/components/canvas/image-generation/ImageGeneratorInspector', () => ({
  ImageGeneratorInspector: ({ onGenerate, onOpenHistory, node }: {
    onGenerate?: () => void
    onOpenHistory: (nodeId: string) => void
    node: { id: string }
  }) => (
    <div data-image-generator-inspector>
      <button type="button" data-builder-generate onClick={onGenerate}>Generate</button>
      <button type="button" data-builder-history onClick={() => onOpenHistory(node.id)}>History</button>
    </div>
  )
}))
vi.mock('@/components/canvas/image-generation/GenerationHistoryPanel', () => ({
  GenerationHistoryPanel: ({ projectId, nodeId }: { projectId: string; nodeId: string }) => (
    <div data-history-project={projectId} data-history-node={nodeId} />
  )
}))
vi.mock('@/i18n', () => ({ useI18n: () => ({ cardTypeLabel: (value: string) => value }) }))
vi.mock('@/stores/preset.store', () => ({
  usePresetStore: () => ({
    presets: [], initialized: true, init: vi.fn(), addPreset: vi.fn(), updatePreset: vi.fn(), deletePreset: vi.fn()
  })
}))
vi.mock('@/services/model-management-client', () => ({
  modelManagementClient: { listAssignments: mocks.listAssignments }
}))
vi.mock('@/services/image-generation-client', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/image-generation-client')>(),
  requestImageGeneration: mocks.requestImageGeneration
}))

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

const project = (id: string): IPromptProject => ({ id, title: id } as IPromptProject)

const generatorCanvas = (timestamp = 1): IFreeCanvasProject => {
  const generator = createFreeCanvasImageGeneratorNode(
    { x: 10, y: 20 },
    { connectionId: 'ark-primary', modelId: 'doubao-seedream-5-0-pro-260628' },
    timestamp
  )
  generator.id = 'shared-generator'
  generator.promptDocument = { version: 1, segments: [{ type: 'text', text: 'A glass lighthouse' }] }
  return createFreeCanvasProject(timestamp, { nodes: [generator], selectedNodeId: generator.id })
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const installBrowserEventTargets = () => {
  vi.stubGlobal('window', {
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    setTimeout, clearTimeout, innerWidth: 1200, innerHeight: 800
  })
  vi.stubGlobal('document', {
    addEventListener: vi.fn(), removeEventListener: vi.fn(), activeElement: null
  })
}

const BuilderHost = ({
  activeProject,
  initialCanvas,
  onWrite
}: {
  activeProject: IPromptProject
  initialCanvas: IFreeCanvasProject
  onWrite: (canvas: IFreeCanvasProject) => void
}) => {
  const [canvas, setCanvas] = useState(initialCanvas)
  useEffect(() => setCanvas(initialCanvas), [activeProject.id, initialCanvas])
  return (
    <FreeCanvasBuilderScreen
      activeProject={activeProject}
      freeCanvas={canvas}
      imageGenerationNodeV1
      previewMode
      onBack={vi.fn()}
      onRenameProject={vi.fn()}
      onSave={vi.fn()}
      onChange={next => {
        setCanvas(next)
        onWrite(next)
      }}
    />
  )
}

const click = (renderer: ReactTestRenderer, attribute: string) => {
  const button = renderer.root.find(node => node.type === 'button' && node.props[attribute] === true)
  act(() => button.props.onClick())
}

const mount = (element: ReactElement): ReactTestRenderer => {
  let renderer!: ReactTestRenderer
  act(() => { renderer = create(element) })
  return renderer
}

describe('free canvas image generation feature entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installBrowserEventTargets()
    mocks.listAssignments.mockResolvedValue([])
  })

  it('is hidden by default while persisted generator rendering remains independent', () => {
    expect(renderToStaticMarkup(<CanvasBottomToolbar {...baseProps} />)).not.toContain('Image generator')
  })

  it('is shown only when the feature-gated create action is supplied', () => {
    const markup = renderToStaticMarkup(
      <CanvasBottomToolbar {...baseProps} onCreateImageGenerator={vi.fn()} />
    )
    expect(markup).toContain('title="Image generator"')
  })

  it('disables the mounted create action while its single flight is busy', () => {
    const onCreateImageGenerator = vi.fn()
    const renderer = mount(
      <CanvasBottomToolbar
        {...baseProps}
        onCreateImageGenerator={onCreateImageGenerator}
        imageGeneratorCreating
      />
    )
    const button = renderer.root.findAllByType('button').find(candidate => candidate.props.title === 'Image generator')!

    expect(button.props.disabled).toBe(true)
    act(() => button.props.onClick())
    expect(onCreateImageGenerator).not.toHaveBeenCalled()
  })

  it('does not write a node when assignment loading resolves after the real builder unmounts', async () => {
    const pending = deferred<never[]>()
    mocks.listAssignments.mockReturnValue(pending.promise)
    const onWrite = vi.fn()
    const renderer = mount(
      <BuilderHost activeProject={project('project-a')} initialCanvas={createFreeCanvasProject(1)} onWrite={onWrite} />
    )
    const createButton = renderer.root.findAllByType('button').find(node => node.props.title === 'Image generator')!

    act(() => createButton.props.onClick())
    act(() => renderer.unmount())
    await act(async () => { pending.resolve([]); await pending.promise })

    expect(onWrite).not.toHaveBeenCalled()
  })

  it('does not write a completed run when the real builder unmounts', async () => {
    const pending = deferred<{ runId: string; assetId: string; captureId: string }>()
    mocks.requestImageGeneration.mockReturnValue(pending.promise)
    const onWrite = vi.fn()
    const renderer = mount(
      <BuilderHost activeProject={project('project-a')} initialCanvas={generatorCanvas()} onWrite={onWrite} />
    )

    click(renderer, 'data-builder-generate')
    onWrite.mockClear()
    act(() => renderer.unmount())
    await act(async () => {
      pending.resolve({ runId: 'run-a', assetId: 'asset-a', captureId: 'capture-a' })
      await pending.promise
    })

    expect(onWrite).not.toHaveBeenCalled()
  })

  it('invalidates a pending project A run after mounting project B with the same node id', async () => {
    const pending = deferred<{ runId: string; assetId: string; captureId: string }>()
    mocks.requestImageGeneration.mockReturnValue(pending.promise)
    const onWriteA = vi.fn()
    const onWriteB = vi.fn()
    const canvasA = generatorCanvas(1)
    const canvasB = generatorCanvas(2)
    const renderer = mount(
      <BuilderHost activeProject={project('project-a')} initialCanvas={canvasA} onWrite={onWriteA} />
    )

    click(renderer, 'data-builder-generate')
    onWriteA.mockClear()
    await act(async () => {
      renderer.update(<BuilderHost activeProject={project('project-b')} initialCanvas={canvasB} onWrite={onWriteB} />)
    })
    await act(async () => {
      pending.resolve({ runId: 'run-a', assetId: 'asset-a', captureId: 'capture-a' })
      await pending.promise
    })

    expect(onWriteA).not.toHaveBeenCalled()
    expect(onWriteB).not.toHaveBeenCalled()
  })

  it('opens history through the mounted builder inspector for the selected project and node', () => {
    const renderer = mount(
      <BuilderHost activeProject={project('project-a')} initialCanvas={generatorCanvas()} onWrite={vi.fn()} />
    )

    click(renderer, 'data-builder-history')

    expect(renderer.root.findByProps({ 'data-history-project': 'project-a' }).props['data-history-node'])
      .toBe('shared-generator')
  })
})
