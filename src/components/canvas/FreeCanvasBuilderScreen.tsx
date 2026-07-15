import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent as ReactChangeEvent, type ClipboardEvent as ReactClipboardEvent, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  NodeResizer,
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
import { ArrowLeft, ArrowRight, Bot, BookOpen, Brush, ChevronRight, Copy, Hash, Image as ImageIcon, MessageSquare, MousePointer2, Palette, Pencil, Plus, Redo2, Save, Scissors, Square, Trash2, Type, Undo2, X } from 'lucide-react'
import { AIChatbotBox } from '@/components/AgentCollaborationPanel'
import { PromptLibraryPreviewPanel } from '@/components/PromptLibraryPreviewMode'
import { PromptPresetPreviewDialog } from '@/components/prompt-media/PromptPresetPreviewDialog'
import { ImageCropEditor } from '@/components/canvas/ImageCropEditor'
import {
  ImageGeneratorNode,
  applyImageGeneratorConnection
} from '@/components/canvas/nodes/ImageGeneratorNode'
import { ImageGeneratorInspector } from '@/components/canvas/image-generation/ImageGeneratorInspector'
import { GenerationHistoryPanel } from '@/components/canvas/image-generation/GenerationHistoryPanel'
import { canvasImageAssetUrl, getClipboardImageFiles, isFileDrag, isSupportedImageFile, uploadFreeCanvasImageFiles } from '@/components/canvas/canvas-image-assets'
import { createFreeCanvasCroppedNodes, type FreeCanvasCropLines, type FreeCanvasMediaNode } from '@/domain/free-canvas/free-canvas'
import {
  createFreeCanvasImageNodeFromMedia,
  createFreeCanvasImageGeneratorNode,
  createFreeCanvasImageAnnotation,
  createFreeCanvasTextNode,
  createQuickTextNode,
  freeCanvasTextSegmentsToPlainText,
  replaceFreeCanvasTextRange,
  replaceFreeCanvasImageAnnotations,
  removeFreeCanvasProjectNodes,
  updateFreeCanvasImageNodeFrame,
  updateFreeCanvasNodePosition,
  updateFreeCanvasTextNodeStyle,
  updateFreeCanvasTextNodeUserText
} from '@/domain/free-canvas/free-canvas-project'
import { buildFreeCanvasWorkspaceContext } from '@/utils/agent-workspace'
import { useI18n } from '@/i18n'
import { usePresetStore } from '@/stores/preset.store'
import {
  createQuickMessagePresetInput,
  isQuickMessagePreset,
  quickMessagePresetToCanvasSource,
  quickMessagePresetToDraft,
  type QuickMessageDraft
} from '@/domain/prompt-library/quick-messages'
import { compileImageGeneratorPrompt } from '@/domain/image-generation/prompt-compiler'
import { imageSizeCapabilitiesForModel } from '@/domain/image-generation/size-validation'
import { imageRegionCapabilitiesForModel, type ImageRegionSource } from '@/domain/image-generation/regions'
import {
  ImageGenerationSessionManager,
  ImageGenerationOperationGuard,
  SingleFlightAction,
  applyImageGenerationFailure,
  applyImageGenerationStatus,
  applyImageGenerationSuccess,
  buildImageGenerationRequest
} from '@/domain/image-generation/generation-session'
import { modelManagementClient } from '@/services/model-management-client'
import type { AgentWorkspaceProposal } from '@/models/Agent.model'
import type { IPreset } from '@/models/Card.model'
import type { FreeCanvasImageAnnotationKind, IFreeCanvasImageAnnotation, IFreeCanvasImageGeneratorNode, IFreeCanvasImageNode, IFreeCanvasNode, IFreeCanvasProject, IFreeCanvasTextNode, IPromptProject } from '@/models/PromptHistory.model'

interface FreeCanvasBuilderScreenProps {
  activeProject: IPromptProject
  freeCanvas: IFreeCanvasProject
  onBack: () => void
  onRenameProject: () => void
  onSave: () => void
  onChange: (freeCanvas: IFreeCanvasProject) => void
  previewMode?: boolean
  imageGenerationNodeV1?: boolean
}

type FreeCanvasFlowNodeData = {
  canvasNode: IFreeCanvasNode
  editing: boolean
  onEdit: (nodeId: string | null) => void
  onTextCopy: (nodeId: string) => void
  onTextRangeReplace: (nodeId: string, range: { start: number; end: number }, insertedText: string, color: string) => void
  onTextStyleChange: (nodeId: string, updates: Parameters<typeof updateFreeCanvasTextNodeStyle>[2]) => void
  onImageResize: (nodeId: string, frame: { position?: { x: number; y: number }; width: number; height: number }) => void
  onStartImageAnnotationEdit: (nodeId: string) => void
  onStartImageCrop: (nodeId: string) => void
  resultThumbnailUrl?: string
  onOpenImageHistory: (nodeId: string) => void
}

type FreeCanvasFlowNode = Node<FreeCanvasFlowNodeData>

const TEXT_COLORS = ['#111827', '#ef4423', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff']
const FONT_SIZES: IFreeCanvasTextNode['fontSize'][] = ['small', 'medium', 'large', 'extra-large', 'huge']
const emptyQuickTextPresetDraft: QuickMessageDraft = { name: '', body: '' }

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
  previewMode = false,
  imageGenerationNodeV1 = false
}: FreeCanvasBuilderScreenProps) => {
  const reactFlow = useReactFlow<FreeCanvasFlowNode>()
  const { cardTypeLabel } = useI18n()
  const {
    presets,
    initialized: presetsInitialized,
    init: initPresets,
    addPreset,
    updatePreset,
    deletePreset
  } = usePresetStore()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [rightPanelMode, setRightPanelMode] = useState<'agent' | 'prompt-library'>('agent')
  const [previewPreset, setPreviewPreset] = useState<IPreset | null>(null)
  const [quickDrawerOpen, setQuickDrawerOpen] = useState(false)
  const [quickComposerOpen, setQuickComposerOpen] = useState(false)
  const [quickEditingPresetId, setQuickEditingPresetId] = useState<string | null>(null)
  const [quickPresetDraft, setQuickPresetDraft] = useState<QuickMessageDraft>(emptyQuickTextPresetDraft)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null)
  const [fileDragActive, setFileDragActive] = useState(false)
  const [cropNodeId, setCropNodeId] = useState<string | null>(null)
  const [annotationEditorNodeId, setAnnotationEditorNodeId] = useState<string | null>(null)
  const [generationHistory, setGenerationHistory] = useState<{ projectId: string; nodeId: string } | null>(null)
  const [imageGeneratorCreating, setImageGeneratorCreating] = useState(false)
  const selectedNode = freeCanvas.nodes.find(node => node.id === freeCanvas.selectedNodeId) || null
  const selectedImageNode = selectedNode?.kind === 'image' ? selectedNode : null
  const selectedImageGeneratorNode = selectedNode?.kind === 'image-generator' ? selectedNode : null
  const selectedPromptSnapshot = useMemo(() => selectedImageGeneratorNode
    ? compileImageGeneratorPrompt(freeCanvas, selectedImageGeneratorNode.id)
    : null, [freeCanvas, selectedImageGeneratorNode])
  const selectedRegionSources = useMemo<ImageRegionSource[]>(() => (
    selectedPromptSnapshot?.references.flatMap(reference => reference.assetId
      ? [{
          referenceId: reference.referenceId,
          label: reference.label,
          role: reference.role,
          assetId: reference.assetId,
          imageUrl: canvasImageAssetUrl(reference.assetId)
        }]
      : []) || []
  ), [selectedPromptSnapshot])
  const quickPresets = useMemo(() => presets.filter(isQuickMessagePreset), [presets])
  const cropNode = cropNodeId
    ? freeCanvas.nodes.find((node): node is IFreeCanvasImageNode => node.id === cropNodeId && node.kind === 'image')
    : null
  const annotationEditorNode = annotationEditorNodeId
    ? freeCanvas.nodes.find((node): node is IFreeCanvasImageNode => node.id === annotationEditorNodeId && node.kind === 'image')
    : null
  const isCanvasKeyboardLocked = Boolean(annotationEditorNode || cropNode)
  const freeCanvasRef = useRef(freeCanvas)
  const selectedImageNodeRef = useRef<IFreeCanvasImageNode | null>(selectedImageNode)
  const copiedImageNodeRef = useRef<IFreeCanvasImageNode | null>(null)
  const fileDragDepthRef = useRef(0)
  const imageGenerationSessionsRef = useRef<ImageGenerationSessionManager | null>(null)
  if (!imageGenerationSessionsRef.current) imageGenerationSessionsRef.current = new ImageGenerationSessionManager()
  const imageGenerationGuardRef = useRef<ImageGenerationOperationGuard | null>(null)
  if (!imageGenerationGuardRef.current) imageGenerationGuardRef.current = new ImageGenerationOperationGuard()
  const imageGeneratorCreationRef = useRef<SingleFlightAction | null>(null)
  if (!imageGeneratorCreationRef.current) imageGeneratorCreationRef.current = new SingleFlightAction()

  useEffect(() => {
    const guard = imageGenerationGuardRef.current!
    guard.activateProject(activeProject.id)
    imageGeneratorCreationRef.current = new SingleFlightAction()
    setImageGeneratorCreating(false)
    return () => guard.deactivateProject(activeProject.id)
  }, [activeProject.id])

  useEffect(() => {
    if (!presetsInitialized) initPresets()
  }, [initPresets, presetsInitialized])

  useEffect(() => {
    freeCanvasRef.current = freeCanvas
    selectedImageNodeRef.current = selectedImageNode
  }, [freeCanvas, selectedImageNode])

  useEffect(() => {
    setGenerationHistory(null)
  }, [activeProject.id])

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

  const createQuickText = useCallback((preset: IPreset) => {
    const source = quickMessagePresetToCanvasSource(preset)
    const node = createQuickTextNode(source.text, nextNodePosition(reactFlow, freeCanvas.nodes.length))
    addNode({
      ...node,
      title: source.title,
      meta: { ...node.meta, quickMessagePresetId: source.presetId }
    })
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
      if (annotationEditorNodeId || cropNodeId) return
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c' || isTypingTarget(event.target)) return
      const imageNode = selectedImageNodeRef.current
      if (!imageNode) return
      event.preventDefault()
      copiedImageNodeRef.current = imageNode
      setClipboardNotice('已复制图片节点')
    }

    const handlePaste = (event: ClipboardEvent) => {
      if (annotationEditorNodeId || cropNodeId) return
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
        annotations: (copied.annotations || []).map(annotation => ({
          ...annotation,
          id: `image-annotation-copy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          points: annotation.points?.map(point => ({ ...point })) || undefined,
          meta: { ...annotation.meta, duplicatedFromAnnotationId: annotation.id }
        })),
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
  }, [addImageFiles, annotationEditorNodeId, cropNodeId, onChange, reactFlow])

  const replaceTextRange = useCallback((nodeId: string, range: { start: number; end: number }, insertedText: string, color: string) => {
    onChange(replaceFreeCanvasTextRange(freeCanvas, nodeId, range, insertedText, color))
  }, [freeCanvas, onChange])

  const updateTextStyle = useCallback((nodeId: string, updates: Parameters<typeof updateFreeCanvasTextNodeStyle>[2]) => {
    onChange(updateFreeCanvasTextNodeStyle(freeCanvas, nodeId, updates))
  }, [freeCanvas, onChange])

  const copyTextNode = useCallback((nodeId: string) => {
    const node = freeCanvasRef.current.nodes.find((candidate): candidate is IFreeCanvasTextNode =>
      candidate.id === nodeId && candidate.kind === 'text'
    )
    if (!node) return
    const text = freeCanvasTextSegmentsToPlainText(node.segments)
    if (!text) return
    if (!navigator.clipboard?.writeText) {
      setClipboardNotice('复制文本失败')
      return
    }
    void navigator.clipboard.writeText(text)
      .then(() => setClipboardNotice('已复制文本节点'))
      .catch(() => setClipboardNotice('复制文本失败'))
  }, [])

  const resizeImageNode = useCallback((nodeId: string, frame: { position?: { x: number; y: number }; width: number; height: number }) => {
    onChange(updateFreeCanvasImageNodeFrame(freeCanvas, nodeId, frame))
  }, [freeCanvas, onChange])

  const saveImageAnnotations = useCallback((nodeId: string, annotations: IFreeCanvasImageAnnotation[]) => {
    onChange(replaceFreeCanvasImageAnnotations(freeCanvas, nodeId, annotations))
    setAnnotationEditorNodeId(null)
  }, [freeCanvas, onChange])

  const updateImageGeneratorNode = useCallback((
    nodeId: string,
    updates: Partial<Pick<IFreeCanvasImageGeneratorNode, 'mode' | 'settings' | 'promptDocument' | 'regions' | 'meta'>>
  ) => {
    onChange({
      ...freeCanvas,
      nodes: freeCanvas.nodes.map(node => node.id === nodeId && node.kind === 'image-generator'
        ? { ...node, ...updates }
        : node)
    })
  }, [freeCanvas, onChange])

  const emitGenerationCanvas = useCallback((next: IFreeCanvasProject) => {
    freeCanvasRef.current = next
    onChange(next)
  }, [onChange])

  const createImageGenerator = useCallback(async () => {
    if (!imageGenerationNodeV1) return
    const gate = imageGeneratorCreationRef.current!
    if (gate.busy) return gate.run(async () => undefined)
    const projectId = activeProject.id
    const operationId = imageGenerationGuardRef.current!.begin(projectId, '__create-image-generator__')
    setImageGeneratorCreating(true)
    try {
      await gate.run(async () => {
        let binding = { connectionId: '', modelId: '' }
        try {
          const assignment = (await modelManagementClient.listAssignments())
            .find(item => item.slot === 'image.primary')
          if (assignment) binding = { connectionId: assignment.connectionId, modelId: assignment.modelId }
        } catch {
          if (imageGenerationGuardRef.current!.isCurrent(projectId, '__create-image-generator__', operationId)) {
            setUploadError('The image model assignment could not be loaded. You can configure it in Settings.')
          }
        }
        if (!imageGenerationGuardRef.current!.isCurrent(projectId, '__create-image-generator__', operationId)) return
        const current = freeCanvasRef.current
        const node = createFreeCanvasImageGeneratorNode(
          nextNodePosition(reactFlow, current.nodes.length),
          binding
        )
        emitGenerationCanvas({ ...current, nodes: [...current.nodes, node], selectedNodeId: node.id })
      })
    } finally {
      if (imageGenerationGuardRef.current!.isCurrent(projectId, '__create-image-generator__', operationId)) {
        setImageGeneratorCreating(false)
      }
    }
  }, [activeProject.id, emitGenerationCanvas, imageGenerationNodeV1, reactFlow])

  const openImageGenerationHistory = useCallback((nodeId: string) => {
    setGenerationHistory({ projectId: activeProject.id, nodeId })
    const current = freeCanvasRef.current
    if (current.selectedNodeId !== nodeId) emitGenerationCanvas({ ...current, selectedNodeId: nodeId })
  }, [activeProject.id, emitGenerationCanvas])

  const generateImage = useCallback((nodeId: string) => {
    if (!imageGenerationNodeV1) return
    const current = freeCanvasRef.current
    const node = current.nodes.find((candidate): candidate is IFreeCanvasImageGeneratorNode => (
      candidate.id === nodeId && candidate.kind === 'image-generator'
    ))
    if (!node) return
    const sessions = imageGenerationSessionsRef.current!
    if (sessions.isBusy(activeProject.id, nodeId)) return
    const projectId = activeProject.id
    const operationId = imageGenerationGuardRef.current!.begin(projectId, nodeId)
    const operationIsCurrent = () => imageGenerationGuardRef.current!.isCurrent(projectId, nodeId, operationId)

    const callbacks = {
      onStatus: (status: Parameters<typeof applyImageGenerationStatus>[2]) => {
        if (!operationIsCurrent()) return
        emitGenerationCanvas(applyImageGenerationStatus(freeCanvasRef.current, nodeId, status))
      },
      onSucceeded: (result: Parameters<typeof applyImageGenerationSuccess>[2]) => {
        if (!operationIsCurrent()) return
        emitGenerationCanvas(applyImageGenerationSuccess(freeCanvasRef.current, nodeId, result))
      },
      onFailed: (error: unknown) => {
        if (!operationIsCurrent()) return
        emitGenerationCanvas(applyImageGenerationFailure(freeCanvasRef.current, nodeId, error))
      }
    }
    const operation = node.meta.status === 'failed' && sessions.canRetry(activeProject.id, nodeId)
      ? sessions.retry(activeProject.id, nodeId, callbacks)
      : sessions.start(
          buildImageGenerationRequest(activeProject.id, node, compileImageGeneratorPrompt(current, nodeId)),
          callbacks
        )
    void operation.catch(() => undefined)
  }, [activeProject.id, emitGenerationCanvas, imageGenerationNodeV1])

  const nodes = useMemo<FreeCanvasFlowNode[]>(() => freeCanvas.nodes.map(node => ({
    id: node.id,
    type: node.kind === 'image-generator' ? 'imageGeneratorNode' : 'freeCanvasNode',
    position: node.position,
    selected: node.id === freeCanvas.selectedNodeId,
    style: node.kind === 'image' ? { width: node.width, height: node.height } : undefined,
    data: {
      canvasNode: node,
      editing: editingNodeId === node.id,
      onEdit: setEditingNodeId,
      onTextCopy: copyTextNode,
      onTextRangeReplace: replaceTextRange,
      onTextStyleChange: updateTextStyle,
      onImageResize: resizeImageNode,
      onStartImageAnnotationEdit: setAnnotationEditorNodeId,
      onStartImageCrop: setCropNodeId,
      resultThumbnailUrl: node.kind === 'image-generator' && node.primaryAssetId
        ? canvasImageAssetUrl(node.primaryAssetId)
        : undefined,
      onOpenImageHistory: openImageGenerationHistory
    }
  })), [copyTextNode, editingNodeId, freeCanvas.nodes, freeCanvas.selectedNodeId, openImageGenerationHistory, replaceTextRange, resizeImageNode, updateTextStyle])

  const [flowNodes, setFlowNodes] = useState<FreeCanvasFlowNode[]>(nodes)
  useEffect(() => setFlowNodes(nodes), [nodes])

  const edges = useMemo<Edge[]>(() => freeCanvas.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
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
    if (removedNodeIds.length > 0 && !isCanvasKeyboardLocked) {
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
    const targetNode = freeCanvas.nodes.find(node => node.id === connection.target)
    if (targetNode?.kind === 'image-generator') {
      const updated = applyImageGeneratorConnection(freeCanvas, connection)
      if (updated !== freeCanvas) onChange(updated)
      return
    }
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

  const createQuickPreset = async (draft: QuickMessageDraft) => {
    const name = draft.name.trim()
    const body = draft.body.trim()
    if (!name || !body) return
    await addPreset(createQuickMessagePresetInput({ name, body }, { createdAt: Date.now() }))
  }

  const openQuickPresetComposer = (preset?: IPreset) => {
    if (preset) {
      setQuickEditingPresetId(preset.id)
      setQuickPresetDraft(quickMessagePresetToDraft(preset))
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
    const body = quickPresetDraft.body.trim()
    if (!name || !body) return
    if (quickEditingPresetId) {
      await updatePreset(quickEditingPresetId, createQuickMessagePresetInput({ name, body }))
    } else {
      await createQuickPreset({ name, body })
    }
    closeQuickPresetComposer()
  }

  const deleteQuickPresetDraft = async () => {
    if (!quickEditingPresetId) return
    await deletePreset(quickEditingPresetId)
    closeQuickPresetComposer()
  }

  return (
    <section
      data-free-canvas-screen
      className="fixed inset-x-0 bottom-0 top-14 z-20 overflow-hidden bg-[#f7f8fb]"
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
          deleteKeyCode={editingNodeId || isCanvasKeyboardLocked ? null : ['Backspace', 'Delete']}
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
          onCreateImageGenerator={imageGenerationNodeV1 ? () => { void createImageGenerator() } : undefined}
          imageGeneratorCreating={imageGeneratorCreating}
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
        {annotationEditorNode && (
          <ImageAnnotationEditor
            node={annotationEditorNode}
            imageUrl={annotationEditorNode.assetId ? canvasImageAssetUrl(annotationEditorNode.assetId) : annotationEditorNode.imageUrl || ''}
            onCancel={() => setAnnotationEditorNodeId(null)}
            onSave={annotations => saveImageAnnotations(annotationEditorNode.id, annotations)}
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
          {selectedImageGeneratorNode && (
            <div className="max-h-[46%] shrink-0 overflow-y-auto border-b border-gray-100">
              <ImageGeneratorInspector
                node={selectedImageGeneratorNode}
                sizeCapabilities={imageSizeCapabilitiesForModel(selectedImageGeneratorNode.binding.modelId)}
                regionCapabilities={imageRegionCapabilitiesForModel(selectedImageGeneratorNode.binding.modelId)}
                regionSources={selectedRegionSources}
                promptSnapshot={selectedPromptSnapshot || undefined}
                resultThumbnailUrl={selectedImageGeneratorNode.primaryAssetId
                  ? canvasImageAssetUrl(selectedImageGeneratorNode.primaryAssetId)
                  : undefined}
                onChange={updates => updateImageGeneratorNode(selectedImageGeneratorNode.id, updates)}
                onPromptDocumentChange={promptDocument => updateImageGeneratorNode(
                  selectedImageGeneratorNode.id,
                  { promptDocument }
                )}
                onGenerate={imageGenerationNodeV1 ? () => generateImage(selectedImageGeneratorNode.id) : undefined}
                onOpenHistory={openImageGenerationHistory}
              />
            </div>
          )}
          {generationHistory?.projectId === activeProject.id && (
            <div className="max-h-[46%] shrink-0 overflow-y-auto border-b border-gray-100 p-4">
              <div className="mb-3 flex justify-end">
                <button type="button" className="text-xs font-bold text-gray-600" onClick={() => setGenerationHistory(null)}>Close history</button>
              </div>
              <GenerationHistoryPanel
                key={`${activeProject.id}:${generationHistory.nodeId}`}
                projectId={activeProject.id}
                nodeId={generationHistory.nodeId}
              />
            </div>
          )}
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
        onTextCopy={data.onTextCopy}
        onTextRangeReplace={data.onTextRangeReplace}
        onTextStyleChange={data.onTextStyleChange}
      />
    )
  }
  if (node.kind === 'image') {
    return (
      <FreeCanvasImageNodeView
        node={node}
        selected={selected}
        onResize={data.onImageResize}
        onStartAnnotationEdit={data.onStartImageAnnotationEdit}
        onStartImageCrop={data.onStartImageCrop}
      />
    )
  }
  if (node.kind === 'arrow') {
    return <FreeCanvasArrowNodeView node={node} selected={selected} />
  }
  return null
}

const ImageGeneratorFlowNode = ({ data, selected }: NodeProps<FreeCanvasFlowNode>) => {
  if (data.canvasNode.kind !== 'image-generator') return null
  return (
    <ImageGeneratorNode
      data={{
        canvasNode: data.canvasNode,
        resultThumbnailUrl: data.resultThumbnailUrl,
        onOpenHistory: data.onOpenImageHistory
      }}
      selected={selected}
    />
  )
}

const FreeCanvasTextNodeView = ({
  node,
  selected,
  editing,
  onEdit,
  onTextCopy,
  onTextRangeReplace,
  onTextStyleChange
}: {
  node: IFreeCanvasTextNode
  selected: boolean
  editing: boolean
  onEdit: (nodeId: string | null) => void
  onTextCopy: (nodeId: string) => void
  onTextRangeReplace: (nodeId: string, range: { start: number; end: number }, insertedText: string, color: string) => void
  onTextStyleChange: (nodeId: string, updates: Parameters<typeof updateFreeCanvasTextNodeStyle>[2]) => void
}) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const draftTextRef = useRef<string | null>(null)
  const caretOffsetRef = useRef<number | null>(null)
  const displayText = freeCanvasTextSegmentsToPlainText(node.segments)
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
      const offset = caretOffsetRef.current ?? freeCanvasTextSegmentsToPlainText(node.segments).length
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
          onCopy={() => onTextCopy(node.id)}
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

const FreeCanvasImageNodeView = ({
  node,
  selected,
  onResize,
  onStartAnnotationEdit,
  onStartImageCrop
}: {
  node: IFreeCanvasImageNode
  selected: boolean
  onResize: (nodeId: string, frame: { position?: { x: number; y: number }; width: number; height: number }) => void
  onStartAnnotationEdit: (nodeId: string) => void
  onStartImageCrop: (nodeId: string) => void
}) => {
  const selectedNodeCount = useStore(state => state.nodes.filter(candidate => candidate.selected).length)
  const imageUrl = node.assetId ? canvasImageAssetUrl(node.assetId) : node.imageUrl
  const crop = node.crop
  const imageStyle = crop ? {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${-crop.x / crop.width * 100}%`,
    top: `${-crop.y / crop.height * 100}%`
  } : undefined

  return (
    <div data-image-node className={`group relative h-full w-full overflow-visible ${selected ? 'ring-2 ring-[#c96442]' : ''}`}>
      <NodeResizer
        isVisible={selected && selectedNodeCount === 1}
        keepAspectRatio
        minWidth={80}
        minHeight={60}
        color="#0ea5e9"
        handleStyle={{ width: 10, height: 10, border: '2px solid #0ea5e9', background: '#ffffff' }}
        lineStyle={{ borderColor: '#0ea5e9', borderWidth: 1.5 }}
        onResizeEnd={(_event, params) => {
          onResize(node.id, {
            position: { x: params.x, y: params.y },
            width: params.width,
            height: params.height
          })
        }}
      />
      <NodeToolbar isVisible={selected && selectedNodeCount === 1} position={Position.Top} offset={10}>
        <ImageNodeToolbar
          canCrop={Boolean(node.assetId && !node.crop)}
          onEdit={() => onStartAnnotationEdit(node.id)}
          onCrop={() => onStartImageCrop(node.id)}
        />
      </NodeToolbar>
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
        <ImageAnnotationsLayer
          annotations={node.annotations || []}
          mode="display"
        />
      </div>
      <Handle id="image-output" type="source" position={Position.Right} className="!bg-gray-950 !opacity-0 group-hover:!opacity-100" />
    </div>
  )
}

const ImageNodeToolbar = ({
  canCrop,
  onEdit,
  onCrop
}: {
  canCrop: boolean
  onEdit: () => void
  onCrop: () => void
}) => (
  <div
    className="nodrag nowheel flex items-center gap-1 rounded-full border border-gray-200 bg-gray-950 px-3 py-2 text-white shadow-[0_18px_60px_rgba(15,23,42,0.22)]"
    onPointerDown={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
  >
    <ImageToolbarButton title="Edit image annotations" onClick={onEdit}><Pencil className="h-4 w-4" /></ImageToolbarButton>
    {canCrop && (
      <>
        <div className="mx-1 h-6 w-px bg-white/20" />
        <ImageToolbarButton title="Crop image" onClick={onCrop}><Scissors className="h-4 w-4" /></ImageToolbarButton>
      </>
    )}
  </div>
)

const ImageToolbarButton = ({
  title,
  active = false,
  onClick,
  children
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    className={`nodrag flex h-8 w-8 items-center justify-center rounded-full transition ${active ? 'bg-white text-gray-950' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
    title={title}
    aria-label={title}
    onPointerDown={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()}
    onClick={event => {
      event.stopPropagation()
      onClick()
    }}
  >
    {children}
  </button>
)

type ImageAnnotationHistory = {
  past: IFreeCanvasImageAnnotation[][]
  present: IFreeCanvasImageAnnotation[]
  future: IFreeCanvasImageAnnotation[][]
}

type ImageAnnotationResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

const IMAGE_ANNOTATION_RESIZE_HANDLES: ImageAnnotationResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SHOT_NUMBER_RESIZE_HANDLES: ImageAnnotationResizeHandle[] = ['nw', 'ne', 'se', 'sw']
const IMAGE_ANNOTATION_MODE_LABELS: Record<FreeCanvasImageAnnotationKind, string> = {
  text: 'Text',
  rect: 'Rectangle',
  arrow: 'Arrow',
  freehand: 'Brush',
  shotNumber: 'Shot number'
}

const ImageAnnotationsLayer = ({
  annotations,
  mode,
  activeAnnotationMode = null,
  selectedAnnotationId = null,
  editingTextAnnotationId = null,
  interactive = false,
  onSelect,
  onClearSelection,
  onBeginTextEdit,
  onEndTextEdit,
  onLiveChange,
  onCommitChange,
  onDelete
}: {
  annotations: IFreeCanvasImageAnnotation[]
  mode: 'display' | 'edit'
  activeAnnotationMode?: FreeCanvasImageAnnotationKind | null
  selectedAnnotationId?: string | null
  editingTextAnnotationId?: string | null
  interactive?: boolean
  onSelect?: (annotationId: string) => void
  onClearSelection?: () => void
  onBeginTextEdit?: (annotationId: string) => void
  onEndTextEdit?: () => void
  onLiveChange?: (annotations: IFreeCanvasImageAnnotation[]) => void
  onCommitChange?: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void
  onDelete?: (annotationId: string) => void
}) => (
  <div
    className={`absolute inset-0 ${mode === 'display' || !interactive ? 'pointer-events-none' : ''}`}
    onPointerDown={event => {
      if (event.target === event.currentTarget) onClearSelection?.()
    }}
  >
    {annotations.map(annotation => {
      const editable = mode === 'edit' && interactive && annotation.kind === activeAnnotationMode
      return (
        <ImageAnnotationItem
          key={annotation.id}
          annotation={annotation}
          annotations={annotations}
          editable={editable}
          selected={editable && annotation.id === selectedAnnotationId}
          editing={editable && annotation.id === editingTextAnnotationId}
          onSelect={onSelect}
          onBeginTextEdit={onBeginTextEdit}
          onEndTextEdit={onEndTextEdit}
          onLiveChange={onLiveChange}
          onCommitChange={onCommitChange}
          onDelete={onDelete}
        />
      )
    })}
  </div>
)

const ImageAnnotationItem = ({
  annotation,
  annotations,
  editable,
  selected,
  editing,
  onSelect,
  onBeginTextEdit,
  onEndTextEdit,
  onLiveChange,
  onCommitChange,
  onDelete
}: {
  annotation: IFreeCanvasImageAnnotation
  annotations: IFreeCanvasImageAnnotation[]
  editable: boolean
  selected: boolean
  editing: boolean
  onSelect?: (annotationId: string) => void
  onBeginTextEdit?: (annotationId: string) => void
  onEndTextEdit?: () => void
  onLiveChange?: (annotations: IFreeCanvasImageAnnotation[]) => void
  onCommitChange?: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void
  onDelete?: (annotationId: string) => void
}) => {
  if (annotation.kind === 'freehand') {
    return (
      <>
        <svg className={`absolute inset-0 h-full w-full ${editable ? 'pointer-events-auto' : 'pointer-events-none'}`} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            points={(annotation.points || []).map(point => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={annotation.color}
            strokeWidth={(annotation.strokeWidth || 4) / 500}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={editable ? 'cursor-pointer' : ''}
            pointerEvents={editable ? 'stroke' : 'none'}
            onPointerDown={editable ? event => {
              if (onLiveChange && onCommitChange) {
                startFreehandMove(event, annotation, annotations, onLiveChange, onCommitChange, onSelect)
                return
              }
              event.preventDefault()
              event.stopPropagation()
              onSelect?.(annotation.id)
            } : undefined}
          />
        </svg>
        {editable && selected && (
          <AnnotationSelectionFrame
            annotation={annotation}
            onDelete={() => onDelete?.(annotation.id)}
            onMovePointerDown={event => {
              if (!onLiveChange || !onCommitChange) return
              startFreehandBoxMove(event, annotation, annotations, onLiveChange, onCommitChange, onSelect)
            }}
          />
        )}
      </>
    )
  }

  if (annotation.kind === 'arrow' && annotation.points && annotation.points.length >= 2) {
    return (
      <PointArrowAnnotation
        annotation={annotation}
        annotations={annotations}
        editable={editable}
        selected={selected}
        onSelect={onSelect}
        onLiveChange={onLiveChange}
        onCommitChange={onCommitChange}
        onDelete={onDelete}
      />
    )
  }

  const style: CSSProperties = {
    left: `${annotation.x * 100}%`,
    top: `${annotation.y * 100}%`,
    width: `${annotation.width * 100}%`,
    ...(annotation.kind === 'shotNumber'
      ? { aspectRatio: '1 / 1' }
      : { height: `${annotation.height * 100}%` })
  }

  return (
    <div
      className={`absolute ${editable ? 'nodrag nowheel' : 'pointer-events-none'} ${selected ? 'ring-2 ring-sky-500' : ''}`}
      style={style}
      onPointerDown={editable && onLiveChange && onCommitChange ? event => startBoxAnnotationDrag(event, annotation, annotations, onLiveChange, onCommitChange, onSelect) : undefined}
      onDoubleClick={editable && (annotation.kind === 'text' || annotation.kind === 'shotNumber') ? event => {
        event.preventDefault()
        event.stopPropagation()
        onSelect?.(annotation.id)
        onBeginTextEdit?.(annotation.id)
      } : undefined}
      data-image-annotation-kind={annotation.kind}
      data-selected={selected || undefined}
    >
      {annotation.kind === 'rect' ? (
        <div className="h-full w-full border border-gray-950/70" style={{ backgroundColor: annotation.fill || '#ffffff' }} />
      ) : annotation.kind === 'arrow' ? (
        <ArrowAnnotation color={annotation.color} id={annotation.id} />
      ) : annotation.kind === 'shotNumber' ? (
        editable && editing ? (
          <input
            className="h-full w-full border-0 text-center text-lg font-black leading-none outline-none"
            style={{ backgroundColor: annotation.fill || '#111827', color: annotation.color || '#ffffff' }}
            value={annotation.text || ''}
            maxLength={4}
            inputMode="numeric"
            onChange={event => onLiveChange?.(replaceImageAnnotation(annotations, annotation.id, { text: event.target.value, updatedAt: Date.now() }))}
            onBlur={event => {
              onCommitChange?.(replaceImageAnnotation(annotations, annotation.id, { text: event.currentTarget.value, updatedAt: Date.now() }), annotation.id)
              onEndTextEdit?.()
            }}
            onKeyDown={event => {
              if (event.key === 'Escape' || event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
            onPointerDown={event => event.stopPropagation()}
            aria-label="Shot number"
            autoFocus
          />
        ) : (
          <div
            className="flex h-full w-full cursor-move items-center justify-center text-lg font-black leading-none"
            style={{ backgroundColor: annotation.fill || '#111827', color: annotation.color || '#ffffff' }}
          >
            {annotation.text || ''}
          </div>
        )
      ) : (
        editable && editing ? (
          <textarea
            className="h-full w-full resize-none border border-white/70 bg-white/70 px-2 py-1 text-sm font-semibold leading-snug text-gray-950 outline-none shadow-sm"
            value={annotation.text || ''}
            onChange={event => onLiveChange?.(replaceImageAnnotation(annotations, annotation.id, { text: event.target.value, updatedAt: Date.now() }))}
            onBlur={event => {
              onCommitChange?.(replaceImageAnnotation(annotations, annotation.id, { text: event.currentTarget.value, updatedAt: Date.now() }), annotation.id)
              onEndTextEdit?.()
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') event.currentTarget.blur()
            }}
            onPointerDown={event => event.stopPropagation()}
            aria-label="Image annotation text"
            autoFocus
          />
        ) : (
          <div
            className="h-full w-full cursor-move whitespace-pre-wrap break-words border border-white/70 bg-white/70 px-2 py-1 text-sm font-semibold leading-snug text-gray-950 shadow-sm"
          >
            {annotation.text || ''}
          </div>
        )
      )}
      {editable && selected && (
        <>
          <button
            type="button"
            className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gray-950 text-white shadow-md hover:bg-red-600"
            title="Delete annotation"
            aria-label="Delete annotation"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              onDelete?.(annotation.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {annotation.kind !== 'arrow' && (
            <AnnotationResizeHandles
              annotation={annotation}
              annotations={annotations}
              handles={annotation.kind === 'shotNumber' ? SHOT_NUMBER_RESIZE_HANDLES : IMAGE_ANNOTATION_RESIZE_HANDLES}
              onLiveChange={onLiveChange}
              onCommitChange={onCommitChange}
            />
          )}
        </>
      )}
    </div>
  )
}

const ArrowAnnotation = ({ color, id }: { color: string; id: string }) => {
  const markerId = `image-arrow-${id}`
  return (
    <svg className="h-full w-full overflow-visible" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker id={markerId} markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 10 4 L 0 8 z" fill={color} />
        </marker>
      </defs>
      <line x1="4" y1="12" x2="92" y2="12" stroke={color} strokeWidth="5" strokeLinecap="round" markerEnd={`url(#${markerId})`} />
    </svg>
  )
}

const PointArrowAnnotation = ({
  annotation,
  annotations,
  editable,
  selected,
  onSelect,
  onLiveChange,
  onCommitChange,
  onDelete
}: {
  annotation: IFreeCanvasImageAnnotation
  annotations: IFreeCanvasImageAnnotation[]
  editable: boolean
  selected: boolean
  onSelect?: (annotationId: string) => void
  onLiveChange?: (annotations: IFreeCanvasImageAnnotation[]) => void
  onCommitChange?: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void
  onDelete?: (annotationId: string) => void
}) => {
  const [start, end] = annotation.points || []
  if (!start || !end) return null
  const markerId = `image-arrow-point-${annotation.id}`
  const lineWidth = Math.max((annotation.strokeWidth || 5) / 450, 0.008)
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }

  return (
    <>
      <svg className={`absolute inset-0 h-full w-full ${editable ? 'pointer-events-auto' : 'pointer-events-none'}`} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id={markerId} markerWidth="0.08" markerHeight="0.08" refX="0.07" refY="0.04" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 0.08 0.04 L 0 0.08 z" fill={annotation.color || '#ef4423'} />
          </marker>
        </defs>
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={annotation.color || '#ef4423'}
          strokeWidth={lineWidth}
          strokeLinecap="round"
          markerEnd={`url(#${markerId})`}
          className={editable ? 'cursor-move' : ''}
          pointerEvents={editable ? 'stroke' : 'none'}
          onPointerDown={editable && onLiveChange && onCommitChange ? event => startArrowMove(event, annotation, annotations, onLiveChange, onCommitChange, onSelect) : undefined}
        />
      </svg>
      {editable && selected && (
        <>
          <button
            type="button"
            className="absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gray-950 text-white shadow-md hover:bg-red-600"
            style={{ left: `${mid.x * 100}%`, top: `${mid.y * 100 - 4}%` }}
            title="Delete annotation"
            aria-label="Delete annotation"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              onDelete?.(annotation.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {(['start', 'end'] as const).map((endpoint, index) => {
            const point = endpoint === 'start' ? start : end
            return (
              <button
                key={endpoint}
                type="button"
                className="absolute z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow"
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                title={`${endpoint} arrow point`}
                aria-label={`${endpoint} arrow point`}
                onPointerDown={event => {
                  if (!onLiveChange || !onCommitChange) return
                  startArrowPointDrag(event, annotation, annotations, index, onLiveChange, onCommitChange, onSelect)
                }}
              />
            )
          })}
        </>
      )}
    </>
  )
}

const AnnotationSelectionFrame = ({
  annotation,
  onDelete,
  onMovePointerDown
}: {
  annotation: IFreeCanvasImageAnnotation
  onDelete: () => void
  onMovePointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void
}) => {
  const points = annotation.points || []
  if (points.length === 0) return null
  const box = annotationBoxFromPoints(points)
  return (
    <div
      className={`absolute border border-sky-500 ${onMovePointerDown ? 'pointer-events-auto cursor-move' : 'pointer-events-none'}`}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`
      }}
      onPointerDown={onMovePointerDown}
    >
      <button
        type="button"
        className="pointer-events-auto absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gray-950 text-white shadow-md hover:bg-red-600"
        title="Delete annotation"
        aria-label="Delete annotation"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.preventDefault()
          event.stopPropagation()
          onDelete()
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

const AnnotationResizeHandles = ({
  annotation,
  annotations,
  handles,
  onLiveChange,
  onCommitChange
}: {
  annotation: IFreeCanvasImageAnnotation
  annotations: IFreeCanvasImageAnnotation[]
  handles: ImageAnnotationResizeHandle[]
  onLiveChange?: (annotations: IFreeCanvasImageAnnotation[]) => void
  onCommitChange?: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void
}) => (
  <>
    {handles.map(handle => (
      <button
        key={handle}
        type="button"
        className="absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow"
        style={resizeHandleStyle(handle)}
        title={`Resize ${handle}`}
        aria-label={`Resize ${handle}`}
        onPointerDown={event => {
          if (!onLiveChange || !onCommitChange) return
          startAnnotationResize(event, annotation, annotations, handle, onLiveChange, onCommitChange)
        }}
      />
    ))}
  </>
)

const resizeHandleStyle = (handle: ImageAnnotationResizeHandle): CSSProperties => {
  const style: CSSProperties = {}
  if (handle.includes('n')) style.top = 0
  if (handle.includes('s')) style.top = '100%'
  if (!handle.includes('n') && !handle.includes('s')) style.top = '50%'
  if (handle.includes('w')) style.left = 0
  if (handle.includes('e')) style.left = '100%'
  if (!handle.includes('w') && !handle.includes('e')) style.left = '50%'
  return style
}

const startBoxAnnotationDrag = (
  event: ReactPointerEvent<HTMLDivElement>,
  annotation: IFreeCanvasImageAnnotation,
  annotations: IFreeCanvasImageAnnotation[],
  onLiveChange: (annotations: IFreeCanvasImageAnnotation[]) => void,
  onCommitChange: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void,
  onSelect?: (annotationId: string) => void
) => {
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('input, textarea, button')) return
  const parentRect = event.currentTarget.parentElement?.getBoundingClientRect()
  if (!parentRect || parentRect.width <= 0 || parentRect.height <= 0) return
  event.preventDefault()
  event.stopPropagation()
  onSelect?.(annotation.id)
  const startX = event.clientX
  const startY = event.clientY
  const initialX = annotation.x
  const initialY = annotation.y
  const baseAnnotations = cloneImageAnnotations(annotations)
  let latestAnnotations = annotations

  const move = (moveEvent: PointerEvent) => {
    moveEvent.preventDefault()
    const nextX = clampUnit(initialX + (moveEvent.clientX - startX) / parentRect.width, 1 - annotation.width)
    const nextY = clampUnit(initialY + (moveEvent.clientY - startY) / parentRect.height, 1 - annotation.height)
    latestAnnotations = replaceImageAnnotation(baseAnnotations, annotation.id, { x: nextX, y: nextY, updatedAt: Date.now() })
    onLiveChange(latestAnnotations)
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    onCommitChange(latestAnnotations, annotation.id, baseAnnotations)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, { once: true })
}

const startAnnotationResize = (
  event: ReactPointerEvent<HTMLButtonElement>,
  annotation: IFreeCanvasImageAnnotation,
  annotations: IFreeCanvasImageAnnotation[],
  handle: ImageAnnotationResizeHandle,
  onLiveChange: (annotations: IFreeCanvasImageAnnotation[]) => void,
  onCommitChange: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void
) => {
  const parentRect = event.currentTarget.closest('[data-image-annotation-editor-frame]')?.getBoundingClientRect()
  if (!parentRect || parentRect.width <= 0 || parentRect.height <= 0) return
  event.preventDefault()
  event.stopPropagation()
  const startX = event.clientX
  const startY = event.clientY
  const baseAnnotations = cloneImageAnnotations(annotations)
  let latestAnnotations = annotations

  const move = (moveEvent: PointerEvent) => {
    moveEvent.preventDefault()
    const dx = (moveEvent.clientX - startX) / parentRect.width
    const dy = (moveEvent.clientY - startY) / parentRect.height
    const next = resizeImageAnnotation(annotation, handle, dx, dy)
    latestAnnotations = replaceImageAnnotation(baseAnnotations, annotation.id, { ...next, updatedAt: Date.now() })
    onLiveChange(latestAnnotations)
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    onCommitChange(latestAnnotations, annotation.id, baseAnnotations)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, { once: true })
}

const startArrowMove = (
  event: ReactPointerEvent<SVGLineElement>,
  annotation: IFreeCanvasImageAnnotation,
  annotations: IFreeCanvasImageAnnotation[],
  onLiveChange: (annotations: IFreeCanvasImageAnnotation[]) => void,
  onCommitChange: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void,
  onSelect?: (annotationId: string) => void
) => {
  const frameRect = event.currentTarget.closest('[data-image-annotation-editor-frame]')?.getBoundingClientRect()
  if (!frameRect || frameRect.width <= 0 || frameRect.height <= 0 || !annotation.points || annotation.points.length < 2) return
  event.preventDefault()
  event.stopPropagation()
  onSelect?.(annotation.id)
  const startX = event.clientX
  const startY = event.clientY
  const startPoints = annotation.points.map(point => ({ ...point }))
  const baseAnnotations = cloneImageAnnotations(annotations)
  let latestAnnotations = annotations
  const pointerId = event.pointerId
  let stopped = false

  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== pointerId) return
    if (moveEvent.buttons === 0) {
      stop()
      return
    }
    moveEvent.preventDefault()
    const dx = (moveEvent.clientX - startX) / frameRect.width
    const dy = (moveEvent.clientY - startY) / frameRect.height
    const points = startPoints.map(point => ({
      x: clampUnit(point.x + dx),
      y: clampUnit(point.y + dy)
    }))
    latestAnnotations = replaceImageAnnotation(baseAnnotations, annotation.id, { ...annotationFrameFromPoints(points), points, updatedAt: Date.now() })
    onLiveChange(latestAnnotations)
  }
  const stop = () => {
    if (stopped) return
    stopped = true
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    window.removeEventListener('blur', stop)
    onCommitChange(latestAnnotations, annotation.id, baseAnnotations)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, { once: true })
  window.addEventListener('pointercancel', stop, { once: true })
  window.addEventListener('blur', stop, { once: true })
}

const startArrowPointDrag = (
  event: ReactPointerEvent<HTMLButtonElement>,
  annotation: IFreeCanvasImageAnnotation,
  annotations: IFreeCanvasImageAnnotation[],
  pointIndex: number,
  onLiveChange: (annotations: IFreeCanvasImageAnnotation[]) => void,
  onCommitChange: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void,
  onSelect?: (annotationId: string) => void
) => {
  const frameRect = event.currentTarget.closest('[data-image-annotation-editor-frame]')?.getBoundingClientRect()
  if (!frameRect || frameRect.width <= 0 || frameRect.height <= 0 || !annotation.points || annotation.points.length < 2) return
  event.preventDefault()
  event.stopPropagation()
  onSelect?.(annotation.id)
  const baseAnnotations = cloneImageAnnotations(annotations)
  let latestAnnotations = annotations
  const pointerId = event.pointerId
  let stopped = false

  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== pointerId) return
    if (moveEvent.buttons === 0) {
      stop()
      return
    }
    moveEvent.preventDefault()
    const points = (annotation.points || []).map((point, index) => index === pointIndex
      ? {
        x: clampUnit((moveEvent.clientX - frameRect.left) / frameRect.width),
        y: clampUnit((moveEvent.clientY - frameRect.top) / frameRect.height)
      }
      : { ...point })
    latestAnnotations = replaceImageAnnotation(baseAnnotations, annotation.id, { ...annotationFrameFromPoints(points), points, updatedAt: Date.now() })
    onLiveChange(latestAnnotations)
  }
  const stop = () => {
    if (stopped) return
    stopped = true
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    window.removeEventListener('blur', stop)
    onCommitChange(latestAnnotations, annotation.id, baseAnnotations)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, { once: true })
  window.addEventListener('pointercancel', stop, { once: true })
  window.addEventListener('blur', stop, { once: true })
}

const startFreehandMove = (
  event: ReactPointerEvent<SVGPolylineElement>,
  annotation: IFreeCanvasImageAnnotation,
  annotations: IFreeCanvasImageAnnotation[],
  onLiveChange: (annotations: IFreeCanvasImageAnnotation[]) => void,
  onCommitChange: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void,
  onSelect?: (annotationId: string) => void
) => {
  const frameRect = event.currentTarget.closest('[data-image-annotation-editor-frame]')?.getBoundingClientRect()
  if (!frameRect || frameRect.width <= 0 || frameRect.height <= 0 || !annotation.points || annotation.points.length === 0) return
  event.preventDefault()
  event.stopPropagation()
  onSelect?.(annotation.id)
  startFreehandPointMove(event.clientX, event.clientY, frameRect, annotation, annotations, onLiveChange, onCommitChange)
}

const startFreehandBoxMove = (
  event: ReactPointerEvent<HTMLDivElement>,
  annotation: IFreeCanvasImageAnnotation,
  annotations: IFreeCanvasImageAnnotation[],
  onLiveChange: (annotations: IFreeCanvasImageAnnotation[]) => void,
  onCommitChange: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void,
  onSelect?: (annotationId: string) => void
) => {
  const frameRect = event.currentTarget.closest('[data-image-annotation-editor-frame]')?.getBoundingClientRect()
  if (!frameRect || frameRect.width <= 0 || frameRect.height <= 0 || !annotation.points || annotation.points.length === 0) return
  const target = event.target instanceof HTMLElement ? event.target : null
  if (target?.closest('button')) return
  event.preventDefault()
  event.stopPropagation()
  onSelect?.(annotation.id)
  startFreehandPointMove(event.clientX, event.clientY, frameRect, annotation, annotations, onLiveChange, onCommitChange)
}

const startFreehandPointMove = (
  startClientX: number,
  startClientY: number,
  frameRect: DOMRect,
  annotation: IFreeCanvasImageAnnotation,
  annotations: IFreeCanvasImageAnnotation[],
  onLiveChange: (annotations: IFreeCanvasImageAnnotation[]) => void,
  onCommitChange: (annotations: IFreeCanvasImageAnnotation[], selectedAnnotationId?: string | null, baseAnnotations?: IFreeCanvasImageAnnotation[]) => void
) => {
  const startPoints = (annotation.points || []).map(point => ({ ...point }))
  if (startPoints.length === 0) return
  const baseAnnotations = cloneImageAnnotations(annotations)
  let latestAnnotations = annotations
  let stopped = false

  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.buttons === 0) {
      stop()
      return
    }
    moveEvent.preventDefault()
    const dx = (moveEvent.clientX - startClientX) / frameRect.width
    const dy = (moveEvent.clientY - startClientY) / frameRect.height
    const adjusted = clampPointMoveDelta(startPoints, dx, dy)
    const points = startPoints.map(point => ({
      x: point.x + adjusted.dx,
      y: point.y + adjusted.dy
    }))
    latestAnnotations = replaceImageAnnotation(baseAnnotations, annotation.id, { ...annotationFrameFromPoints(points), points, updatedAt: Date.now() })
    onLiveChange(latestAnnotations)
  }
  const stop = () => {
    if (stopped) return
    stopped = true
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    window.removeEventListener('blur', stop)
    onCommitChange(latestAnnotations, annotation.id, baseAnnotations)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, { once: true })
  window.addEventListener('pointercancel', stop, { once: true })
  window.addEventListener('blur', stop, { once: true })
}

const ImageAnnotationEditor = ({
  node,
  imageUrl,
  onCancel,
  onSave
}: {
  node: IFreeCanvasImageNode
  imageUrl: string
  onCancel: () => void
  onSave: (annotations: IFreeCanvasImageAnnotation[]) => void
}) => {
  const editorRootRef = useRef<HTMLDivElement>(null)
  const imageFrameRef = useRef<HTMLDivElement>(null)
  const draftPointsRef = useRef<{ x: number; y: number }[]>([])
  const draftArrowRef = useRef<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)
  const activeDrawPointerIdRef = useRef<number | null>(null)
  const textEditBaseRef = useRef<IFreeCanvasImageAnnotation[] | null>(null)
  const [history, setHistory] = useState<ImageAnnotationHistory>(() => ({
    past: [],
    present: cloneImageAnnotations(node.annotations || []),
    future: []
  }))
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [editingTextAnnotationId, setEditingTextAnnotationId] = useState<string | null>(null)
  const [activeAnnotationMode, setActiveAnnotationMode] = useState<FreeCanvasImageAnnotationKind | null>(null)
  const [draftPoints, setDraftPoints] = useState<{ x: number; y: number }[]>([])
  const [draftArrow, setDraftArrow] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null)
  const draftAnnotations = history.present
  const selectedAnnotation = selectedAnnotationId
    ? draftAnnotations.find(annotation => annotation.id === selectedAnnotationId && annotation.kind === activeAnnotationMode) || null
    : null
  const selectedAnnotationIdInMode = selectedAnnotation?.id || null
  const activeModeLabel = activeAnnotationMode ? IMAGE_ANNOTATION_MODE_LABELS[activeAnnotationMode] : 'Select a tool'
  const crop = node.crop
  const imageStyle = crop ? {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${-crop.x / crop.width * 100}%`,
    top: `${-crop.y / crop.height * 100}%`
  } : undefined

  useEffect(() => {
    setHistory({
      past: [],
      present: cloneImageAnnotations(node.annotations || []),
      future: []
    })
    setSelectedAnnotationId(null)
    setEditingTextAnnotationId(null)
    setActiveAnnotationMode(null)
    setDraftPoints([])
    setDraftArrow(null)
    draftPointsRef.current = []
    draftArrowRef.current = null
    activeDrawPointerIdRef.current = null
    textEditBaseRef.current = null
  }, [node.id, node.annotations])

  useEffect(() => {
    editorRootRef.current?.focus()
  }, [node.id])

  const setLiveAnnotations = (annotations: IFreeCanvasImageAnnotation[]) => {
    setHistory(current => ({
      ...current,
      present: cloneImageAnnotations(annotations)
    }))
  }

  const commitDraft = useCallback((
    annotations: IFreeCanvasImageAnnotation[],
    nextSelectedAnnotationId: string | null = selectedAnnotationId,
    baseAnnotations?: IFreeCanvasImageAnnotation[]
  ) => {
    const nextPresent = cloneImageAnnotations(annotations)
    setHistory(current => {
      const base = cloneImageAnnotations(baseAnnotations || current.present)
      if (sameImageAnnotations(base, nextPresent)) {
        return { ...current, present: nextPresent }
      }
      return {
        past: [...current.past, base].slice(-80),
        present: nextPresent,
        future: []
      }
    })
    setSelectedAnnotationId(nextSelectedAnnotationId)
  }, [selectedAnnotationId])

  const commitAnnotationChange = useCallback((
    annotations: IFreeCanvasImageAnnotation[],
    nextSelectedAnnotationId: string | null = selectedAnnotationId,
    baseAnnotations?: IFreeCanvasImageAnnotation[]
  ) => {
    commitDraft(annotations, nextSelectedAnnotationId, baseAnnotations || textEditBaseRef.current || undefined)
    textEditBaseRef.current = null
  }, [commitDraft, selectedAnnotationId])

  const undo = () => {
    setHistory(current => {
      const previous = current.past[current.past.length - 1]
      if (!previous) return current
      setSelectedAnnotationId(null)
      setEditingTextAnnotationId(null)
      textEditBaseRef.current = null
      return {
        past: current.past.slice(0, -1),
        present: cloneImageAnnotations(previous),
        future: [cloneImageAnnotations(current.present), ...current.future]
      }
    })
  }

  const redo = () => {
    setHistory(current => {
      const next = current.future[0]
      if (!next) return current
      setSelectedAnnotationId(null)
      setEditingTextAnnotationId(null)
      textEditBaseRef.current = null
      return {
        past: [...current.past, cloneImageAnnotations(current.present)],
        present: cloneImageAnnotations(next),
        future: current.future.slice(1)
      }
    })
  }

  const beginTextEdit = useCallback((annotationId: string) => {
    const annotation = draftAnnotations.find(item => item.id === annotationId)
    if (!annotation || annotation.kind !== activeAnnotationMode) return
    textEditBaseRef.current = cloneImageAnnotations(draftAnnotations)
    setSelectedAnnotationId(annotationId)
    setEditingTextAnnotationId(annotationId)
  }, [activeAnnotationMode, draftAnnotations])

  const deleteAnnotation = useCallback((annotationId: string) => {
    const annotation = draftAnnotations.find(item => item.id === annotationId)
    if (!annotation || annotation.kind !== activeAnnotationMode) return
    commitDraft(draftAnnotations.filter(annotation => annotation.id !== annotationId), null)
    setEditingTextAnnotationId(null)
  }, [activeAnnotationMode, commitDraft, draftAnnotations])

  const deleteSelectedAnnotation = useCallback(() => {
    if (!selectedAnnotationIdInMode) return
    deleteAnnotation(selectedAnnotationIdInMode)
  }, [deleteAnnotation, selectedAnnotationIdInMode])

  const selectAnnotationMode = (kind: FreeCanvasImageAnnotationKind) => {
    setActiveAnnotationMode(kind)
    setSelectedAnnotationId(null)
    setEditingTextAnnotationId(null)
    setDraftPoints([])
    setDraftArrow(null)
    draftPointsRef.current = []
    draftArrowRef.current = null
    textEditBaseRef.current = null
  }

  const imagePoint = (event: ReactPointerEvent): { x: number; y: number } | null => {
    const rect = imageFrameRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null
    return {
      x: clampUnit((event.clientX - rect.left) / rect.width),
      y: clampUnit((event.clientY - rect.top) / rect.height)
    }
  }

  const pointHitsAnnotation = (point: { x: number; y: number }) => draftAnnotations.some(annotation => {
    const box = annotation.points && annotation.points.length > 0
      ? annotationBoxFromPoints(annotation.points)
      : annotation
    const padding = annotation.kind === 'arrow' || annotation.kind === 'freehand' ? 0.015 : 0
    return point.x >= box.x - padding &&
      point.x <= box.x + box.width + padding &&
      point.y >= box.y - padding &&
      point.y <= box.y + box.height + padding
  })

  const createAnnotationAtPoint = (kind: 'text' | 'rect' | 'shotNumber', point: { x: number; y: number }) => {
    const annotation = createFreeCanvasImageAnnotation(kind)
    const height = kind === 'shotNumber' ? annotation.width : annotation.height
    const placed = {
      ...annotation,
      x: clampNumber(point.x - annotation.width / 2, 0, 1 - annotation.width),
      y: clampNumber(point.y - height / 2, 0, 1 - height),
      height
    }
    commitDraft([...draftAnnotations, placed], placed.id)
  }

  const handleFramePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeAnnotationMode) return
    if (event.button !== 0) return
    const point = imagePoint(event)
    if (!point) return
    if (pointHitsAnnotation(point)) return
    event.preventDefault()
    event.stopPropagation()
    if (activeAnnotationMode === 'text' || activeAnnotationMode === 'rect' || activeAnnotationMode === 'shotNumber') {
      createAnnotationAtPoint(activeAnnotationMode, point)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    activeDrawPointerIdRef.current = event.pointerId
    if (activeAnnotationMode === 'arrow') {
      const arrow = { start: point, end: point }
      draftArrowRef.current = arrow
      setDraftArrow(arrow)
      return
    }
    if (activeAnnotationMode === 'freehand') {
      draftPointsRef.current = [point]
      setDraftPoints([point])
    }
  }

  const releaseActiveDrawPointer = (target: HTMLDivElement) => {
    const pointerId = activeDrawPointerIdRef.current
    if (pointerId !== null && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
    activeDrawPointerIdRef.current = null
  }

  const drawActiveTool = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeDrawPointerIdRef.current !== null && event.pointerId !== activeDrawPointerIdRef.current) return
    if (activeDrawPointerIdRef.current !== null && event.buttons === 0) {
      endActiveTool(event)
      return
    }
    if (activeAnnotationMode === 'arrow' && draftArrowRef.current) {
      const point = imagePoint(event)
      if (!point) return
      event.preventDefault()
      event.stopPropagation()
      draftArrowRef.current = { ...draftArrowRef.current, end: point }
      setDraftArrow(draftArrowRef.current)
      return
    }
    if (activeAnnotationMode !== 'freehand' || draftPointsRef.current.length === 0) return
    const point = imagePoint(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    const previous = draftPointsRef.current[draftPointsRef.current.length - 1]
    if (previous && Math.abs(previous.x - point.x) + Math.abs(previous.y - point.y) < 0.004) return
    draftPointsRef.current = [...draftPointsRef.current, point]
    setDraftPoints(draftPointsRef.current)
  }

  const endActiveTool = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeDrawPointerIdRef.current !== null && event.pointerId !== activeDrawPointerIdRef.current) return
    if (activeAnnotationMode !== 'freehand' && activeAnnotationMode !== 'arrow') return
    event.preventDefault()
    event.stopPropagation()
    if (activeAnnotationMode === 'arrow' && draftArrowRef.current) {
      const points = [draftArrowRef.current.start, draftArrowRef.current.end]
      const distance = Math.abs(points[0].x - points[1].x) + Math.abs(points[0].y - points[1].y)
      if (distance > 0.01) {
        const annotation = {
          ...createFreeCanvasImageAnnotation('arrow'),
          ...annotationFrameFromPoints(points),
          points,
          color: '#ef4423'
        }
        commitDraft([...draftAnnotations, annotation], annotation.id)
      }
      draftArrowRef.current = null
      setDraftArrow(null)
      releaseActiveDrawPointer(event.currentTarget)
      return
    }
    if (activeAnnotationMode === 'freehand' && draftPointsRef.current.length > 1) {
      const annotation = {
        ...createFreeCanvasImageAnnotation('freehand'),
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        points: draftPointsRef.current
      }
      commitDraft([...draftAnnotations, annotation], annotation.id)
    }
    draftPointsRef.current = []
    setDraftPoints([])
    releaseActiveDrawPointer(event.currentTarget)
  }

  const handleEditorKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
    const target = event.target instanceof HTMLElement ? event.target : null
    const textInput = target?.closest('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null
    const key = event.key.toLowerCase()

    if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault()
      redo()
      return
    }
    if (textInput) {
      if (event.key === 'Escape') {
        event.preventDefault()
        textInput.blur()
      }
      if (event.key === 'Enter' && textInput instanceof HTMLInputElement) {
        event.preventDefault()
        textInput.blur()
      }
      return
    }
    if (event.key === 'Escape' && editingTextAnnotationId) {
      event.preventDefault()
      setEditingTextAnnotationId(null)
      textEditBaseRef.current = null
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAnnotationIdInMode) {
      event.preventDefault()
      deleteSelectedAnnotation()
      return
    }
    if (event.key === 'Enter' && selectedAnnotationIdInMode) {
      const selected = draftAnnotations.find(annotation => annotation.id === selectedAnnotationIdInMode && annotation.kind === activeAnnotationMode)
      if (selected?.kind === 'text' || selected?.kind === 'shotNumber') {
        event.preventDefault()
        beginTextEdit(selected.id)
      }
    }
  }

  const stopEditorPointerPropagation = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
  }

  const focusEditorPointerCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('input, textarea, button')) return
    editorRootRef.current?.focus()
  }

  const stopEditorMousePropagation = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
  }

  return (
    <div
      ref={editorRootRef}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/55 p-8 backdrop-blur-sm"
      data-image-annotation-editor
      tabIndex={-1}
      onKeyDownCapture={handleEditorKeyDownCapture}
      onPointerDownCapture={focusEditorPointerCapture}
      onPointerDown={stopEditorPointerPropagation}
      onMouseDown={stopEditorMousePropagation}
      onClick={stopEditorMousePropagation}
    >
      <section className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-[8px] border border-white/15 bg-[#f7f7f5] shadow-[0_32px_100px_rgba(15,23,42,0.35)]">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-black text-gray-950">Edit image annotations</h2>
            <p className="mt-0.5 text-xs font-semibold text-gray-500">{node.title}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-full p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-35"
              onClick={undo}
              disabled={history.past.length === 0}
              title="Undo"
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-full p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-35"
              onClick={redo}
              disabled={history.future.length === 0}
              title="Redo"
              aria-label="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button type="button" className="rounded-full p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-950" onClick={onCancel} title="Close annotation editor" aria-label="Close annotation editor">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[72px_1fr] overflow-hidden">
          <aside className="flex flex-col items-center gap-2 border-r border-gray-200 bg-white/70 px-3 py-4">
            <ImageEditorToolButton title="Text mode" active={activeAnnotationMode === 'text'} onClick={() => selectAnnotationMode('text')}><Type className="h-4 w-4" /></ImageEditorToolButton>
            <ImageEditorToolButton title="Rectangle mode" active={activeAnnotationMode === 'rect'} onClick={() => selectAnnotationMode('rect')}><Square className="h-4 w-4" /></ImageEditorToolButton>
            <ImageEditorToolButton title="Arrow mode" active={activeAnnotationMode === 'arrow'} onClick={() => selectAnnotationMode('arrow')}><ArrowRight className="h-4 w-4" /></ImageEditorToolButton>
            <ImageEditorToolButton title="Brush mode" active={activeAnnotationMode === 'freehand'} onClick={() => selectAnnotationMode('freehand')}><Brush className="h-4 w-4" /></ImageEditorToolButton>
            <ImageEditorToolButton title="Shot number mode" active={activeAnnotationMode === 'shotNumber'} onClick={() => selectAnnotationMode('shotNumber')}><Hash className="h-4 w-4" /></ImageEditorToolButton>
          </aside>

          <div className="min-h-0 overflow-auto p-8">
            <div
              ref={imageFrameRef}
              data-image-annotation-editor-frame
              className={`relative mx-auto flex max-h-[680px] max-w-[960px] items-center justify-center overflow-hidden bg-white shadow-[0_10px_35px_rgba(15,23,42,0.14)] ${activeAnnotationMode ? 'cursor-crosshair' : ''}`}
              style={{ aspectRatio: `${node.width} / ${node.height}`, width: 'min(74vw, 960px)' }}
              onPointerDown={handleFramePointerDown}
              onPointerMove={drawActiveTool}
              onPointerUp={endActiveTool}
              onPointerCancel={endActiveTool}
              onLostPointerCapture={endActiveTool}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={node.title}
                  className={`pointer-events-none select-none ${crop ? 'absolute max-w-none' : 'h-full w-full object-contain'}`}
                  style={imageStyle}
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full min-h-[360px] items-center justify-center text-xs font-semibold text-gray-400">
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Drop image
                </div>
              )}
              <ImageAnnotationsLayer
                annotations={draftAnnotations}
                mode="edit"
                activeAnnotationMode={activeAnnotationMode}
                selectedAnnotationId={selectedAnnotationId}
                editingTextAnnotationId={editingTextAnnotationId}
                interactive={activeAnnotationMode !== null}
                onSelect={annotationId => {
                  const annotation = draftAnnotations.find(item => item.id === annotationId)
                  if (!annotation || annotation.kind !== activeAnnotationMode) return
                  setSelectedAnnotationId(annotationId)
                }}
                onClearSelection={() => {
                  setSelectedAnnotationId(null)
                  setEditingTextAnnotationId(null)
                }}
                onBeginTextEdit={beginTextEdit}
                onEndTextEdit={() => setEditingTextAnnotationId(null)}
                onLiveChange={setLiveAnnotations}
                onCommitChange={commitAnnotationChange}
                onDelete={deleteAnnotation}
              />
              {draftPoints.length > 1 && (
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                  <polyline
                    points={draftPoints.map(point => `${point.x},${point.y}`).join(' ')}
                    fill="none"
                    stroke="#ef4423"
                    strokeWidth={0.008}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {draftArrow && (
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <marker id="draft-image-arrow" markerWidth="0.08" markerHeight="0.08" refX="0.07" refY="0.04" orient="auto" markerUnits="strokeWidth">
                      <path d="M 0 0 L 0.08 0.04 L 0 0.08 z" fill="#ef4423" />
                    </marker>
                  </defs>
                  <line
                    x1={draftArrow.start.x}
                    y1={draftArrow.start.y}
                    x2={draftArrow.end.x}
                    y2={draftArrow.end.y}
                    stroke="#ef4423"
                    strokeWidth={0.01}
                    strokeLinecap="round"
                    markerEnd="url(#draft-image-arrow)"
                  />
                </svg>
              )}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          <span className="text-xs font-semibold text-gray-500">{draftAnnotations.length} annotations 璺?Mode: {activeModeLabel}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
              onClick={deleteSelectedAnnotation}
              disabled={!selectedAnnotationIdInMode}
              title="Delete selected annotation"
              aria-label="Delete selected annotation"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button type="button" className="rounded-full px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="rounded-full bg-gray-950 px-5 py-2 text-sm font-bold text-white transition active:scale-[0.98]"
              onClick={() => onSave(history.present)}
            >
              Save annotations
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}

const ImageEditorToolButton = ({
  title,
  active = false,
  onClick,
  children
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    className={`flex h-11 w-11 items-center justify-center rounded-[8px] border text-gray-700 transition ${active ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white hover:bg-gray-100 hover:text-gray-950'}`}
    title={title}
    aria-label={title}
    onClick={onClick}
  >
    {children}
  </button>
)

const replaceImageAnnotation = (
  annotations: IFreeCanvasImageAnnotation[],
  annotationId: string,
  updates: Partial<Omit<IFreeCanvasImageAnnotation, 'id' | 'kind' | 'createdAt'>>
): IFreeCanvasImageAnnotation[] =>
  annotations.map(annotation => annotation.id === annotationId
    ? { ...annotation, ...updates, meta: updates.meta || annotation.meta }
    : annotation)

const resizeImageAnnotation = (
  annotation: IFreeCanvasImageAnnotation,
  handle: ImageAnnotationResizeHandle,
  dx: number,
  dy: number
): Pick<IFreeCanvasImageAnnotation, 'x' | 'y' | 'width' | 'height'> => {
  if (annotation.kind === 'shotNumber') {
    const signedDelta = handle.includes('w') ? -dx : dx
    const nextSize = clampNumber(annotation.width + signedDelta, 0.025, 1)
    const width = Math.min(nextSize, handle.includes('w') ? annotation.x + annotation.width : 1 - annotation.x)
    const x = handle.includes('w') ? clampUnit(annotation.x + annotation.width - width, 1 - width) : annotation.x
    return { x, y: annotation.y, width, height: width }
  }

  let x = annotation.x
  let y = annotation.y
  let width = annotation.width
  let height = annotation.height

  if (handle.includes('e')) width = clampNumber(annotation.width + dx, 0.02, 1 - annotation.x)
  if (handle.includes('s')) height = clampNumber(annotation.height + dy, 0.02, 1 - annotation.y)
  if (handle.includes('w')) {
    const right = annotation.x + annotation.width
    x = clampNumber(annotation.x + dx, 0, right - 0.02)
    width = right - x
  }
  if (handle.includes('n')) {
    const bottom = annotation.y + annotation.height
    y = clampNumber(annotation.y + dy, 0, bottom - 0.02)
    height = bottom - y
  }

  return { x, y, width, height }
}

const annotationBoxFromPoints = (points: { x: number; y: number }[]): Pick<IFreeCanvasImageAnnotation, 'x' | 'y' | 'width' | 'height'> => {
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return {
    x: clampUnit(minX),
    y: clampUnit(minY),
    width: Math.max(0.01, maxX - minX),
    height: Math.max(0.01, maxY - minY)
  }
}

const annotationFrameFromPoints = (points: { x: number; y: number }[]): Pick<IFreeCanvasImageAnnotation, 'x' | 'y' | 'width' | 'height'> =>
  annotationBoxFromPoints(points)

const clampPointMoveDelta = (
  points: { x: number; y: number }[],
  dx: number,
  dy: number
): { dx: number; dy: number } => {
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    dx: clampNumber(dx, -minX, 1 - maxX),
    dy: clampNumber(dy, -minY, 1 - maxY)
  }
}

const sameImageAnnotations = (left: IFreeCanvasImageAnnotation[], right: IFreeCanvasImageAnnotation[]): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const cloneImageAnnotations = (annotations: IFreeCanvasImageAnnotation[]): IFreeCanvasImageAnnotation[] =>
  annotations.map(annotation => ({
    ...annotation,
    points: annotation.points?.map(point => ({ ...point })),
    meta: { ...annotation.meta }
  }))

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
  onCopy,
  onStyleChange
}: {
  node: IFreeCanvasTextNode
  onEdit: () => void
  onCopy: () => void
  onStyleChange: (updates: Parameters<typeof updateFreeCanvasTextNodeStyle>[2]) => void
}) => (
  <div
    className="nodrag nowheel flex items-center gap-2 rounded-full border border-gray-200 bg-gray-950 px-3 py-2 text-white shadow-[0_18px_60px_rgba(15,23,42,0.22)]"
    onPointerDown={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
  >
    <button
      type="button"
      className="nodrag rounded-full px-3 py-1.5 text-xs font-black text-white hover:bg-white/10"
      onClick={onEdit}
    >
      Edit
    </button>
    <button
      type="button"
      className="nodrag flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
      data-free-canvas-copy-text
      title="复制文本"
      aria-label="复制文本"
      onClick={onCopy}
    >
      <Copy className="h-4 w-4" />
    </button>
    <select
      className="nodrag min-w-[116px] rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black text-white outline-none transition hover:border-white/40 hover:bg-white/15 focus:border-white/60 focus:ring-2 focus:ring-white/25"
      data-free-canvas-font-size
      value={node.fontSize}
      onChange={event => onStyleChange({ fontSize: event.target.value as IFreeCanvasTextNode['fontSize'] })}
      title="复制文本"
      aria-label="复制文本"
    >
      {FONT_SIZES.map(size => (
        <option key={size} value={size} className="bg-white text-gray-950">
          {size}
        </option>
      ))}
    </select>
    <div className="h-6 w-px bg-white/20" />
    <Palette className="h-4 w-4 text-white/70" />
    {TEXT_COLORS.map(color => (
      <button
        key={color}
        type="button"
        className="nodrag h-5 w-5 rounded-full border border-white/30"
        style={{ backgroundColor: color }}
        title={color}
        onClick={() => onStyleChange({ color })}
      />
    ))}
  </div>
)

export const CanvasBottomToolbar = ({
  quickDrawerOpen,
  quickPresets,
  onCreateText,
  onCreateImage,
  onCreateImageGenerator,
  imageGeneratorCreating = false,
  onToggleQuickDrawer,
  onOpenQuickPresetComposer,
  onEditQuickPreset,
  onUseQuickPreset
}: {
  quickDrawerOpen: boolean
  quickPresets: IPreset[]
  onCreateText: () => void
  onCreateImage: () => void
  onCreateImageGenerator?: () => void
  imageGeneratorCreating?: boolean
  onToggleQuickDrawer: () => void
  onOpenQuickPresetComposer: () => void
  onEditQuickPreset: (preset: IPreset) => void
  onUseQuickPreset: (preset: IPreset) => void
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
                  onClick={() => onUseQuickPreset(preset)}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600">
                    <MessageSquare className="h-4 w-4" />
                   </span>
                   <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-gray-950">{preset.label}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-950"
                  onClick={() => onEditQuickPreset(preset)}
                  title={`编辑 ${preset.label}`}
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
        {onCreateImageGenerator && (
          <ToolbarButton title="Image generator" onClick={onCreateImageGenerator} disabled={imageGeneratorCreating}><Brush className="h-4 w-4" /></ToolbarButton>
        )}
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
  draft: QuickMessageDraft
  editing: boolean
  rightOffset: number
  onDraftChange: (draft: QuickMessageDraft) => void
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

const ToolbarButton = ({ title, onClick, children, disabled = false }: { title: string; onClick: () => void; children: ReactNode; disabled?: boolean }) => (
  <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-950 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" title={title} disabled={disabled} onClick={() => { if (!disabled) onClick() }}>
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
  freeCanvasNode: FreeCanvasNode,
  imageGeneratorNode: ImageGeneratorFlowNode
}

const nextNodePosition = (reactFlow: ReturnType<typeof useReactFlow<FreeCanvasFlowNode>>, count: number) => (
  reactFlow.screenToFlowPosition({ x: window.innerWidth / 2 + count * 20, y: window.innerHeight / 2 + count * 16 })
)

const clampUnit = (value: number, max = 1): number =>
  Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), Math.max(0, max))

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(Math.max(Number.isFinite(value) ? value : min, min), max)

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

export default FreeCanvasBuilderScreen
