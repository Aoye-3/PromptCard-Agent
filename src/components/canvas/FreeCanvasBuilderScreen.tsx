import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent as ReactChangeEvent, type ClipboardEvent as ReactClipboardEvent, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeProps,
  type OnConnect,
  type OnNodeDrag,
  useStore,
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Bot, BookOpen, ChevronRight, Image as ImageIcon, MessageSquare, MousePointer2, Palette, Pencil, Plus, Save, Trash2, Type, X } from 'lucide-react'
import { AIChatbotBox } from '@/components/AgentCollaborationPanel'
import { PromptLibraryPreviewPanel } from '@/components/PromptLibraryPreviewMode'
import { PromptPresetPreviewDialog } from '@/components/prompt-media/PromptPresetPreviewDialog'
import { ImageCropEditor } from '@/components/canvas/ImageCropEditor'
import { canvasImageAssetUrl, getClipboardImageFiles, isFileDrag, isSupportedImageFile, uploadFreeCanvasImageFiles } from '@/components/canvas/canvas-image-assets'
import { createFreeCanvasCroppedNodes, type FreeCanvasCropLines, type FreeCanvasMediaNode } from '@/domain/free-canvas/free-canvas'
import {
  createFreeCanvasImageNodeFromMedia,
  createFreeCanvasTextNode,
  createQuickTextNode,
  replaceFreeCanvasTextRange,
  removeFreeCanvasProjectNodes,
  updateFreeCanvasNodePosition,
  updateFreeCanvasTextNodeStyle,
  updateFreeCanvasTextNodeUserText
} from '@/domain/free-canvas/free-canvas-project'
import { buildFreeCanvasWorkspaceContext } from '@/utils/agent-workspace'
import { storage } from '@/utils/storage'
import { useI18n } from '@/i18n'
import { usePresetStore } from '@/stores/preset.store'
import type { AgentWorkspaceProposal } from '@/models/Agent.model'
import type { IPreset } from '@/models/Card.model'
import type { IFreeCanvasImageNode, IFreeCanvasNode, IFreeCanvasProject, IFreeCanvasTextNode, IFreeCanvasTextSegment, IPromptProject } from '@/models/PromptHistory.model'

interface FreeCanvasBuilderScreenProps {
  activeProject: IPromptProject
  freeCanvas: IFreeCanvasProject
  onBack: () => void
  onRenameProject: () => void
  onSave: () => void
  onChange: (freeCanvas: IFreeCanvasProject) => void
  previewMode?: boolean
}

type FreeCanvasFlowNodeData = {
  canvasNode: IFreeCanvasNode
  editing: boolean
  onEdit: (nodeId: string | null) => void
  onTextRangeReplace: (nodeId: string, range: { start: number; end: number }, insertedText: string, color: string) => void
  onTextStyleChange: (nodeId: string, updates: Parameters<typeof updateFreeCanvasTextNodeStyle>[2]) => void
}

type FreeCanvasFlowNode = Node<FreeCanvasFlowNodeData>

type QuickTextPreset = {
  id: string
  name: string
  note: string
  body: string
  createdAt: number
}

type QuickTextPresetDraft = Pick<QuickTextPreset, 'name' | 'note' | 'body'>

const QUICK_TEXT_SETTINGS_KEY = 'freeCanvasQuickTextPresets'
const TEXT_COLORS = ['#111827', '#ef4423', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff']
const FONT_SIZES: IFreeCanvasTextNode['fontSize'][] = ['small', 'medium', 'large', 'extra-large', 'huge']
const emptyQuickTextPresetDraft: QuickTextPresetDraft = { name: '', note: '', body: '' }

const isTypingTarget = (target: EventTarget | null): boolean => {
  const element = target instanceof HTMLElement ? target : null
  return Boolean(element?.closest('input, textarea, [contenteditable="true"], [role="textbox"]'))
}

const imageNodeToMedia = (node: IFreeCanvasImageNode): FreeCanvasMediaNode => ({
  id: node.id,
  kind: 'imageAsset',
  title: node.title,
  position: node.position,
  width: node.width,
  height: node.height,
  assetId: node.assetId || null,
  imageUrl: node.imageUrl || '',
  imagePrompt: node.imagePrompt || '',
  sourceNodeId: node.sourceNodeId || null,
  generatedFromAgent: false,
  crop: node.crop || null,
  text: '',
  color: '#111827',
  meta: node.meta || {}
})

export const FreeCanvasBuilderScreen = (props: FreeCanvasBuilderScreenProps) => (
  <ReactFlowProvider>
    <FreeCanvasBuilderInner {...props} />
  </ReactFlowProvider>
)

const FreeCanvasBuilderInner = ({
  activeProject,
  freeCanvas,
  onBack,
  onRenameProject,
  onSave,
  onChange,
  previewMode = false
}: FreeCanvasBuilderScreenProps) => {
  const reactFlow = useReactFlow<FreeCanvasFlowNode>()
  const { cardTypeLabel } = useI18n()
  const { presets, initialized: presetsInitialized, init: initPresets } = usePresetStore()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [rightPanelMode, setRightPanelMode] = useState<'agent' | 'prompt-library'>('agent')
  const [previewPreset, setPreviewPreset] = useState<IPreset | null>(null)
  const [quickDrawerOpen, setQuickDrawerOpen] = useState(false)
  const [quickPresets, setQuickPresets] = useState<QuickTextPreset[]>([])
  const [quickComposerOpen, setQuickComposerOpen] = useState(false)
  const [quickEditingPresetId, setQuickEditingPresetId] = useState<string | null>(null)
  const [quickPresetDraft, setQuickPresetDraft] = useState<QuickTextPresetDraft>(emptyQuickTextPresetDraft)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null)
  const [fileDragActive, setFileDragActive] = useState(false)
  const [cropNodeId, setCropNodeId] = useState<string | null>(null)
  const selectedNode = freeCanvas.nodes.find(node => node.id === freeCanvas.selectedNodeId) || null
  const selectedImageNode = selectedNode?.kind === 'image' ? selectedNode : null
  const cropNode = cropNodeId
    ? freeCanvas.nodes.find((node): node is IFreeCanvasImageNode => node.id === cropNodeId && node.kind === 'image')
    : null
  const freeCanvasRef = useRef(freeCanvas)
  const selectedImageNodeRef = useRef<IFreeCanvasImageNode | null>(selectedImageNode)
  const copiedImageNodeRef = useRef<IFreeCanvasImageNode | null>(null)
  const fileDragDepthRef = useRef(0)

  useEffect(() => {
    if (!presetsInitialized) initPresets()
  }, [initPresets, presetsInitialized])

  useEffect(() => {
    freeCanvasRef.current = freeCanvas
    selectedImageNodeRef.current = selectedImageNode
  }, [freeCanvas, selectedImageNode])

  const cardTypes = useMemo(() => [
    { type: 'subject', label: cardTypeLabel('subject') },
    { type: 'action', label: cardTypeLabel('action') },
    { type: 'scene', label: cardTypeLabel('scene') },
    { type: 'style', label: cardTypeLabel('style') },
    { type: 'camera', label: cardTypeLabel('camera') },
    { type: 'lighting', label: cardTypeLabel('lighting') },
    { type: 'timing', label: cardTypeLabel('timing') },
    { type: 'audio', label: cardTypeLabel('audio') },
    { type: 'constraint', label: cardTypeLabel('constraint') },
    { type: 'custom', label: cardTypeLabel('custom') }
  ], [cardTypeLabel])

  useEffect(() => {
    let cancelled = false
    storage.settings.get().then(settings => {
      if (cancelled) return
      const raw = settings.meta?.[QUICK_TEXT_SETTINGS_KEY]
      setQuickPresets(Array.isArray(raw) ? raw.flatMap(value => {
        const preset = normalizeQuickTextPreset(value)
        return preset ? [preset] : []
      }) : [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const persistQuickPresets = useCallback(async (presets: QuickTextPreset[]) => {
    setQuickPresets(presets)
    const settings = await storage.settings.get()
    await storage.settings.save({
      meta: {
        ...settings.meta,
        [QUICK_TEXT_SETTINGS_KEY]: presets
      }
    })
  }, [])

  const setSelectedNodeId = useCallback((nodeId: string | null) => {
    onChange({ ...freeCanvas, selectedNodeId: nodeId })
  }, [freeCanvas, onChange])

  const addNode = useCallback((node: IFreeCanvasNode) => {
    onChange({
      ...freeCanvas,
      nodes: [...freeCanvas.nodes, node],
      selectedNodeId: node.id
    })
  }, [freeCanvas, onChange])

  const createText = useCallback(() => {
    const node = createFreeCanvasTextNode('', nextNodePosition(reactFlow, freeCanvas.nodes.length))
    addNode(node)
    setEditingNodeId(node.id)
  }, [addNode, freeCanvas.nodes.length, reactFlow])

  const createQuickText = useCallback((text: string) => {
    const node = createQuickTextNode(text, nextNodePosition(reactFlow, freeCanvas.nodes.length))
    addNode(node)
    setQuickDrawerOpen(false)
  }, [addNode, freeCanvas.nodes.length, reactFlow])

  const addImageFiles = useCallback(async (files: File[], position: { x: number; y: number }) => {
    const imageFiles = files.filter(isSupportedImageFile)
    if (imageFiles.length === 0) {
      setUploadError('Only PNG, JPEG, and WebP images are supported.')
      return
    }
    try {
      setUploadError(null)
      const uploaded = await uploadFreeCanvasImageFiles(imageFiles, position)
      const imageNodes = uploaded.map(node => createFreeCanvasImageNodeFromMedia(node))
      onChange({
        ...freeCanvas,
        nodes: [...freeCanvas.nodes, ...imageNodes],
        selectedNodeId: imageNodes[0]?.id || freeCanvas.selectedNodeId || null
      })
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Image upload failed.')
    }
  }, [freeCanvas, onChange])

  const createImage = useCallback(() => {
    imageInputRef.current?.click()
  }, [])

  useEffect(() => {
    if (!clipboardNotice) return
    const timeoutId = window.setTimeout(() => setClipboardNotice(null), 1600)
    return () => window.clearTimeout(timeoutId)
  }, [clipboardNotice])

  useEffect(() => {
    const handleCopy = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c' || isTypingTarget(event.target)) return
      const imageNode = selectedImageNodeRef.current
      if (!imageNode) return
      event.preventDefault()
      copiedImageNodeRef.current = imageNode
      setClipboardNotice('已复制图片节点')
    }

    const handlePaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return
      const files = getClipboardImageFiles(event.clipboardData)
      if (files.length > 0) {
        event.preventDefault()
        void addImageFiles(files, reactFlow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))
        return
      }
      const copied = copiedImageNodeRef.current
      if (!copied) return
      event.preventDefault()
      const current = freeCanvasRef.current
      const duplicate: IFreeCanvasImageNode = {
        ...copied,
        id: `free-image-copy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: `${copied.title} 副本`,
        position: { x: copied.position.x + 28, y: copied.position.y + 28 },
        crop: copied.crop ? { ...copied.crop } : null,
        meta: { ...copied.meta, duplicatedFromNodeId: copied.id }
      }
      onChange({
        ...current,
        nodes: [...current.nodes, duplicate],
        selectedNodeId: duplicate.id
      })
      setClipboardNotice('已粘贴图片节点')
    }

    window.addEventListener('keydown', handleCopy)
    document.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('keydown', handleCopy)
      document.removeEventListener('paste', handlePaste)
    }
  }, [addImageFiles, onChange, reactFlow])

  const replaceTextRange = useCallback((nodeId: string, range: { start: number; end: number }, insertedText: string, color: string) => {
    onChange(replaceFreeCanvasTextRange(freeCanvas, nodeId, range, insertedText, color))
  }, [freeCanvas, onChange])

  const updateTextStyle = useCallback((nodeId: string, updates: Parameters<typeof updateFreeCanvasTextNodeStyle>[2]) => {
    onChange(updateFreeCanvasTextNodeStyle(freeCanvas, nodeId, updates))
  }, [freeCanvas, onChange])

  const nodes = useMemo<FreeCanvasFlowNode[]>(() => freeCanvas.nodes.map(node => ({
    id: node.id,
    type: 'freeCanvasNode',
    position: node.position,
    selected: node.id === freeCanvas.selectedNodeId,
    data: {
      canvasNode: node,
      editing: editingNodeId === node.id,
      onEdit: setEditingNodeId,
      onTextRangeReplace: replaceTextRange,
      onTextStyleChange: updateTextStyle
    }
  })), [editingNodeId, freeCanvas.nodes, freeCanvas.selectedNodeId, replaceTextRange, updateTextStyle])

  const [flowNodes, setFlowNodes] = useState<FreeCanvasFlowNode[]>(nodes)
  useEffect(() => setFlowNodes(nodes), [nodes])

  const edges = useMemo<Edge[]>(() => freeCanvas.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'smoothstep',
    style: {
      stroke: edge.id === selectedEdgeId ? '#ef4423' : '#111827',
      strokeWidth: edge.id === selectedEdgeId ? 2.4 : 1.8
    }
  })), [freeCanvas.edges, selectedEdgeId])

  const workspaceContext = useMemo(() => buildFreeCanvasWorkspaceContext({
    activeProject,
    freeCanvas
  }), [activeProject, freeCanvas])

  const handleNodesChange = (changes: NodeChange<FreeCanvasFlowNode>[]) => {
    const nonRemovalChanges = changes.filter(change => change.type !== 'remove')
    if (nonRemovalChanges.length > 0) {
      setFlowNodes(current => applyNodeChanges(nonRemovalChanges, current) as FreeCanvasFlowNode[])
    }
    const removedNodeIds = changes.filter(change => change.type === 'remove').map(change => change.id)
    if (removedNodeIds.length > 0) {
      onChange(removeFreeCanvasProjectNodes(freeCanvas, removedNodeIds))
      setEditingNodeId(current => current && removedNodeIds.includes(current) ? null : current)
    }
  }

  const cancelImageCrop = () => setCropNodeId(null)

  const confirmImageCrop = (lines: FreeCanvasCropLines) => {
    if (!cropNode) return
    const croppedNodes = createFreeCanvasCroppedNodes(imageNodeToMedia(cropNode), lines)
      .map(media => createFreeCanvasImageNodeFromMedia(media))
    onChange({
      ...freeCanvas,
      nodes: [...freeCanvas.nodes, ...croppedNodes],
      selectedNodeId: croppedNodes[0]?.id || freeCanvas.selectedNodeId || null
    })
    setCropNodeId(null)
  }

  const handleNodeClick: NodeMouseHandler<FreeCanvasFlowNode> = (_event, node) => {
    setSelectedEdgeId(null)
    setSelectedNodeId(node.id)
  }

  const handleNodeDoubleClick: NodeMouseHandler<FreeCanvasFlowNode> = (_event, node) => {
    if (node.data.canvasNode.kind === 'text') setEditingNodeId(node.id)
    if (node.data.canvasNode.kind === 'image' && node.data.canvasNode.assetId && !node.data.canvasNode.crop) {
      setCropNodeId(node.data.canvasNode.id)
    }
  }

  const handleNodeDragStop: OnNodeDrag<FreeCanvasFlowNode> = (_event, node) => {
    onChange(updateFreeCanvasNodePosition(freeCanvas, node.id, node.position))
  }

  const handleConnect: OnConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const duplicate = freeCanvas.edges.some(edge => edge.source === connection.source && edge.target === connection.target)
    if (duplicate) return
    onChange({
      ...freeCanvas,
      edges: [
        ...freeCanvas.edges,
        {
          id: `free-edge-${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          createdAt: Date.now()
        }
      ]
    })
  }

  const handleEdgeClick: EdgeMouseHandler<Edge> = (_event, edge) => {
    setSelectedEdgeId(edge.id)
    setSelectedNodeId(null)
  }

  const handleDrop = async (event: ReactDragEvent<Element>) => {
    if (!isFileDrag(event.dataTransfer)) return
    fileDragDepthRef.current = 0
    setFileDragActive(false)
    event.preventDefault()
    await addImageFiles(
      Array.from(event.dataTransfer.files),
      reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    )
  }

  const handleDragEnter = (event: ReactDragEvent<Element>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    fileDragDepthRef.current += 1
    setFileDragActive(true)
  }

  const handleDragLeave = (event: ReactDragEvent<Element>) => {
    if (!isFileDrag(event.dataTransfer)) return
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
    if (fileDragDepthRef.current === 0) setFileDragActive(false)
  }

  const handleImageInputChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    void addImageFiles(files, nextNodePosition(reactFlow, freeCanvas.nodes.length))
  }

  const handleApplyAgentProposal = (proposal: AgentWorkspaceProposal) => {
    if (proposal.kind !== 'free_canvas_text_update') return
    onChange(updateFreeCanvasTextNodeUserText(freeCanvas, proposal.nodeId, proposal.userText, proposal.mode))
  }

  const createQuickPreset = async (draft: QuickTextPresetDraft) => {
    const name = draft.name.trim()
    const note = draft.note.trim()
    const body = draft.body.trim()
    if (!name || !body) return
    await persistQuickPresets([
      { id: `quick-${Date.now()}`, name, note, body, createdAt: Date.now() },
      ...quickPresets
    ])
  }

  const openQuickPresetComposer = (preset?: QuickTextPreset) => {
    if (preset) {
      setQuickEditingPresetId(preset.id)
      setQuickPresetDraft({ name: preset.name, note: preset.note, body: preset.body })
    } else {
      setQuickEditingPresetId(null)
      setQuickPresetDraft(emptyQuickTextPresetDraft)
    }
    setQuickDrawerOpen(false)
    setQuickComposerOpen(true)
  }

  const closeQuickPresetComposer = () => {
    setQuickComposerOpen(false)
    setQuickEditingPresetId(null)
    setQuickPresetDraft(emptyQuickTextPresetDraft)
  }

  const saveQuickPresetDraft = async () => {
    const name = quickPresetDraft.name.trim()
    const note = quickPresetDraft.note.trim()
    const body = quickPresetDraft.body.trim()
    if (!name || !body) return
    if (quickEditingPresetId) {
      await persistQuickPresets(quickPresets.map(preset => preset.id === quickEditingPresetId ? { ...preset, name, note, body } : preset))
    } else {
      await createQuickPreset({ name, note, body })
    }
    closeQuickPresetComposer()
  }

  const deleteQuickPresetDraft = async () => {
    if (!quickEditingPresetId) return
    await persistQuickPresets(quickPresets.filter(preset => preset.id !== quickEditingPresetId))
    closeQuickPresetComposer()
  }

  return (
    <section
      data-free-canvas-screen
      className="fixed inset-x-0 bottom-[56px] top-14 z-20 overflow-hidden bg-[#f7f8fb]"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <header className="absolute left-4 top-4 z-40 flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-2 py-2 shadow-sm">
        <ToolbarButton title="Back" onClick={onBack}><ArrowLeft className="h-4 w-4" /></ToolbarButton>
        <button type="button" className="px-3 text-left" onClick={onRenameProject}>
          <div className="text-sm font-black text-gray-950">{activeProject.title}</div>
          <div className="text-[11px] font-semibold text-gray-400">Free Canvas</div>
        </button>
        <ToolbarButton title="Save" onClick={onSave}><Save className="h-4 w-4" /></ToolbarButton>
      </header>

      <div
        className={`relative h-full transition-[padding] ${rightPanelCollapsed ? 'pr-20' : 'pr-[520px]'}`}
        onDragOver={event => {
          if (!isFileDrag(event.dataTransfer)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={handleDrop}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          deleteKeyCode={editingNodeId ? null : ['Backspace', 'Delete']}
          onNodesChange={handleNodesChange}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeDragStop={handleNodeDragStop}
          onConnect={handleConnect}
          onEdgeClick={handleEdgeClick}
          onPaneClick={() => {
            setSelectedNodeId(null)
            setSelectedEdgeId(null)
            setEditingNodeId(null)
          }}
          panOnScroll
          panOnDrag={false}
          selectionOnDrag
          autoPanOnSelection={false}
          panActivationKeyCode="Space"
          selectionMode={SelectionMode.Partial}
          fitView
          minZoom={0.2}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Lines} gap={28} size={1} color="#e2e8f0" />
          <MiniMap pannable zoomable className="!bottom-4 !left-4 !right-auto" />
          <Controls className="!bottom-6 !left-auto !right-6" />
        </ReactFlow>

        <CanvasBottomToolbar
          quickDrawerOpen={quickDrawerOpen}
          quickPresets={quickPresets}
          onCreateText={createText}
          onCreateImage={createImage}
          onToggleQuickDrawer={() => setQuickDrawerOpen(value => !value)}
          onOpenQuickPresetComposer={() => openQuickPresetComposer()}
          onEditQuickPreset={openQuickPresetComposer}
          onUseQuickPreset={createQuickText}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          tabIndex={-1}
          onChange={handleImageInputChange}
        />

        {quickComposerOpen && (
          <QuickMessageDialog
            draft={quickPresetDraft}
            editing={Boolean(quickEditingPresetId)}
            rightOffset={rightPanelCollapsed ? 80 : 520}
            onDraftChange={setQuickPresetDraft}
            onClose={closeQuickPresetComposer}
            onDelete={quickEditingPresetId ? () => { void deleteQuickPresetDraft() } : undefined}
            onSave={() => { void saveQuickPresetDraft() }}
          />
        )}

        {uploadError && (
          <div className="absolute left-1/2 top-5 z-50 -translate-x-1/2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-lg" role="alert">
            {uploadError}
          </div>
        )}
        {clipboardNotice && (
          <div className="absolute left-1/2 top-5 z-50 -translate-x-1/2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-lg" role="status">
            {clipboardNotice}
          </div>
        )}
        {fileDragActive && (
          <div className="pointer-events-none absolute inset-4 z-40 flex items-center justify-center rounded-[18px] border-2 border-dashed border-sky-300 bg-sky-50/75 text-sm font-black text-sky-700">
            松开以添加图片
          </div>
        )}
        {cropNode && (
          <ImageCropEditor
            media={imageNodeToMedia(cropNode)}
            imageUrl={cropNode.assetId ? canvasImageAssetUrl(cropNode.assetId) : cropNode.imageUrl || ''}
            onCancel={cancelImageCrop}
            onConfirm={confirmImageCrop}
          />
        )}
      </div>

      {rightPanelCollapsed ? (
        <button
          type="button"
          className="absolute bottom-6 right-6 top-6 z-40 flex w-12 flex-col items-center justify-center gap-3 rounded-[18px] border border-gray-200 bg-white/95 text-gray-500 shadow-[0_18px_55px_rgba(15,23,42,0.14)] transition hover:text-gray-950"
          onClick={() => setRightPanelCollapsed(false)}
          title="Open Agent panel"
        >
          <Bot className="h-5 w-5" />
          <span className="[writing-mode:vertical-rl] text-xs font-black uppercase tracking-wide">Agent</span>
        </button>
      ) : (
        <aside className="absolute bottom-0 right-0 top-0 z-30 flex w-[520px] flex-col overflow-hidden border-l border-gray-200 bg-white">
          <div className="shrink-0 border-b border-gray-100 px-4 py-3">
            <button type="button" className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-950" onClick={() => setRightPanelCollapsed(true)} title="Collapse Agent panel">
              <ChevronRight className="h-4 w-4" />
            </button>
            <h2 className="pr-8 text-sm font-black text-gray-950">{selectedNode?.title || 'Free Canvas'}</h2>
            <p className="mt-1 pr-8 text-[11px] leading-4 text-gray-500">Agent can read the canvas and only update user text segments on text nodes.</p>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1" data-free-canvas-panel-switcher>
              <PanelModeButton
                active={rightPanelMode === 'agent'}
                label="Agent"
                icon={<Bot className="h-3.5 w-3.5" />}
                onClick={() => setRightPanelMode('agent')}
              />
              <PanelModeButton
                active={rightPanelMode === 'prompt-library'}
                label="Prompt库"
                icon={<BookOpen className="h-3.5 w-3.5" />}
                onClick={() => setRightPanelMode('prompt-library')}
              />
            </div>
          </div>
          {rightPanelMode === 'prompt-library' ? (
            <div className="min-h-0 flex-1 p-3" data-free-canvas-prompt-library-panel>
              <PromptLibraryPreviewPanel
                presets={presets}
                cardTypes={cardTypes}
                compact
                onPreview={setPreviewPreset}
              />
            </div>
          ) : !previewMode ? (
            <AIChatbotBox
              title="Free Canvas Agent"
              mode="free-canvas-workspace"
              sessionKey={`workspace:free-canvas:${activeProject.id}`}
              workspaceContext={workspaceContext}
              onApplyWorkspaceProposal={handleApplyAgentProposal}
              compact
            />
          ) : (
            <div className="p-5 text-sm font-semibold text-gray-400">Preview mode disables Agent Runtime.</div>
          )}
          {previewPreset && (
            <PromptPresetPreviewDialog preset={previewPreset} onClose={() => setPreviewPreset(null)} />
          )}
        </aside>
      )}
    </section>
  )
}

const FreeCanvasNode = ({ data, selected }: NodeProps<FreeCanvasFlowNode>) => {
  const node = data.canvasNode
  if (node.kind === 'text') {
    return (
      <FreeCanvasTextNodeView
        node={node}
        selected={selected}
        editing={data.editing}
        onEdit={data.onEdit}
        onTextRangeReplace={data.onTextRangeReplace}
        onTextStyleChange={data.onTextStyleChange}
      />
    )
  }
  if (node.kind === 'image') {
    return <FreeCanvasImageNodeView node={node} selected={selected} />
  }
  return <FreeCanvasArrowNodeView node={node} selected={selected} />
}

const FreeCanvasTextNodeView = ({
  node,
  selected,
  editing,
  onEdit,
  onTextRangeReplace,
  onTextStyleChange
}: {
  node: IFreeCanvasTextNode
  selected: boolean
  editing: boolean
  onEdit: (nodeId: string | null) => void
  onTextRangeReplace: (nodeId: string, range: { start: number; end: number }, insertedText: string, color: string) => void
  onTextStyleChange: (nodeId: string, updates: Parameters<typeof updateFreeCanvasTextNodeStyle>[2]) => void
}) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const draftTextRef = useRef<string | null>(null)
  const caretOffsetRef = useRef<number | null>(null)
  const displayText = freeCanvasSegmentsText(node.segments)
  const userColor = userTextColor(node)
  const selectedNodeCount = useStore(state => state.nodes.filter(candidate => candidate.selected).length)

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editing || !editor) return
    const restore = (offset: number) => {
      editor.focus({ preventScroll: true })
      restoreEditableCaret(editor, offset)
    }
    if (document.activeElement !== editor) {
      const offset = caretOffsetRef.current ?? freeCanvasSegmentsText(node.segments).length
      restore(offset)
      window.requestAnimationFrame(() => {
        if (editorRef.current && document.activeElement !== editorRef.current) {
          restore(offset)
        }
      })
      caretOffsetRef.current = null
      return
    }
    if (caretOffsetRef.current === null) return
    const offset = caretOffsetRef.current
    restore(offset)
    window.requestAnimationFrame(() => {
      if (editorRef.current) restore(offset)
    })
    caretOffsetRef.current = null
  }, [editing, node.segments])

  useEffect(() => {
    if (editing) {
      draftTextRef.current = displayText
      return
    }
    draftTextRef.current = null
  }, [displayText, editing])

  const handleInput = () => {
    const editor = editorRef.current
    if (!editor) return
    draftTextRef.current = editablePlainText(editor)
  }

  const commitDraft = () => {
    const nextText = draftTextRef.current ?? (editorRef.current ? editablePlainText(editorRef.current) : displayText)
    const diff = diffTextRange(displayText, nextText)
    if (!diff) return
    onTextRangeReplace(node.id, { start: diff.start, end: diff.end }, diff.insertedText, userColor)
    draftTextRef.current = null
  }

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (!editing) return
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!editing) return
    event.stopPropagation()
    if (event.key !== 'Enter') return
    event.preventDefault()
    document.execCommand('insertText', false, '\n')
  }

  return (
    <div
      data-free-canvas-text-node
      className={`group relative rounded-[6px] border bg-white/70 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.08)] ${selected ? 'border-sky-500 ring-1 ring-sky-400' : 'border-transparent'}`}
      style={{ width: node.width, minHeight: node.height }}
      onDoubleClick={() => onEdit(node.id)}
    >
      <NodeToolbar isVisible={selected && selectedNodeCount === 1} position={Position.Top} offset={10}>
        <TextNodeToolbar
          node={node}
          onEdit={() => onEdit(node.id)}
          onStyleChange={updates => onTextStyleChange(node.id, updates)}
        />
      </NodeToolbar>
      <Handle type="target" position={Position.Left} className="!bg-gray-950 !opacity-0 group-hover:!opacity-100" />
      <div
        ref={editorRef}
        data-free-canvas-text-content
        className={`${editing ? 'nodrag nowheel' : 'pointer-events-none select-none'} min-h-[72px] whitespace-pre-wrap break-words bg-transparent font-semibold leading-snug outline-none ${editing ? 'cursor-text' : 'cursor-default'} ${fontSizeClass(node.fontSize)}`}
        contentEditable={editing || undefined}
        tabIndex={editing ? 0 : -1}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          commitDraft()
          onEdit(null)
        }}
        onMouseDown={event => {
          if (editing) event.stopPropagation()
        }}
      >
        {displayText ? (
          node.segments.map(segment => (
            <span key={segment.id} data-segment-source={segment.source} style={{ color: segment.color }}>
              {segment.text}
            </span>
          ))
        ) : (
          <span className="text-gray-400">{editing ? '' : 'Double-click to type'}</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-gray-950 !opacity-0 group-hover:!opacity-100" />
    </div>
  )
}

const FreeCanvasImageNodeView = ({ node, selected }: { node: IFreeCanvasImageNode; selected: boolean }) => {
  const imageUrl = node.assetId ? canvasImageAssetUrl(node.assetId) : node.imageUrl
  const crop = node.crop
  const imageStyle = crop ? {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${-crop.x / crop.width * 100}%`,
    top: `${-crop.y / crop.height * 100}%`
  } : undefined
  return (
    <div data-image-node className={`group relative overflow-visible ${selected ? 'ring-2 ring-[#c96442]' : ''}`} style={{ width: node.width, height: node.height }}>
      <Handle type="target" position={Position.Left} className="!bg-gray-950 !opacity-0 group-hover:!opacity-100" />
      <div className="relative h-full w-full overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={node.title}
            className={`pointer-events-none select-none ${crop ? 'absolute max-w-none' : 'h-full w-full object-contain'}`}
            style={imageStyle}
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-semibold text-gray-400">
            <ImageIcon className="mr-2 h-4 w-4" />
            Drop image
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-gray-950 !opacity-0 group-hover:!opacity-100" />
    </div>
  )
}

const FreeCanvasArrowNodeView = ({ node, selected }: { node: Extract<IFreeCanvasNode, { kind: 'arrow' }>; selected: boolean }) => (
  <div className={`group relative flex items-center gap-3 rounded-md border bg-white px-4 py-3 text-sm font-semibold shadow-sm ${selected ? 'border-sky-500 ring-1 ring-sky-400' : 'border-gray-200'}`} style={{ width: node.width, minHeight: node.height }}>
    <Handle type="target" position={Position.Left} className="!bg-gray-950 !opacity-0 group-hover:!opacity-100" />
    <MousePointer2 className="h-4 w-4" />
    <span style={{ color: node.color }}>{node.text || 'Arrow annotation'}</span>
    <Handle type="source" position={Position.Right} className="!bg-gray-950 !opacity-0 group-hover:!opacity-100" />
  </div>
)

const TextNodeToolbar = ({
  node,
  onEdit,
  onStyleChange
}: {
  node: IFreeCanvasTextNode
  onEdit: () => void
  onStyleChange: (updates: Parameters<typeof updateFreeCanvasTextNodeStyle>[2]) => void
}) => (
  <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-950 px-3 py-2 text-white shadow-[0_18px_60px_rgba(15,23,42,0.22)]">
    <button type="button" className="rounded-full px-3 py-1.5 text-xs font-black hover:bg-white/10" onClick={onEdit}>Edit</button>
    <select
      className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black outline-none"
      value={node.fontSize}
      onChange={event => onStyleChange({ fontSize: event.target.value as IFreeCanvasTextNode['fontSize'] })}
      title="Font size"
    >
      {FONT_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
    </select>
    <div className="h-6 w-px bg-white/20" />
    <Palette className="h-4 w-4 text-white/70" />
    {TEXT_COLORS.map(color => (
      <button
        key={color}
        type="button"
        className="h-5 w-5 rounded-full border border-white/30"
        style={{ backgroundColor: color }}
        title={color}
        onClick={() => onStyleChange({ color })}
      />
    ))}
  </div>
)

const CanvasBottomToolbar = ({
  quickDrawerOpen,
  quickPresets,
  onCreateText,
  onCreateImage,
  onToggleQuickDrawer,
  onOpenQuickPresetComposer,
  onEditQuickPreset,
  onUseQuickPreset
}: {
  quickDrawerOpen: boolean
  quickPresets: QuickTextPreset[]
  onCreateText: () => void
  onCreateImage: () => void
  onToggleQuickDrawer: () => void
  onOpenQuickPresetComposer: () => void
  onEditQuickPreset: (preset: QuickTextPreset) => void
  onUseQuickPreset: (text: string) => void
}) => (
    <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-3">
      {quickDrawerOpen && (
        <div className="w-[300px] rounded-[8px] border border-gray-200 bg-white p-2 shadow-[0_18px_60px_rgba(15,23,42,0.18)]">
          <div className="px-2 pb-2 pt-1 text-xs font-semibold text-gray-400">可能@的内容</div>
          <div className="max-h-[320px] space-y-1 overflow-y-auto">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md bg-gray-100 px-3 py-3 text-left text-sm font-semibold text-gray-950 hover:bg-gray-200"
              onClick={onOpenQuickPresetComposer}
              title="Add quick message"
            >
              <Plus className="h-4 w-4" />
              <span>创建快捷消息</span>
            </button>
            {quickPresets.length === 0 ? (
              <div className="rounded-md bg-gray-50 px-3 py-3 text-xs font-semibold text-gray-400">还没有快捷消息</div>
            ) : quickPresets.map(preset => (
              <div
                key={preset.id}
                className="flex items-center gap-1 rounded-md hover:bg-gray-50"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
                  onClick={() => onUseQuickPreset(preset.body)}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600">
                    <MessageSquare className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-gray-950">{preset.name}</span>
                    {preset.note ? <span className="block truncate text-xs font-semibold text-gray-400">{preset.note}</span> : null}
                  </span>
                </button>
                <button
                  type="button"
                  className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-950"
                  onClick={() => onEditQuickPreset(preset)}
                  title={`编辑 ${preset.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white/95 px-3 py-2 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur" data-free-canvas-toolbar>
        <ToolbarButton title="Text" onClick={onCreateText}><Type className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Quick messages" onClick={onToggleQuickDrawer}><MessageSquare className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton title="Image" onClick={onCreateImage}><ImageIcon className="h-4 w-4" /></ToolbarButton>
      </div>
    </div>
)

const QuickMessageDialog = ({
  draft,
  editing,
  rightOffset,
  onDraftChange,
  onClose,
  onDelete,
  onSave
}: {
  draft: QuickTextPresetDraft
  editing: boolean
  rightOffset: number
  onDraftChange: (draft: QuickTextPresetDraft) => void
  onClose: () => void
  onDelete?: () => void
  onSave: () => void
}) => (
  <div
    className="fixed bottom-[56px] left-0 top-14 z-[80] flex items-center justify-center bg-black/35 px-8 py-8"
    style={{ right: rightOffset }}
  >
    <section
      data-quick-message-dialog
      className="flex flex-col rounded-[8px] bg-white p-8 shadow-[0_24px_90px_rgba(15,23,42,0.28)]"
      style={{
        width: 'min(860px, calc(100% - 48px))',
        height: 'min(720px, calc(100% - 48px))'
      }}
    >
      <div className="mb-7 flex shrink-0 items-center justify-between">
        <h2 className="text-xl font-black text-gray-950">{editing ? '编辑快捷消息' : '新增快捷消息'}</h2>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-950"
          onClick={onClose}
          title="Close"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
        <label className="block">
          <div className="mb-2 text-sm font-bold text-gray-950">提示词名称 <span className="text-red-500">*</span></div>
          <div className="rounded-[8px] bg-gray-100 px-4">
            <input
              className="w-full appearance-none border-0 bg-transparent py-4 text-base outline-none ring-0 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-0"
              value={draft.name}
              maxLength={20}
              onChange={event => onDraftChange({ ...draft, name: event.target.value })}
              placeholder="请输入名称"
              autoFocus
            />
          </div>
        </label>

        <label className="block">
          <div className="mb-2 text-sm font-bold text-gray-950">备注</div>
          <textarea
            className="h-14 w-full resize-none rounded-[8px] border-0 bg-gray-100 px-4 py-3 text-base outline-none ring-0 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-0"
            value={draft.note}
            onChange={event => onDraftChange({ ...draft, note: event.target.value })}
            placeholder="请输入备注"
          />
        </label>

        <label className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2 text-sm font-bold text-gray-950">模板正文 <span className="text-red-500">*</span></div>
          <textarea
            className="min-h-0 flex-1 resize-none overflow-y-auto rounded-[8px] border-0 bg-gray-100 px-4 py-4 text-base leading-7 outline-none ring-0 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-0"
            value={draft.body}
            onChange={event => onDraftChange({ ...draft, body: event.target.value })}
            placeholder="请输入模板正文"
          />
        </label>
      </div>

      <div className="mt-7 flex shrink-0 items-center justify-between">
        {onDelete ? (
          <button
            type="button"
            className="flex items-center gap-2 rounded-[8px] px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        ) : <span />}
        <button
          type="button"
          className="rounded-[8px] bg-gray-950 px-8 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          disabled={!draft.name.trim() || !draft.body.trim()}
          onClick={onSave}
        >
          保存
        </button>
      </div>
    </section>
  </div>
)

const freeCanvasSegmentsText = (segments: IFreeCanvasTextSegment[]): string =>
  segments.map(segment => segment.text).join('')

const editablePlainText = (element: HTMLElement): string =>
  element.textContent || ''

const diffTextRange = (previous: string, next: string): { start: number; end: number; insertedText: string } | null => {
  if (previous === next) return null
  let start = 0
  while (start < previous.length && start < next.length && previous[start] === next[start]) {
    start += 1
  }
  let previousEnd = previous.length
  let nextEnd = next.length
  while (previousEnd > start && nextEnd > start && previous[previousEnd - 1] === next[nextEnd - 1]) {
    previousEnd -= 1
    nextEnd -= 1
  }
  return {
    start,
    end: previousEnd,
    insertedText: next.slice(start, nextEnd)
  }
}

const restoreEditableCaret = (root: HTMLElement, offset: number): void => {
  const selection = window.getSelection()
  if (!selection) return
  const targetOffset = Math.max(0, offset)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentOffset = 0
  let textNode = walker.nextNode()

  while (textNode) {
    const textLength = textNode.textContent?.length || 0
    if (currentOffset + textLength >= targetOffset) {
      const range = document.createRange()
      range.setStart(textNode, Math.min(targetOffset - currentOffset, textLength))
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    currentOffset += textLength
    textNode = walker.nextNode()
  }

  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

const ToolbarButton = ({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-950 hover:text-white" title={title} onClick={onClick}>
    {children}
  </button>
)

const PanelModeButton = ({
  active,
  label,
  icon,
  onClick
}: {
  active: boolean
  label: string
  icon: ReactNode
  onClick: () => void
}) => (
  <button
    type="button"
    className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-black transition ${
      active ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'
    }`}
    onClick={onClick}
  >
    {icon}
    <span className="truncate">{label}</span>
  </button>
)

const nodeTypes = {
  freeCanvasNode: FreeCanvasNode
}

const nextNodePosition = (reactFlow: ReturnType<typeof useReactFlow<FreeCanvasFlowNode>>, count: number) => (
  reactFlow.screenToFlowPosition({ x: window.innerWidth / 2 + count * 20, y: window.innerHeight / 2 + count * 16 })
)

const fontSizeClass = (size: IFreeCanvasTextNode['fontSize']) => {
  if (size === 'small') return 'text-sm'
  if (size === 'medium') return 'text-base'
  if (size === 'extra-large') return 'text-3xl'
  if (size === 'huge') return 'text-5xl'
  return 'text-xl'
}

const userTextColor = (node: IFreeCanvasTextNode): string =>
  typeof node.meta.userTextColor === 'string'
    ? node.meta.userTextColor
    : node.segments.find(segment => segment.source === 'user')?.color || '#111827'

const normalizeQuickTextPreset = (value: unknown): QuickTextPreset | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string') return null

  if (typeof record.body === 'string' && typeof record.name === 'string') {
    return {
      id: record.id,
      name: record.name,
      note: typeof record.note === 'string' ? record.note : '',
      body: record.body,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now()
    }
  }

  if (typeof record.text === 'string') {
    const body = record.text.trim()
    if (!body) return null
    return {
      id: record.id,
      name: body.slice(0, 20),
      note: '',
      body,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now()
    }
  }

  return null
}

export default FreeCanvasBuilderScreen
