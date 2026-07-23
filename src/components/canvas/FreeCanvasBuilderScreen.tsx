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
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, BookOpen, Brush, ChevronRight, Copy, Hash, Image as ImageIcon, Loader2, MessageSquare, MousePointer2, Palette, Pencil, Plus, Redo2, Save, Scissors, Square, Trash2, Type, Undo2, X } from 'lucide-react'
import { AIChatbotBox } from '@/components/AgentCollaborationPanel'
import { PromptLibraryPreviewPanel } from '@/components/PromptLibraryPreviewMode'
import { PromptPresetPreviewDialog } from '@/components/prompt-media/PromptPresetPreviewDialog'
import { ImageCropEditor } from '@/components/canvas/ImageCropEditor'
import {
  ImageGeneratorNode
} from '@/components/canvas/nodes/ImageGeneratorNode'
import { ImageGenerationConversationPanel } from '@/components/canvas/image-generation/ImageGenerationConversationPanel'
import { AnnotationEditorDialog } from '@/components/canvas/image-generation/AnnotationEditorDialog'
import { RegionEditorDialog } from '@/components/canvas/image-generation/RegionEditorDialog'
import { ProjectResourceLibrary } from '@/components/canvas/ProjectResourceLibrary'
import type { ImageGenerationConversationSummary as ImageGenerationConversationView, ImageGenerationTurn, ImageGenerationTurnAction } from '@/components/canvas/image-generation/types'
import { canvasImageAssetUrl, fitImageNode, getClipboardImageFiles, isFileDrag, isSupportedImageFile, uploadFreeCanvasImageFiles } from '@/components/canvas/canvas-image-assets'
import { createFreeCanvasCroppedNodes, createFreeCanvasMediaNode, type FreeCanvasCropLines, type FreeCanvasMediaNode } from '@/domain/free-canvas/free-canvas'
import {
  createFreeCanvasImageNodeFromMedia,
  createFreeCanvasImageGenerationPlaceholder,
  createFreeCanvasImageAnnotation,
  createFreeCanvasTextNode,
  createQuickTextNode,
  freeCanvasTextSegmentsToPlainText,
  completeFreeCanvasImageGeneration,
  failFreeCanvasImageGeneration,
  isRunningFreeCanvasImageGeneration,
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
import {
  buildConversationGenerationRequest,
  createEmptyConversationDraft,
  injectCanvasNodesIntoDraft,
  promptDocumentPlainText,
  projectRunToTurn,
  type ImageGenerationComposerDraft,
  type ProjectImageGenerationInput,
  type ProjectImageGenerationWorkflow
} from '@/domain/image-generation/project-conversation'
import {
  moveComposerImageInput,
  unresolvedPromptReferenceIds,
  switchComposerImageInputRole,
  validateComposerCustomSize
} from '@/domain/image-generation/composer-draft'
import { appendSubjectReference } from '@/domain/project-resources/project-resource-library'
import {
  isProjectMaterialDrag,
  readProjectMaterialDrag
} from '@/domain/project-resources/project-resource-drag'
import {
  rasterizeAnnotationDocument,
  type ImageAnnotationDocument
} from '@/domain/image-generation/annotations'
import { compileImageGeneratorPrompt } from '@/domain/image-generation/prompt-compiler'
import { getRuntimeErrorPresentation, type ModelAssignment, type ModelCatalogEntry, type ModelConnection } from '@/domain/models/model-management'
import { modelManagementClient } from '@/services/model-management-client'
import { createImageGenerationRunId, ImageGenerationClientError, requestImageGeneration } from '@/services/image-generation-client'
import {
  storageServiceClient,
  type ImageGenerationConversationSummary,
  type ImageGenerationRun,
  type ProjectResource
} from '@/storage/storage-service-client'
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
  onPersistCanvas?: (freeCanvas: IFreeCanvasProject) => Promise<boolean>
  previewMode?: boolean
  imageGenerationNodeV1?: boolean
  onConfigureImageModel?: (context: { projectId: string; nodeId?: string; returnTarget: 'free-canvas' }) => void
  onOpenMedia?: () => void
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
  onConfigureImageModel?: (nodeId: string) => void
  onContinueLegacyImageCreation: (nodeId: string) => void
  onContinueImageCreation: (nodeId: string, workflow: ProjectImageGenerationWorkflow) => void
  imageGeneratorInputSummary?: { promptConnected: boolean; sourceConnected: boolean; referenceCount: number }
}

type FreeCanvasFlowNode = Node<FreeCanvasFlowNodeData>
type ProjectMaterialCanvasSource = Pick<
  ProjectResource,
  'id' | 'name' | 'sourceAssetId' | 'previewAssetId' | 'width' | 'height'
>

const TEXT_COLORS = ['#111827', '#ef4423', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff']
const FONT_SIZES: IFreeCanvasTextNode['fontSize'][] = ['small', 'medium', 'large', 'extra-large', 'huge']
const emptyQuickTextPresetDraft: QuickMessageDraft = { name: '', body: '' }
const composerReferenceImageExtensions = /\.(?:jpe?g|png|webp|bmp|tiff?|gif|heic|heif)$/i

const isComposerReferenceImage = (file: File): boolean =>
  file.type.startsWith('image/') || composerReferenceImageExtensions.test(file.name)

const isCanvasImageDrag = (dataTransfer: DataTransfer): boolean =>
  isFileDrag(dataTransfer) || isProjectMaterialDrag(dataTransfer)

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
  onPersistCanvas,
  previewMode = false,
  imageGenerationNodeV1 = false,
  onConfigureImageModel,
  onOpenMedia
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
  const [resourceLibraryExpanded, setResourceLibraryExpanded] = useState(false)
  const [rightPanelMode, setRightPanelMode] = useState<'agent' | 'image-generation' | 'prompt-library'>('agent')
  const [previewPreset, setPreviewPreset] = useState<IPreset | null>(null)
  const [quickDrawerOpen, setQuickDrawerOpen] = useState(false)
  const [quickComposerOpen, setQuickComposerOpen] = useState(false)
  const [quickEditingPresetId, setQuickEditingPresetId] = useState<string | null>(null)
  const [quickPresetDraft, setQuickPresetDraft] = useState<QuickMessageDraft>(emptyQuickTextPresetDraft)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null)
  const [fileDragActive, setFileDragActive] = useState(false)
  const [composerFileDragActive, setComposerFileDragActive] = useState(false)
  const [cropNodeId, setCropNodeId] = useState<string | null>(null)
  const [annotationEditorNodeId, setAnnotationEditorNodeId] = useState<string | null>(null)
  const [imageCatalogModels, setImageCatalogModels] = useState<ModelCatalogEntry[]>([])
  const [imageConnections, setImageConnections] = useState<ModelConnection[]>([])
  const [imageAssignment, setImageAssignment] = useState<ModelAssignment | null>(null)
  const [imageRuntimeReady, setImageRuntimeReady] = useState(false)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [activeImageConversationId, setActiveImageConversationId] = useState<string | null>(null)
  const [imageConversations, setImageConversations] = useState<ImageGenerationConversationSummary[]>([])
  const [imageConversationNextCursor, setImageConversationNextCursor] = useState<string | null>(null)
  const [imageConversationRuns, setImageConversationRuns] = useState<Record<string, ImageGenerationRun[]>>({})
  const [imageRunNextCursors, setImageRunNextCursors] = useState<Record<string, string | null>>({})
  const [imageComposerDraft, setImageComposerDraft] = useState<ImageGenerationComposerDraft>(() => createEmptyConversationDraft())
  const [imageGenerationBusy, setImageGenerationBusy] = useState(false)
  const [imageRegionEditorOpen, setImageRegionEditorOpen] = useState(false)
  const [imageAnnotationTarget, setImageAnnotationTarget] = useState<{
    referenceId: string
    width: number
    height: number
  } | null>(null)
  const [imageAnnotationDocuments, setImageAnnotationDocuments] = useState<Record<string, ImageAnnotationDocument>>({})
  const [optimisticImageTurn, setOptimisticImageTurn] = useState<ImageGenerationTurn | null>(null)
  const selectedNode = freeCanvas.nodes.find(node => node.id === freeCanvas.selectedNodeId) || null
  const selectedImageNode = selectedNode?.kind === 'image' ? selectedNode : null
  const quickPresets = useMemo(() => presets.filter(isQuickMessagePreset), [presets])
  const cropNode = cropNodeId
    ? freeCanvas.nodes.find((node): node is IFreeCanvasImageNode => node.id === cropNodeId && node.kind === 'image')
    : null
  const annotationEditorNode = annotationEditorNodeId
    ? freeCanvas.nodes.find((node): node is IFreeCanvasImageNode => node.id === annotationEditorNodeId && node.kind === 'image')
    : null
  const isCanvasKeyboardLocked = Boolean(annotationEditorNode || cropNode)
  const freeCanvasRef = useRef(freeCanvas)
  const onChangeRef = useRef(onChange)
  const selectedImageNodeRef = useRef<IFreeCanvasImageNode | null>(selectedImageNode)
  const copiedImageNodeRef = useRef<IFreeCanvasImageNode | null>(null)
  const fileDragDepthRef = useRef(0)
  const composerFileDragDepthRef = useRef(0)
  const activeProjectIdRef = useRef(activeProject.id)
  const placementProcessingRef = useRef(false)
  const unpersistedPlacementRunIdsRef = useRef(new Set<string>())
  const emitGenerationCanvas = useCallback((next: IFreeCanvasProject) => {
    freeCanvasRef.current = next
    onChangeRef.current(next)
  }, [])

  useEffect(() => {
    if (!presetsInitialized) initPresets()
  }, [initPresets, presetsInitialized])

  useEffect(() => {
    let active = true
    void Promise.all([
      modelManagementClient.getCatalog(),
      modelManagementClient.listConnections(),
      modelManagementClient.listAssignments(),
      modelManagementClient.getImageGenerationStatus()
    ]).then(([catalog, connections, assignments, status]) => {
      if (!active) return
      const imageModels = catalog.models.filter(model => model.modality === 'image')
      const assignment = assignments.find(item => item.slot === 'image.primary') || null
      setImageCatalogModels(imageModels)
      setImageConnections(connections)
      setImageAssignment(assignment)
      setImageRuntimeReady(status.serverEnabled && status.credentialStore.available && status.providers.some(provider => provider.status === 'ready'))
      if (assignment) {
        setImageComposerDraft(current => ({
          ...current,
          connectionId: current.connectionId || assignment.connectionId,
          modelId: current.modelId || assignment.modelId
        }))
      }
    }).catch(() => {
      if (!active) return
      setImageCatalogModels([])
      setImageConnections([])
      setImageAssignment(null)
      setImageRuntimeReady(false)
    })
    return () => { active = false }
  }, [])

  const loadImageConversations = useCallback(async (
    projectId: string,
    signal?: AbortSignal,
    cursor?: string | null
  ) => {
    const page = await storageServiceClient.imageGenerationConversations.getPage({
      projectId,
      cursor,
      limit: 20,
      signal
    })
    if (signal?.aborted || activeProjectIdRef.current !== projectId) return
    setImageConversations(current => cursor
      ? mergeById(current, page.conversations)
      : page.conversations)
    setImageConversationNextCursor(page.nextCursor)
  }, [])

  const loadImageConversationRuns = useCallback(async (
    projectId: string,
    conversationId: string,
    signal?: AbortSignal,
    cursor?: string | null
  ) => {
    const page = await storageServiceClient.imageGenerationConversations.getRuns({
      projectId,
      conversationId,
      cursor,
      limit: 25,
      signal
    })
    if (signal?.aborted || activeProjectIdRef.current !== projectId) return
    setImageConversationRuns(current => ({
      ...current,
      [conversationId]: cursor
        ? mergeById(current[conversationId] || [], page.runs)
        : page.runs
    }))
    setImageRunNextCursors(current => ({ ...current, [conversationId]: page.nextCursor }))
  }, [])

  useEffect(() => {
    activeProjectIdRef.current = activeProject.id
    freeCanvasRef.current = freeCanvas
    onChangeRef.current = onChange
    selectedImageNodeRef.current = selectedImageNode
  }, [activeProject.id, freeCanvas, onChange, selectedImageNode])

  useEffect(() => {
    const controller = new AbortController()
    setActiveImageConversationId(null)
    setImageConversations([])
    setImageConversationNextCursor(null)
    setImageConversationRuns({})
    setImageRunNextCursors({})
    setSelectedNodeIds([])
    setOptimisticImageTurn(null)
    setImageGenerationBusy(false)
    setImageRegionEditorOpen(false)
    setImageAnnotationTarget(null)
    setImageAnnotationDocuments({})
    setImageComposerDraft(current => createEmptyConversationDraft({
      connectionId: imageAssignment?.connectionId || current.connectionId,
      modelId: imageAssignment?.modelId || current.modelId,
      resolution: current.resolution,
      aspectRatio: current.aspectRatio,
      width: current.width,
      height: current.height,
      promptOptimization: current.promptOptimization,
      outputFormat: current.outputFormat,
      watermark: current.watermark
    }))
    void loadImageConversations(activeProject.id, controller.signal).catch(() => undefined)
    return () => controller.abort()
  }, [activeProject.id, imageAssignment?.connectionId, imageAssignment?.modelId, loadImageConversations])

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

  const placeProjectMaterialAt = useCallback((
    resource: ProjectMaterialCanvasSource,
    position: { x: number; y: number }
  ) => {
    const size = fitImageNode(resource.width, resource.height)
    const media = {
      ...createFreeCanvasMediaNode('imageAsset', {
        x: position.x - size.width / 2,
        y: position.y - size.height / 2
      }),
      title: resource.name,
      width: size.width,
      height: size.height,
      assetId: resource.previewAssetId,
      imageUrl: canvasImageAssetUrl(resource.previewAssetId),
      meta: {
        originalWidth: resource.width,
        originalHeight: resource.height,
        projectResourceId: resource.id,
        sourceAssetId: resource.sourceAssetId
      }
    }
    const node = createFreeCanvasImageNodeFromMedia(media)
    onChange({
      ...freeCanvas,
      nodes: [...freeCanvas.nodes, node],
      selectedNodeId: node.id
    })
  }, [freeCanvas, onChange])

  const placeProjectMaterial = useCallback((resource: ProjectResource) => {
    const leftInset = resourceLibraryExpanded && window.innerWidth >= 1440 ? 280 : 44
    const rightInset = rightPanelCollapsed ? 56 : 456
    placeProjectMaterialAt(resource, reactFlow.screenToFlowPosition({
      x: leftInset + Math.max(0, window.innerWidth - leftInset - rightInset) / 2,
      y: 56 + Math.max(0, window.innerHeight - 56) / 2
    }))
  }, [placeProjectMaterialAt, reactFlow, resourceLibraryExpanded, rightPanelCollapsed])

  const addProjectSubjectToComposer = useCallback((resource: ProjectResource) => {
    const activeModel = imageCatalogModels.find(model => model.id === imageComposerDraft.modelId)
    const maxReferenceImages = activeModel?.capabilities?.maxReferenceImages ?? 10
    const result = appendSubjectReference(imageComposerDraft.inputs, resource, maxReferenceImages)
    if (!result.reason) {
      setImageComposerDraft(current => ({ ...current, inputs: result.inputs }))
      setRightPanelMode('image-generation')
      setRightPanelCollapsed(false)
    }
    return { reason: result.reason }
  }, [imageCatalogModels, imageComposerDraft.inputs, imageComposerDraft.modelId])

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
      if (!imageNode || isRunningFreeCanvasImageGeneration(imageNode)) return
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
    emitGenerationCanvas(updateFreeCanvasImageNodeFrame(freeCanvasRef.current, nodeId, frame))
  }, [emitGenerationCanvas])

  const saveImageAnnotations = useCallback((nodeId: string, annotations: IFreeCanvasImageAnnotation[]) => {
    onChange(replaceFreeCanvasImageAnnotations(freeCanvas, nodeId, annotations))
    setAnnotationEditorNodeId(null)
  }, [freeCanvas, onChange])

  const readyImageBindings = imageConnections.flatMap(connection => {
    if (!connection.enabled || !connection.credentialConfigured || !connection.lastTest?.ok) return []
    return imageCatalogModels
      .filter(model => model.providerId === connection.providerId)
      .map(model => ({ connection, model }))
  })
  const selectedImageConnection = imageConnections.find(
    connection => connection.id === imageComposerDraft.connectionId
  ) || null
  const selectedImageModel = imageCatalogModels.find(
    model => model.id === imageComposerDraft.modelId
      && model.providerId === selectedImageConnection?.providerId
  ) || null
  const maxComposerImages = selectedImageModel?.capabilities?.maxReferenceImages ?? 10
  const imageModelUsable = Boolean(
    selectedImageConnection?.enabled
    && selectedImageConnection.credentialConfigured
    && selectedImageConnection.lastTest?.ok
    && selectedImageModel
    && imageRuntimeReady
  )
  const imageConversationViews = useMemo<ImageGenerationConversationView[]>(() => imageConversations.map(conversation => ({
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    turns: (imageConversationRuns[conversation.id] || []).map(run => projectRunToTurn(
      run,
      modelId => imageCatalogModels.find(model => model.id === modelId)?.displayName || modelId
    ))
  })), [imageCatalogModels, imageConversationRuns, imageConversations])
  const currentImageTurns = useMemo(() => {
    const stored = activeImageConversationId
      ? (imageConversationRuns[activeImageConversationId] || []).map(run => projectRunToTurn(
          run,
          modelId => imageCatalogModels.find(model => model.id === modelId)?.displayName || modelId
        ))
      : []
    return optimisticImageTurn ? [...stored.filter(turn => turn.id !== optimisticImageTurn.id), optimisticImageTurn] : stored
  }, [activeImageConversationId, imageCatalogModels, imageConversationRuns, optimisticImageTurn])

  const resetImageConversation = useCallback(() => {
    setActiveImageConversationId(null)
    setOptimisticImageTurn(null)
    setImageRegionEditorOpen(false)
    setImageAnnotationTarget(null)
    setImageAnnotationDocuments({})
    setImageComposerDraft(current => createEmptyConversationDraft({
      connectionId: imageAssignment?.connectionId || current.connectionId,
      modelId: imageAssignment?.modelId || current.modelId,
      resolution: current.resolution,
      aspectRatio: current.aspectRatio,
      width: current.width,
      height: current.height,
      promptOptimization: current.promptOptimization,
      outputFormat: current.outputFormat,
      watermark: current.watermark
    }))
  }, [imageAssignment?.connectionId, imageAssignment?.modelId])

  const openImageGeneration = useCallback(() => {
    resetImageConversation()
    setRightPanelMode('image-generation')
    setRightPanelCollapsed(false)
  }, [resetImageConversation])

  const continueImageConversation = useCallback((conversationId: string) => {
    setActiveImageConversationId(conversationId)
    setOptimisticImageTurn(null)
    setImageComposerDraft(current => createEmptyConversationDraft({
      connectionId: imageAssignment?.connectionId || current.connectionId,
      modelId: imageAssignment?.modelId || current.modelId,
      resolution: current.resolution,
      aspectRatio: current.aspectRatio,
      width: current.width,
      height: current.height,
      promptOptimization: current.promptOptimization,
      outputFormat: current.outputFormat,
      watermark: current.watermark
    }))
    if (!imageConversationRuns[conversationId]) {
      void loadImageConversationRuns(activeProject.id, conversationId).catch(() => undefined)
    }
  }, [activeProject.id, imageAssignment?.connectionId, imageAssignment?.modelId, imageConversationRuns, loadImageConversationRuns])

  const continueImageCreation = useCallback((nodeId: string, workflow: ProjectImageGenerationWorkflow) => {
    const node = freeCanvasRef.current.nodes.find(candidate => candidate.id === nodeId)
    if (!node || node.kind !== 'image' || !node.assetId) {
      setUploadError('该图片节点没有可用于二次创作的本地资产。')
      return
    }
    resetImageConversation()
    setImageComposerDraft(current => ({
      ...current,
      workflow,
      inputs: [{
        referenceId: `source-${node.id}`,
        assetId: node.assetId!,
        order: 0,
        role: workflow === 'reference-generate' ? 'reference-image' : 'source-image',
        label: node.title
      }]
    }))
    setRightPanelMode('image-generation')
    setRightPanelCollapsed(false)
  }, [resetImageConversation])

  const continueLegacyImageCreation = useCallback((nodeId: string) => {
    const current = freeCanvasRef.current
    const node = current.nodes.find((candidate): candidate is IFreeCanvasImageGeneratorNode => candidate.id === nodeId && candidate.kind === 'image-generator')
    if (!node) return
    const snapshot = compileImageGeneratorPrompt(current, node.id)
    resetImageConversation()
    setImageComposerDraft(draft => ({
      ...draft,
      promptDocument: {
        version: 1,
        segments: snapshot.promptDocument.segments.map(segment => segment.type === 'text'
          ? { type: 'text', text: segment.text }
          : { type: 'reference', referenceId: segment.referenceId, label: segment.label })
      },
      workflow: node.primaryAssetId ? 'smart-edit' : snapshot.inputAssets.length > 0 ? 'reference-generate' : 'text-to-image',
      inputs: node.primaryAssetId
        ? [{
            referenceId: `legacy-result-${node.id}`,
            assetId: node.primaryAssetId,
            order: 0,
            role: 'source-image',
            label: node.title
          }]
        : snapshot.inputAssets.map((input, index) => ({ ...input, order: index }))
    }))
    setRightPanelMode('image-generation')
    setRightPanelCollapsed(false)
  }, [resetImageConversation])

  const injectSelectedCanvasNodes = useCallback(() => {
    const ids = selectedNodeIds.length > 0
      ? selectedNodeIds
      : freeCanvasRef.current.selectedNodeId ? [freeCanvasRef.current.selectedNodeId] : []
    const nodesToInject = ids.flatMap(id => {
      const node = freeCanvasRef.current.nodes.find(candidate => candidate.id === id)
      return node ? [node] : []
    })
    const result = injectCanvasNodesIntoDraft(imageComposerDraft, nodesToInject)
    setImageComposerDraft(result.draft)
    setUploadError(result.rejected.length > 0 ? result.rejected.map(item => item.reason).join(' ') : null)
  }, [imageComposerDraft, selectedNodeIds])

  const uploadImageComposerReference = useCallback(async (file: File) => {
    if (imageComposerDraft.inputs.length >= maxComposerImages) {
      setUploadError(`已达到当前模型的 ${maxComposerImages} 张参考图上限。`)
      return
    }
    if (file.size > 30 * 1024 * 1024) {
      setUploadError('参考图不能超过 30 MB。')
      return
    }
    try {
      const imported = await storageServiceClient.imageAssets.import(file)
      setImageComposerDraft(current => {
        if (current.inputs.length >= maxComposerImages) return current
        const input: ProjectImageGenerationInput = {
          referenceId: `upload-${imported.originalAsset.id}`,
          assetId: imported.providerInputAsset.id,
          sourceAssetId: imported.originalAsset.id,
          order: current.inputs.length,
          role: 'reference-image',
          label: file.name
        }
        return {
          ...current,
          workflow: current.workflow === 'text-to-image' ? 'reference-generate' : current.workflow,
          inputs: [...current.inputs, input]
        }
      })
      setUploadError(null)
    } catch {
      setUploadError('参考图上传失败，请检查本地存储服务。')
    }
  }, [imageComposerDraft.inputs.length, maxComposerImages])

  const uploadImageComposerReferences = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(isComposerReferenceImage)
    if (imageFiles.length === 0) {
      setUploadError('仅支持拖入图片作为本轮参考图。')
      return
    }
    const available = Math.max(0, maxComposerImages - imageComposerDraft.inputs.length)
    if (available === 0) {
      setUploadError(`已达到当前模型的 ${maxComposerImages} 张参考图上限。`)
      return
    }
    for (const file of imageFiles.slice(0, available)) {
      await uploadImageComposerReference(file)
    }
    if (imageFiles.length > available) {
      setUploadError(`已加入 ${available} 张图片，其余图片超过当前模型的参考图上限。`)
    }
  }, [imageComposerDraft.inputs.length, maxComposerImages, uploadImageComposerReference])

  const clearComposerFileDragState = () => {
    composerFileDragDepthRef.current = 0
    setComposerFileDragActive(false)
  }

  const handleComposerDragEnter = (event: ReactDragEvent<Element>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    composerFileDragDepthRef.current += 1
    setComposerFileDragActive(true)
  }

  const handleComposerDragOver = (event: ReactDragEvent<Element>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleComposerDragLeave = (event: ReactDragEvent<Element>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.stopPropagation()
    composerFileDragDepthRef.current = Math.max(0, composerFileDragDepthRef.current - 1)
    if (composerFileDragDepthRef.current === 0) setComposerFileDragActive(false)
  }

  const handleComposerDrop = (event: ReactDragEvent<Element>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    clearComposerFileDragState()
    setRightPanelMode('image-generation')
    void uploadImageComposerReferences(Array.from(event.dataTransfer.files))
  }

  const processPendingImagePlacements = useCallback(async (projectId: string) => {
    if (placementProcessingRef.current) return
    placementProcessingRef.current = true
    try {
      const placements = await storageServiceClient.imageGenerationPlacements.getPending(projectId)
      if (activeProjectIdRef.current !== projectId || placements.length === 0) return
      let current = freeCanvasRef.current
      const persisted: Array<{ runId: string; nodeId: string }> = []
      const awaitingPersistence: Array<{ runId: string; nodeId: string }> = []
      const leftInset = resourceLibraryExpanded && window.innerWidth >= 1440 ? 292 : 0
      const rightInset = rightPanelCollapsed ? 56 : 456
      const base = reactFlow.screenToFlowPosition({
        x: Math.max(180, leftInset + (window.innerWidth - leftInset - rightInset) / 2),
        y: window.innerHeight / 2
      })
      const additions: IFreeCanvasImageNode[] = []
      placements.forEach((placement, index) => {
        const existing = current.nodes.find((node): node is IFreeCanvasImageNode => (
          node.kind === 'image' && node.meta?.generationRunId === placement.runId
        ))
        if (existing) {
          const target = { runId: placement.runId, nodeId: existing.id }
          const alreadyHydrated = existing.assetId === placement.assetId
            && existing.meta?.generationState === 'succeeded'
          if (!alreadyHydrated) {
            current = completeFreeCanvasImageGeneration(
              current,
              placement.runId,
              placement.assetId,
              canvasImageAssetUrl(placement.assetId)
            )
            unpersistedPlacementRunIdsRef.current.add(placement.runId)
          }
          if (unpersistedPlacementRunIdsRef.current.has(placement.runId)) awaitingPersistence.push(target)
          else persisted.push(target)
          return
        }
        const node = createFreeCanvasImageNodeFromMedia({
          id: `generation-${placement.runId}`,
          kind: 'imageAsset',
          title: '生成图片',
          position: { x: base.x + index * 28, y: base.y + index * 28 },
          width: 320,
          height: 320,
          assetId: placement.assetId,
          imageUrl: canvasImageAssetUrl(placement.assetId),
          imagePrompt: '',
          sourceNodeId: null,
          generatedFromAgent: false,
          crop: null,
          text: '',
          color: '#111827',
          meta: {
            generatedResult: true,
            generationRunId: placement.runId,
            conversationId: placement.conversationId,
            generationState: 'succeeded',
            source: 'image-generation-conversation'
          }
        })
        additions.push(node)
        awaitingPersistence.push({ runId: placement.runId, nodeId: node.id })
        unpersistedPlacementRunIdsRef.current.add(placement.runId)
      })
      if (additions.length > 0) current = { ...current, nodes: [...current.nodes, ...additions] }
      if (additions.length > 0 || awaitingPersistence.length > 0) {
        emitGenerationCanvas(current)
      }
      if (awaitingPersistence.length > 0) {
        const saved = await onPersistCanvas?.(current)
        if (saved && activeProjectIdRef.current === projectId) {
          awaitingPersistence.forEach(item => unpersistedPlacementRunIdsRef.current.delete(item.runId))
          persisted.push(...awaitingPersistence)
        }
      }
      for (const item of persisted) {
        await storageServiceClient.imageGenerationPlacements.markPlaced(item.runId, item.nodeId)
      }
    } finally {
      placementProcessingRef.current = false
    }
  }, [emitGenerationCanvas, onPersistCanvas, reactFlow, resourceLibraryExpanded, rightPanelCollapsed])

  useEffect(() => {
    void processPendingImagePlacements(activeProject.id).catch(() => undefined)
  }, [activeProject.id, processPendingImagePlacements])

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const reconcile = async () => {
      const projectId = activeProject.id
      const runningNodes = freeCanvasRef.current.nodes.filter(isRunningFreeCanvasImageGeneration)
      if (runningNodes.length === 0) return
      setImageGenerationBusy(true)
      const runs = await Promise.all(runningNodes.map(async node => {
        const runId = String(node.meta?.generationRunId || '')
        try {
          const run = runId ? await storageServiceClient.imageGenerationRuns.getById(runId, projectId) : null
          return { runId, run, lookupFailed: false }
        } catch {
          return { runId, run: null, lookupFailed: true }
        }
      }))
      if (cancelled || activeProjectIdRef.current !== projectId) return

      let current = freeCanvasRef.current
      let changed = false
      runs.forEach(({ runId, run, lookupFailed }) => {
        if (lookupFailed) return
        if (!run) {
          current = failFreeCanvasImageGeneration(current, runId, 'generation_run_missing')
          changed = true
          return
        }
        if (run.state === 'failed') {
          current = failFreeCanvasImageGeneration(current, runId, safeGenerationErrorCode(run.error?.code))
          changed = true
          return
        }
        if (run.state === 'succeeded') {
          const assetId = run.outputAssetIds[0]
          if (!assetId) {
            current = failFreeCanvasImageGeneration(current, runId, 'generation_output_missing')
          } else {
            current = completeFreeCanvasImageGeneration(current, runId, assetId, canvasImageAssetUrl(assetId))
            unpersistedPlacementRunIdsRef.current.add(runId)
          }
          changed = true
        }
      })
      if (changed) {
        emitGenerationCanvas(current)
        await onPersistCanvas?.(current)
      }
      await processPendingImagePlacements(projectId).catch(() => undefined)
      if (cancelled || activeProjectIdRef.current !== projectId) return
      const stillRunning = freeCanvasRef.current.nodes.some(isRunningFreeCanvasImageGeneration)
      setImageGenerationBusy(stillRunning)
      if (stillRunning) timeoutId = setTimeout(() => { void reconcile().catch(() => undefined) }, 1500)
    }
    void reconcile().catch(() => undefined)
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [activeProject.id, emitGenerationCanvas, onPersistCanvas, processPendingImagePlacements])

  const prepareAnnotatedComposerDraft = useCallback(async (
    draft: ImageGenerationComposerDraft
  ): Promise<ImageGenerationComposerDraft> => {
    const inputs: ProjectImageGenerationInput[] = []
    for (const input of draft.inputs) {
      const document = imageAnnotationDocuments[input.referenceId]
      if (!document || document.annotations.length === 0) {
        inputs.push({ ...input })
        continue
      }
      const image = await loadImageElement(canvasImageAssetUrl(input.assetId))
      const flattened = await rasterizeAnnotationDocument(image, document)
      const imported = await storageServiceClient.imageAssets.import(new File(
        [flattened],
        `annotation-${input.referenceId}.png`,
        { type: 'image/png' }
      ))
      const sourceAssetId = input.sourceAssetId || input.assetId
      await storageServiceClient.imageAssets.createDerivation({
        sourceAssetId,
        derivedAssetId: imported.providerInputAsset.id,
        kind: 'annotation-flattened',
        transform: { format: 'png', referenceId: input.referenceId },
        annotationDocument: document as unknown as Record<string, unknown>
      })
      inputs.push({
        ...input,
        sourceAssetId,
        assetId: imported.providerInputAsset.id
      })
    }
    return {
      ...draft,
      promptDocument: {
        version: 1,
        segments: draft.promptDocument.segments.map(segment => segment.type === 'text'
          ? { type: 'text', text: segment.text }
          : { type: 'reference', referenceId: segment.referenceId, label: segment.label })
      },
      inputs,
      regions: draft.regions.map(region => ({ ...region }))
    }
  }, [imageAnnotationDocuments])

  const submitImageConversationTurn = useCallback(async () => {
    if (imageGenerationBusy || !imageGenerationNodeV1 || !imageModelUsable) return
    const conversationId = activeImageConversationId || createLocalId('image-conversation')
    let snapshot: ImageGenerationComposerDraft
    try {
      snapshot = await prepareAnnotatedComposerDraft(imageComposerDraft)
    } catch {
      setUploadError('视觉标记栅格化或派生资产保存失败，请检查本地存储。')
      return
    }
    const runId = createImageGenerationRunId()
    const frame = imageGenerationPlaceholderFrame(snapshot)
    const current = freeCanvasRef.current
    const placeholder = createFreeCanvasImageGenerationPlaceholder({
      runId,
      conversationId,
      prompt: promptDocumentPlainText(snapshot.promptDocument),
      position: nextNodePosition(reactFlow, current.nodes.length),
      ...frame
    })
    const canvasWithPlaceholder = {
      ...current,
      nodes: [...current.nodes, placeholder],
      selectedNodeId: placeholder.id
    }
    emitGenerationCanvas(canvasWithPlaceholder)
    setActiveImageConversationId(conversationId)
    setImageGenerationBusy(true)
    setOptimisticImageTurn({
      id: runId,
      createdAt: Date.now(),
      prompt: promptDocumentPlainText(snapshot.promptDocument),
      state: 'running',
      settings: {
        workflow: snapshot.workflow,
        modelLabel: selectedImageModel?.displayName || snapshot.modelId,
        resolution: snapshot.resolution,
        aspectRatio: snapshot.aspectRatio,
        outputFormat: snapshot.outputFormat,
        watermark: snapshot.watermark
      }
    })
    let placeholderSaved = false
    try {
      placeholderSaved = Boolean(await onPersistCanvas?.(canvasWithPlaceholder))
    } catch {
      placeholderSaved = false
    }
    if (!placeholderSaved) {
      const failedCanvas = failFreeCanvasImageGeneration(freeCanvasRef.current, runId, 'storage_write_failed')
      emitGenerationCanvas(failedCanvas)
      const presentation = getRuntimeErrorPresentation('storage_write_failed')
      setOptimisticImageTurn(currentTurn => currentTurn?.id === runId ? {
        ...currentTurn,
        state: 'failed',
        error: { message: presentation.message, action: presentation.action }
      } : currentTurn)
      setImageGenerationBusy(false)
      return
    }
    setImageComposerDraft(createEmptyConversationDraft({
      connectionId: snapshot.connectionId,
      modelId: snapshot.modelId,
      resolution: snapshot.resolution,
      aspectRatio: snapshot.aspectRatio,
      width: snapshot.width,
      height: snapshot.height,
      promptOptimization: snapshot.promptOptimization,
      outputFormat: snapshot.outputFormat,
      watermark: snapshot.watermark
    }))
    setImageAnnotationDocuments({})
    try {
      const result = await requestImageGeneration({
        ...buildConversationGenerationRequest(activeProject.id, conversationId, snapshot),
        runId
      })
      if (activeProjectIdRef.current === activeProject.id) {
        const completedCanvas = completeFreeCanvasImageGeneration(
          freeCanvasRef.current,
          runId,
          result.assetId,
          canvasImageAssetUrl(result.assetId)
        )
        unpersistedPlacementRunIdsRef.current.add(runId)
        emitGenerationCanvas(completedCanvas)
        const completedSaved = await onPersistCanvas?.(completedCanvas)
        if (completedSaved) unpersistedPlacementRunIdsRef.current.delete(runId)
        await loadImageConversations(activeProject.id)
        await loadImageConversationRuns(activeProject.id, conversationId)
        setOptimisticImageTurn(null)
        await processPendingImagePlacements(activeProject.id)
      }
    } catch (error) {
      if (activeProjectIdRef.current === activeProject.id) {
        const clientError = error instanceof ImageGenerationClientError ? error : null
        const errorCode = safeGenerationErrorCode(clientError?.code)
        const failedCanvas = failFreeCanvasImageGeneration(freeCanvasRef.current, runId, errorCode)
        emitGenerationCanvas(failedCanvas)
        await onPersistCanvas?.(failedCanvas).catch(() => false)
        setOptimisticImageTurn(currentTurn => currentTurn?.id === runId ? {
          ...currentTurn,
          state: 'failed',
          error: { message: clientError?.message || '图片生成失败，请稍后重试。', action: clientError?.action }
        } : currentTurn)
        await Promise.all([
          loadImageConversations(activeProject.id),
          loadImageConversationRuns(activeProject.id, conversationId)
        ]).catch(() => undefined)
      }
    } finally {
      if (activeProjectIdRef.current === activeProject.id) setImageGenerationBusy(false)
    }
  }, [activeImageConversationId, activeProject.id, emitGenerationCanvas, imageComposerDraft, imageGenerationBusy, imageGenerationNodeV1, imageModelUsable, loadImageConversationRuns, loadImageConversations, onPersistCanvas, prepareAnnotatedComposerDraft, processPendingImagePlacements, reactFlow, selectedImageModel?.displayName])

  const imageComposerMissingRequirements = useMemo(() => {
    const missing: string[] = []
    if (!imageGenerationNodeV1) missing.push('图片生成功能当前未开启。')
    if (previewMode) missing.push('预览模式不能发起图片生成。')
    if (!imageRuntimeReady) missing.push('图片生成 Runtime 或 Ark SDK 尚未就绪。')
    if (!imageAssignment) missing.push('尚未配置默认图片模型。')
    if (imageComposerDraft.connectionId && !selectedImageConnection?.enabled) missing.push('所选图片连接已停用。')
    if (selectedImageConnection && !selectedImageConnection.credentialConfigured) missing.push('所选图片连接尚未配置凭据。')
    if (selectedImageConnection && !selectedImageConnection.lastTest?.ok) missing.push('所选图片连接尚未测试成功。')
    if (!promptDocumentPlainText(imageComposerDraft.promptDocument).trim()) missing.push('请输入本轮图片描述。')
    if (unresolvedPromptReferenceIds(imageComposerDraft.promptDocument, imageComposerDraft.inputs).length > 0) {
      missing.push('提示词包含已经失效的参考图引用。')
    }
    if (imageComposerDraft.inputs.length > 10) missing.push('图片输入不能超过 10 张。')
    if (imageComposerDraft.aspectRatio === 'custom') {
      validateComposerCustomSize(imageComposerDraft.width, imageComposerDraft.height).forEach(error => {
        if (error === 'custom_size_required') missing.push('自定义尺寸需要填写有效的宽度和高度。')
        if (error === 'custom_size_pixel_budget') missing.push('自定义尺寸总像素必须在 921600–4624220 之间。')
        if (error === 'custom_size_aspect_ratio') missing.push('自定义尺寸比例必须在 1:16–16:1 之间。')
      })
    }
    if (imageComposerDraft.workflow === 'reference-generate' && imageComposerDraft.inputs.length === 0) {
      missing.push('参考图生成至少需要一张参考图。')
    }
    if ((imageComposerDraft.workflow === 'smart-edit' || imageComposerDraft.workflow === 'region-edit')
      && !imageComposerDraft.inputs.some(input => input.role === 'source-image')) {
      missing.push('该工作流需要一张主图。')
    }
    if (imageComposerDraft.workflow === 'region-edit' && imageComposerDraft.regions.length === 0) {
      missing.push('局部修改需要先添加点选或框选区域。')
    }
    return missing
  }, [imageAssignment, imageComposerDraft, imageGenerationNodeV1, imageRuntimeReady, previewMode, selectedImageConnection])
  const imageComposerVisibleRequirements = useMemo(() => imageComposerMissingRequirements.filter(requirement => ![
    '图片生成 Runtime 或 Ark SDK 尚未就绪。',
    '尚未配置默认图片模型。',
    '所选图片连接已停用。',
    '所选图片连接尚未配置凭据。',
    '所选图片连接尚未测试成功。',
    '请输入本轮图片描述。'
  ].includes(requirement)), [imageComposerMissingRequirements])

  const selectedComposerNodes = selectedNodeIds.length > 0
    ? selectedNodeIds
    : freeCanvas.selectedNodeId ? [freeCanvas.selectedNodeId] : []
  const selectedComposerDescriptor = selectedComposerNodes.length > 0
    ? { id: '__current-selection__', label: `加入所选节点（${selectedComposerNodes.length}）` }
    : undefined
  const openImageAnnotationEditor = useCallback(async (referenceId?: string) => {
    const input = (referenceId
      ? imageComposerDraft.inputs.find(candidate => candidate.referenceId === referenceId)
      : undefined)
      || imageComposerDraft.inputs.find(candidate => candidate.role === 'source-image')
      || imageComposerDraft.inputs[0]
    if (!input) {
      setUploadError('请先添加一张需要视觉标记的图片。')
      return
    }
    try {
      const image = await loadImageElement(canvasImageAssetUrl(input.assetId))
      setImageAnnotationTarget({
        referenceId: input.referenceId,
        width: image.naturalWidth,
        height: image.naturalHeight
      })
    } catch {
      setUploadError('无法读取标记图片，请检查本地资产。')
    }
  }, [imageComposerDraft.inputs])
  const imageAnnotationInput = imageAnnotationTarget
    ? imageComposerDraft.inputs.find(input => input.referenceId === imageAnnotationTarget.referenceId) || null
    : null
  const activeConversationLabel = activeImageConversationId
    ? imageConversations.find(item => item.id === activeImageConversationId)?.title || '当前会话'
    : '新对话'
  const restoreImageTurnToComposer = useCallback((turn: ImageGenerationTurn) => {
    const run = Object.values(imageConversationRuns).flat().find(candidate => candidate.id === turn.id)
    if (!run) return
    const snapshot = run.requestSnapshot
    const restoredRegions: ImageGenerationComposerDraft['regions'] = []
    snapshot.regions.forEach(region => {
      if (region.type === 'point' && typeof region.referenceId === 'string' && typeof region.x === 'number' && typeof region.y === 'number') {
        restoredRegions.push({ type: 'point', referenceId: region.referenceId, x: region.x, y: region.y })
      } else if (region.type === 'bbox'
        && typeof region.referenceId === 'string'
        && typeof region.x1 === 'number' && typeof region.y1 === 'number'
        && typeof region.x2 === 'number' && typeof region.y2 === 'number') {
        restoredRegions.push({ type: 'bbox', referenceId: region.referenceId, x1: region.x1, y1: region.y1, x2: region.x2, y2: region.y2 })
      }
    })
    const workflow: ProjectImageGenerationWorkflow = snapshot.mode === 'edit'
      ? 'smart-edit'
      : snapshot.mode === 'region-edit'
        ? 'region-edit'
        : snapshot.inputAssets.length > 0 ? 'reference-generate' : 'text-to-image'
    setImageComposerDraft(current => ({
      ...current,
      promptDocument: {
        version: 1 as const,
        segments: snapshot.promptDocument.segments.map(segment => segment.type === 'text'
          ? { type: 'text' as const, text: segment.text }
          : {
              type: 'reference' as const,
              referenceId: segment.referenceId,
              label: segment.label
            })
      },
      workflow,
      connectionId: run.connectionId,
      modelId: run.modelId,
      resolution: snapshot.resolution,
      aspectRatio: snapshot.aspectRatio || current.aspectRatio,
      width: snapshot.width,
      height: snapshot.height,
      promptOptimization: snapshot.promptOptimization,
      outputFormat: snapshot.outputFormat === 'jpeg' ? 'jpeg' : 'png',
      watermark: snapshot.watermark,
      inputs: snapshot.inputAssets.map((input, index) => ({
        ...input,
        order: index,
        role: (workflow === 'smart-edit' || workflow === 'region-edit') && index === 0
          ? 'source-image'
          : input.role
      })),
      regions: restoredRegions
    }))
    setRightPanelMode('image-generation')
    setRightPanelCollapsed(false)
  }, [imageConversationRuns])

  const handleImageTurnAction = useCallback((turn: ImageGenerationTurn, action: ImageGenerationTurnAction) => {
    if (action === 'view' && turn.result) {
      window.open(turn.result.imageUrl, '_blank', 'noopener,noreferrer')
      return
    }
    if (action === 'media') {
      onOpenMedia?.()
      return
    }
    if (action === 'place' && turn.result) {
      const current = freeCanvasRef.current
      const existing = current.nodes.find(node => node.meta?.generationRunId === turn.id)
      if (existing) {
        emitGenerationCanvas({ ...current, selectedNodeId: existing.id })
        return
      }
      const sourceRun = Object.values(imageConversationRuns).flat().find(run => run.id === turn.id)
      const image = createFreeCanvasImageNodeFromMedia({
        id: `generation-${turn.id}`,
        kind: 'imageAsset',
        title: '生成图片',
        position: nextNodePosition(reactFlow, current.nodes.length),
        width: 320,
        height: 320,
        assetId: turn.result.assetId,
        imageUrl: turn.result.imageUrl,
        imagePrompt: turn.prompt,
        sourceNodeId: null,
        generatedFromAgent: false,
        crop: null,
        text: '',
        color: '#111827',
        meta: {
          generatedResult: true,
          generationRunId: turn.id,
          ...(sourceRun?.conversationId ? { conversationId: sourceRun.conversationId } : {}),
          source: 'image-generation-conversation'
        }
      })
      emitGenerationCanvas({ ...current, nodes: [...current.nodes, image], selectedNodeId: image.id })
      return
    }
    restoreImageTurnToComposer(turn)
    if ((action === 'edit' || action === 'region-edit' || action === 'reference') && turn.result) {
      setImageComposerDraft(current => ({
        ...current,
        workflow: action === 'edit'
          ? 'smart-edit'
          : action === 'region-edit' ? 'region-edit' : 'reference-generate',
        inputs: [{
          referenceId: `result-${turn.id}`,
          assetId: turn.result!.assetId,
          order: 0,
          role: action === 'reference' ? 'reference-image' : 'source-image',
          label: '上次生成结果'
        }]
      }))
    }
  }, [emitGenerationCanvas, imageConversationRuns, onOpenMedia, reactFlow, restoreImageTurnToComposer])

  const nodes = useMemo<FreeCanvasFlowNode[]>(() => freeCanvas.nodes.map(node => ({
    id: node.id,
    type: node.kind === 'image-generator' ? 'imageGeneratorNode' : 'freeCanvasNode',
    position: node.position,
    selected: node.id === freeCanvas.selectedNodeId,
    deletable: !isRunningFreeCanvasImageGeneration(node),
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
      onOpenImageHistory: () => undefined,
      onConfigureImageModel: onConfigureImageModel
        ? (nodeId: string) => onConfigureImageModel({ projectId: activeProject.id, nodeId, returnTarget: 'free-canvas' })
        : undefined,
      onContinueLegacyImageCreation: continueLegacyImageCreation,
      onContinueImageCreation: continueImageCreation,
      imageGeneratorInputSummary: node.kind === 'image-generator' ? {
        promptConnected: freeCanvas.edges.some(edge => edge.target === node.id && edge.targetHandle === 'prompt'),
        sourceConnected: freeCanvas.edges.some(edge => edge.target === node.id && edge.targetHandle === 'source-image'),
        referenceCount: freeCanvas.edges.filter(edge => edge.target === node.id && edge.targetHandle === 'reference-image').length
      } : undefined
    }
  })), [activeProject.id, continueImageCreation, continueLegacyImageCreation, copyTextNode, editingNodeId, freeCanvas.edges, freeCanvas.nodes, freeCanvas.selectedNodeId, onConfigureImageModel, replaceTextRange, resizeImageNode, updateTextStyle])

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
      emitGenerationCanvas(removeFreeCanvasProjectNodes(freeCanvasRef.current, removedNodeIds))
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
    setSelectedNodeIds([node.id])
    setSelectedNodeId(node.id)
  }

  const handleNodeDoubleClick: NodeMouseHandler<FreeCanvasFlowNode> = (_event, node) => {
    if (node.data.canvasNode.kind === 'text') setEditingNodeId(node.id)
    if (node.data.canvasNode.kind === 'image' && node.data.canvasNode.assetId && !node.data.canvasNode.crop) {
      setCropNodeId(node.data.canvasNode.id)
    }
  }

  const handleNodeDragStop: OnNodeDrag<FreeCanvasFlowNode> = (_event, node) => {
    emitGenerationCanvas(updateFreeCanvasNodePosition(freeCanvasRef.current, node.id, node.position))
  }

  const handleConnect: OnConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const targetNode = freeCanvas.nodes.find(node => node.id === connection.target)
    if (targetNode?.kind === 'image-generator') {
      setUploadError('旧图片生成节点为只读预览，不能新增连线。请打开“图片生成”页签继续创作。')
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

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return false
    const targetNode = freeCanvas.nodes.find(node => node.id === connection.target)
    return targetNode?.kind !== 'image-generator'
  }, [freeCanvas])

  const handleEdgeClick: EdgeMouseHandler<Edge> = (_event, edge) => {
    setSelectedEdgeId(edge.id)
    setSelectedNodeId(null)
  }

  const clearFileDragState = () => {
    fileDragDepthRef.current = 0
    setFileDragActive(false)
  }

  const handleRootDropCapture = (event: ReactDragEvent<Element>) => {
    if (!isCanvasImageDrag(event.dataTransfer)) return
    clearFileDragState()
    clearComposerFileDragState()
  }

  const handleDrop = async (event: ReactDragEvent<Element>) => {
    if (!isCanvasImageDrag(event.dataTransfer)) return
    clearFileDragState()
    event.preventDefault()
    const material = readProjectMaterialDrag(event.dataTransfer)
    if (material) {
      if (material.projectId !== activeProject.id) {
        setUploadError('不能把其他项目的素材拖入当前画布。')
        return
      }
      placeProjectMaterialAt(
        material,
        reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      )
      setUploadError(null)
      return
    }
    await addImageFiles(
      Array.from(event.dataTransfer.files),
      reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    )
  }

  const handleDragEnter = (event: ReactDragEvent<Element>) => {
    if (!isCanvasImageDrag(event.dataTransfer)) return
    event.preventDefault()
    fileDragDepthRef.current += 1
    setFileDragActive(true)
  }

  const handleDragLeave = (event: ReactDragEvent<Element>) => {
    if (!isCanvasImageDrag(event.dataTransfer)) return
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
    if (fileDragDepthRef.current === 0) setFileDragActive(false)
  }

  const handleImageInputChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    void addImageFiles(files, nextNodePosition(reactFlow, freeCanvas.nodes.length))
  }

  const handleApplyAgentProposal = (proposal: AgentWorkspaceProposal) => {
    if (proposal.kind === 'free_canvas_text_update') {
      onChange(updateFreeCanvasTextNodeUserText(freeCanvas, proposal.nodeId, proposal.userText, proposal.mode))
      return
    }
    if (proposal.kind === 'free_canvas_text_create') {
      const node = createFreeCanvasTextNode(
        proposal.userText,
        nextNodePosition(reactFlow, freeCanvas.nodes.length)
      )
      onChange({
        ...freeCanvas,
        nodes: [
          ...freeCanvas.nodes,
          {
            ...node,
            title: proposal.title?.trim() || node.title
          }
        ],
        selectedNodeId: node.id
      })
    }
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
      onDropCapture={handleRootDropCapture}
    >
      <header className="absolute left-4 top-4 z-40 flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-2 py-2 shadow-sm">
        <ToolbarButton title="Back" onClick={onBack}><ArrowLeft className="h-4 w-4" /></ToolbarButton>
        <button type="button" className="px-3 text-left" onClick={onRenameProject}>
          <div className="text-sm font-black text-gray-950">{activeProject.title}</div>
          <div className="text-[11px] font-semibold text-gray-400">Free Canvas</div>
        </button>
        <ToolbarButton title="Save" onClick={onSave}><Save className="h-4 w-4" /></ToolbarButton>
      </header>

      <ProjectResourceLibrary
        projectId={activeProject.id}
        expanded={resourceLibraryExpanded}
        onExpandedChange={setResourceLibraryExpanded}
        onPlaceMaterial={placeProjectMaterial}
        onAddSubject={addProjectSubjectToComposer}
      />

      <div
        className={`relative h-full transition-[padding] ${
          rightPanelCollapsed ? 'pr-14' : 'pr-[456px]'
        } ${resourceLibraryExpanded ? 'xl:pl-[292px]' : ''}`}
      >
        <div
          data-free-canvas-dropzone
          className={`relative h-full ${resourceLibraryExpanded ? 'ml-[292px] xl:ml-0' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={event => {
            if (!isCanvasImageDrag(event.dataTransfer)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDragLeave={handleDragLeave}
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
            onSelectionChange={({ nodes: selection }) => setSelectedNodeIds(selection.map(node => node.id))}
            onConnect={handleConnect}
            isValidConnection={isValidConnection}
            onEdgeClick={handleEdgeClick}
            onPaneClick={() => {
              setSelectedNodeIds([])
              setSelectedNodeId(null)
              setSelectedEdgeId(null)
              setEditingNodeId(null)
              if (window.innerWidth < 1440) setResourceLibraryExpanded(false)
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
            <MiniMap pannable zoomable className="!bottom-6 !left-auto !right-16" />
            <Controls className="!bottom-6 !left-auto !right-4" />
          </ReactFlow>
          {fileDragActive && (
            <div className="pointer-events-none absolute inset-4 z-40 flex items-center justify-center rounded-[18px] border-2 border-dashed border-sky-300 bg-sky-50/75 text-sm font-black text-sky-700">
              松开以添加图片
            </div>
          )}
        </div>

        <CanvasBottomToolbar
          positionClassName={
            resourceLibraryExpanded
              ? rightPanelCollapsed
                ? 'left-[calc(50%_-_28px)] xl:left-[calc(50%_+_118px)]'
                : 'left-[calc(50%_-_228px)] xl:left-[calc(50%_-_82px)]'
              : rightPanelCollapsed
                ? 'left-[calc(50%_-_28px)]'
                : 'left-[calc(50%_-_228px)]'
          }
          quickDrawerOpen={quickDrawerOpen}
          quickPresets={quickPresets}
          onCreateText={createText}
          onCreateImage={createImage}
          onCreateImageGenerator={openImageGeneration}
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
            rightOffset={rightPanelCollapsed ? 56 : 456}
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
          className="absolute right-2 top-2 z-40 flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white/95 text-[#5e5d59] shadow-[0_4px_18px_rgba(20,20,19,0.08)] transition hover:bg-[#f9fafb] hover:text-[#141413]"
          onClick={() => setRightPanelCollapsed(false)}
          title="Open Agent panel"
        >
          <Bot className="h-4 w-4" />
        </button>
      ) : (
        <aside
          data-free-canvas-composer-dropzone
          className="absolute bottom-0 right-0 top-0 z-30 flex w-[456px] max-w-[calc(100%_-_56px)] flex-col overflow-hidden border-l border-[#e5e7eb] bg-white"
          onDragEnter={handleComposerDragEnter}
          onDragOver={handleComposerDragOver}
          onDragLeave={handleComposerDragLeave}
          onDrop={handleComposerDrop}
        >
          {composerFileDragActive && (
            <div className="pointer-events-none absolute inset-2 z-[70] grid place-items-center rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/90 px-5 text-center backdrop-blur-sm">
              <div>
                <ImageIcon className="mx-auto h-6 w-6 text-violet-600" />
                <div className="mt-2 text-xs font-black text-gray-950">松开以加入本轮参考图</div>
                <div className="mt-1 text-[10px] text-gray-500">仅加入草稿，不会自动发送</div>
              </div>
            </div>
          )}
          <div className="shrink-0 border-b border-[#e5e7eb] bg-white">
            <div className="flex h-11 items-center justify-between gap-2 px-3">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-[13px] font-bold text-[#141413]">
                  {rightPanelMode === 'image-generation'
                    ? '图片生成'
                    : rightPanelMode === 'prompt-library'
                      ? 'Prompt 库'
                      : selectedNode?.title || 'Free Canvas'}
                </h2>
                {rightPanelMode === 'image-generation' && (
                  <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold ${
                    imageModelUsable ? 'text-emerald-700' : 'text-amber-700'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${imageModelUsable ? 'bg-emerald-600' : 'bg-amber-500'}`} />
                    {imageModelUsable ? '模型已就绪' : '待配置'}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#87867f] transition hover:bg-[#f3f4f6] hover:text-[#141413]"
                onClick={() => setRightPanelCollapsed(true)}
                title="Collapse Agent panel"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mx-2 mb-2 grid h-8 grid-cols-3 gap-0.5 rounded-[9px] bg-[#f3f4f6] p-0.5" data-free-canvas-panel-switcher>
              <PanelModeButton
                active={rightPanelMode === 'agent'}
                label="Agent"
                icon={<Bot className="h-3.5 w-3.5" />}
                onClick={() => setRightPanelMode('agent')}
              />
              <PanelModeButton
                active={rightPanelMode === 'image-generation'}
                label="图片生成"
                icon={<ImageIcon className="h-3.5 w-3.5" />}
                onClick={() => setRightPanelMode('image-generation')}
              />
              <PanelModeButton
                active={rightPanelMode === 'prompt-library'}
                label="Prompt库"
                icon={<BookOpen className="h-3.5 w-3.5" />}
                onClick={() => setRightPanelMode('prompt-library')}
              />
            </div>
          </div>
          {rightPanelMode === 'image-generation' ? (
            <div className="min-h-0 flex-1" data-free-canvas-image-generation-panel>
              <ImageGenerationConversationPanel
                projectLabel={activeProject.title}
                conversationLabel={activeConversationLabel}
                statusLabel={imageModelUsable ? '默认图片模型已就绪' : '图片模型待配置'}
                statusReady={imageModelUsable}
                onConfigureModel={onConfigureImageModel ? () => onConfigureImageModel({ projectId: activeProject.id, returnTarget: 'free-canvas' }) : undefined}
                onOpenSubjectLibrary={() => setResourceLibraryExpanded(true)}
                turns={currentImageTurns}
                conversations={imageConversationViews}
                onNewConversation={resetImageConversation}
                onContinueConversation={continueImageConversation}
                onOpenHistoryConversation={conversationId => {
                  if (!imageConversationRuns[conversationId]) {
                    void loadImageConversationRuns(activeProject.id, conversationId).catch(() => undefined)
                  }
                }}
                onLoadMoreConversations={imageConversationNextCursor
                  ? () => { void loadImageConversations(activeProject.id, undefined, imageConversationNextCursor) }
                  : undefined}
                onLoadMoreConversationRuns={conversationId => {
                  const cursor = imageRunNextCursors[conversationId]
                  if (cursor) {
                    void loadImageConversationRuns(activeProject.id, conversationId, undefined, cursor)
                  }
                }}
                hasMoreConversations={Boolean(imageConversationNextCursor)}
                hasMoreConversationRuns={conversationId => Boolean(imageRunNextCursors[conversationId])}
                onTurnAction={handleImageTurnAction}
                composer={{
                  prompt: promptDocumentPlainText(imageComposerDraft.promptDocument),
                  onPromptChange: prompt => setImageComposerDraft(current => ({
                    ...current,
                    promptDocument: { version: 1, segments: [{ type: 'text', text: prompt }] }
                  })),
                  promptDocument: imageComposerDraft.promptDocument,
                  onPromptDocumentChange: promptDocument => setImageComposerDraft(current => ({
                    ...current,
                    promptDocument
                  })),
                  unresolvedReferenceIds: unresolvedPromptReferenceIds(
                    imageComposerDraft.promptDocument,
                    imageComposerDraft.inputs
                  ),
                  references: imageComposerDraft.inputs.map(input => ({
                    referenceId: input.referenceId,
                    assetId: input.assetId,
                    sourceAssetId: input.sourceAssetId,
                    label: input.label || input.referenceId,
                    imageUrl: canvasImageAssetUrl(input.assetId),
                    mentioned: imageComposerDraft.promptDocument.segments.some(segment => (
                      segment.type === 'reference' && segment.referenceId === input.referenceId
                    )),
                    role: input.role,
                    order: input.order
                  })),
                  maxImages: maxComposerImages,
                  onMentionReference: referenceId => setImageComposerDraft(current => {
                    const input = current.inputs.find(candidate => candidate.referenceId === referenceId)
                    if (!input) return current
                    const mentioned = current.promptDocument.segments.some(segment => (
                      segment.type === 'reference' && segment.referenceId === referenceId
                    ))
                    return {
                      ...current,
                      promptDocument: {
                        version: 1,
                        segments: mentioned
                          ? current.promptDocument.segments.filter(segment => (
                              segment.type !== 'reference' || segment.referenceId !== referenceId
                            ))
                          : [
                              ...current.promptDocument.segments,
                              { type: 'reference', referenceId, label: input.label || referenceId }
                            ]
                      }
                    }
                  }),
                  onRemoveReference: referenceId => setImageComposerDraft(current => ({
                    ...current,
                    inputs: current.inputs.filter(input => input.referenceId !== referenceId).map((input, order) => ({ ...input, order })),
                    regions: current.regions.filter(region => region.referenceId !== referenceId)
                  })),
                  onMoveReference: (referenceId, direction) => setImageComposerDraft(current => ({
                    ...current,
                    inputs: moveComposerImageInput(current.inputs.map(input => ({
                      ...input,
                      label: input.label || input.referenceId,
                      imageUrl: canvasImageAssetUrl(input.assetId)
                    })), referenceId, direction).map(({ imageUrl: _imageUrl, ...input }) => input)
                  })),
                  onReferenceRoleChange: (referenceId, role) => setImageComposerDraft(current => ({
                    ...current,
                    inputs: switchComposerImageInputRole(current.inputs.map(input => ({
                      ...input,
                      label: input.label || input.referenceId,
                      imageUrl: canvasImageAssetUrl(input.assetId)
                    })), referenceId, role).map(({ imageUrl: _imageUrl, ...input }) => input)
                  })),
                  workflows: [
                    { value: 'text-to-image', label: '文生图' },
                    { value: 'reference-generate', label: '参考图生成' },
                    { value: 'smart-edit', label: '智能改图' },
                    { value: 'region-edit', label: '局部修改' }
                  ],
                  workflow: imageComposerDraft.workflow,
                  onWorkflowChange: workflow => setImageComposerDraft(current => ({ ...current, workflow })),
                  models: readyImageBindings.map(({ connection, model }) => ({
                    value: `${connection.id}::${model.id}`,
                    label: `${model.displayName} · ${connection.displayName}`
                  })),
                  modelId: imageComposerDraft.connectionId && imageComposerDraft.modelId
                    ? `${imageComposerDraft.connectionId}::${imageComposerDraft.modelId}`
                    : '',
                  onModelChange: value => {
                    const separator = value.indexOf('::')
                    if (separator < 1) return
                    setImageComposerDraft(current => ({
                      ...current,
                      connectionId: value.slice(0, separator),
                      modelId: value.slice(separator + 2)
                    }))
                  },
                  resolutions: selectedImageModel?.capabilities?.resolutions || ['1K', '2K'],
                  resolution: imageComposerDraft.resolution,
                  onResolutionChange: resolution => setImageComposerDraft(current => ({ ...current, resolution })),
                  aspectRatios: selectedImageModel?.capabilities?.aspectRatios || ['1:1', '16:9', '9:16'],
                  aspectRatio: imageComposerDraft.aspectRatio,
                  onAspectRatioChange: aspectRatio => setImageComposerDraft(current => ({ ...current, aspectRatio })),
                  customWidth: imageComposerDraft.width,
                  customHeight: imageComposerDraft.height,
                  onCustomSizeChange: (width, height) => setImageComposerDraft(current => ({
                    ...current,
                    width,
                    height
                  })),
                  promptOptimizationModes: selectedImageModel?.capabilities?.promptOptimization?.modes || ['standard', 'fast'],
                  promptOptimization: imageComposerDraft.promptOptimization,
                  onPromptOptimizationChange: promptOptimization => setImageComposerDraft(current => ({
                    ...current,
                    promptOptimization
                  })),
                  outputFormats: (selectedImageModel?.capabilities?.outputFormats || ['png', 'jpeg']).filter(format => format === 'png' || format === 'jpeg'),
                  outputFormat: imageComposerDraft.outputFormat,
                  onOutputFormatChange: outputFormat => setImageComposerDraft(current => ({ ...current, outputFormat: outputFormat === 'jpeg' ? 'jpeg' : 'png' })),
                  supportsWatermark: selectedImageModel?.capabilities?.watermark !== false,
                  watermark: imageComposerDraft.watermark,
                  onWatermarkChange: watermark => setImageComposerDraft(current => ({ ...current, watermark })),
                  selectedNode: selectedComposerDescriptor,
                  selectedNodeCount: selectedComposerNodes.length,
                  onInjectSelectedNode: injectSelectedCanvasNodes,
                  onUpload: file => { void uploadImageComposerReference(file) },
                  regionCount: imageComposerDraft.regions.length,
                  onEditRegions: () => setImageRegionEditorOpen(true),
                  onEditAnnotations: referenceId => { void openImageAnnotationEditor(referenceId) },
                  onSubmit: () => { void submitImageConversationTurn() },
                  disabled: imageGenerationBusy,
                  missingRequirements: imageComposerVisibleRequirements,
                  blockingRequirements: imageComposerMissingRequirements
                }}
              />
              {imageRegionEditorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onMouseDown={event => event.target === event.currentTarget && setImageRegionEditorOpen(false)}>
                  <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
                    <RegionEditorDialog
                      scopeKey={`${activeProject.id}:${activeImageConversationId || 'draft'}`}
                      mode="region-edit"
                      capabilities={{
                        modelId: imageComposerDraft.modelId,
                        regionInputs: (selectedImageModel?.capabilities?.regionInputs || ['point', 'bbox']).filter((input): input is 'point' | 'bbox' => input === 'point' || input === 'bbox')
                      }}
                      sources={imageComposerDraft.inputs.map(input => ({
                        referenceId: input.referenceId,
                        label: input.label || input.referenceId,
                        role: input.role,
                        assetId: input.assetId,
                        imageUrl: canvasImageAssetUrl(input.assetId)
                      }))}
                      initialRegions={imageComposerDraft.regions.map((region, index) => region.type === 'point'
                        ? { id: `draft-point-${index}`, referenceId: region.referenceId, type: 'point' as const, x: region.x, y: region.y }
                        : { id: `draft-bbox-${index}`, referenceId: region.referenceId, type: 'bbox' as const, x: region.x1, y: region.y1, width: region.x2 - region.x1, height: region.y2 - region.y1 })}
                      onSave={regions => {
                        setImageComposerDraft(current => ({
                          ...current,
                          regions: regions.map(region => region.type === 'point'
                            ? { type: 'point', referenceId: region.referenceId, x: region.x, y: region.y }
                            : { type: 'bbox', referenceId: region.referenceId, x1: region.x, y1: region.y, x2: region.x + region.width, y2: region.y + region.height })
                        }))
                        setImageRegionEditorOpen(false)
                      }}
                      onClose={() => setImageRegionEditorOpen(false)}
                    />
                  </div>
                </div>
              )}
              {imageAnnotationTarget && imageAnnotationInput && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
                  onMouseDown={event => event.target === event.currentTarget && setImageAnnotationTarget(null)}
                >
                  <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl">
                    <AnnotationEditorDialog
                      source={{
                        assetId: imageAnnotationInput.sourceAssetId || imageAnnotationInput.assetId,
                        imageUrl: canvasImageAssetUrl(imageAnnotationInput.assetId),
                        label: imageAnnotationInput.label || imageAnnotationInput.referenceId,
                        width: imageAnnotationTarget.width,
                        height: imageAnnotationTarget.height
                      }}
                      initialDocument={imageAnnotationDocuments[imageAnnotationInput.referenceId] || {
                        version: 1,
                        sourceAssetId: imageAnnotationInput.sourceAssetId || imageAnnotationInput.assetId,
                        width: imageAnnotationTarget.width,
                        height: imageAnnotationTarget.height,
                        annotations: []
                      }}
                      onSave={document => {
                        setImageAnnotationDocuments(current => ({
                          ...current,
                          [imageAnnotationInput.referenceId]: document
                        }))
                        setImageAnnotationTarget(null)
                      }}
                      onClose={() => setImageAnnotationTarget(null)}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : rightPanelMode === 'prompt-library' ? (
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
              embedded
              contextLabel={`已读取画布 · ${freeCanvas.nodes.length} 个节点`}
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
        onContinueCreation={data.onContinueImageCreation}
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
        onOpenHistory: data.onOpenImageHistory,
        onConfigure: data.onConfigureImageModel,
        onContinueCreation: data.onContinueLegacyImageCreation,
        inputSummary: data.imageGeneratorInputSummary
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
  onStartImageCrop,
  onContinueCreation
}: {
  node: IFreeCanvasImageNode
  selected: boolean
  onResize: (nodeId: string, frame: { position?: { x: number; y: number }; width: number; height: number }) => void
  onStartAnnotationEdit: (nodeId: string) => void
  onStartImageCrop: (nodeId: string) => void
  onContinueCreation: (nodeId: string, workflow: ProjectImageGenerationWorkflow) => void
}) => {
  const selectedNodeCount = useStore(state => state.nodes.filter(candidate => candidate.selected).length)
  const generationState = node.meta?.generationState
  const generationErrorCode = safeGenerationErrorCode(node.meta?.generationErrorCode)
  const failurePresentation = getRuntimeErrorPresentation(generationErrorCode)
  const imageUrl = node.assetId ? canvasImageAssetUrl(node.assetId) : node.imageUrl
  const crop = node.crop
  const imageStyle = crop ? {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${-crop.x / crop.width * 100}%`,
    top: `${-crop.y / crop.height * 100}%`
  } : undefined

  return (
    <div
      data-image-node
      data-image-generation-state={generationState || undefined}
      aria-busy={generationState === 'running' || undefined}
      className={`group relative h-full w-full overflow-visible ${selected ? 'ring-2 ring-[#c96442]' : ''}`}
    >
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
      <NodeToolbar isVisible={selected && selectedNodeCount === 1 && generationState !== 'running' && Boolean(node.assetId)} position={Position.Top} offset={10}>
        <ImageNodeToolbar
          canCrop={Boolean(node.assetId && !node.crop)}
          onEdit={() => onStartAnnotationEdit(node.id)}
          onCrop={() => onStartImageCrop(node.id)}
          generatedResult={node.meta?.source === 'image-generation-conversation'}
          onContinue={workflow => onContinueCreation(node.id, workflow)}
        />
      </NodeToolbar>
      <Handle type="target" position={Position.Left} className="!bg-gray-950 !opacity-0 group-hover:!opacity-100" />
      <div className="relative h-full w-full overflow-hidden">
        {generationState === 'running' ? (
          <div role="status" className="flex h-full w-full flex-col items-center justify-center gap-3 border border-gray-200 bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-600">
            <Loader2 className="h-7 w-7 animate-spin text-[#c96442]" aria-hidden="true" />
            <span className="text-xs font-bold">图片生成中</span>
          </div>
        ) : generationState === 'failed' ? (
          <div role="status" className="flex h-full w-full flex-col items-center justify-center gap-2 border border-red-200 bg-red-50 px-4 text-center text-red-700">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            <span className="text-xs font-black">图片生成失败</span>
            <span className="text-[11px] font-medium">{failurePresentation.message}</span>
          </div>
        ) : imageUrl ? (
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
        {generationState !== 'running' && generationState !== 'failed' && (
          <ImageAnnotationsLayer
            annotations={node.annotations || []}
            mode="display"
          />
        )}
      </div>
      <Handle id="image-output" type="source" position={Position.Right} className="!bg-gray-950 !opacity-0 group-hover:!opacity-100" />
    </div>
  )
}

const ImageNodeToolbar = ({
  canCrop,
  onEdit,
  onCrop,
  generatedResult,
  onContinue
}: {
  canCrop: boolean
  onEdit: () => void
  onCrop: () => void
  generatedResult: boolean
  onContinue: (workflow: ProjectImageGenerationWorkflow) => void
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
    {generatedResult && (
      <>
        <div className="mx-1 h-6 w-px bg-white/20" />
        <ImageToolbarButton title="参考图生成" onClick={() => onContinue('reference-generate')}><ImageIcon className="h-4 w-4" /></ImageToolbarButton>
        <ImageToolbarButton title="智能改图" onClick={() => onContinue('smart-edit')}><Brush className="h-4 w-4" /></ImageToolbarButton>
        <ImageToolbarButton title="局部修改" onClick={() => onContinue('region-edit')}><MousePointer2 className="h-4 w-4" /></ImageToolbarButton>
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
  positionClassName,
  quickDrawerOpen,
  quickPresets,
  onCreateText,
  onCreateImage,
  onCreateImageGenerator,
  onToggleQuickDrawer,
  onOpenQuickPresetComposer,
  onEditQuickPreset,
  onUseQuickPreset
}: {
  positionClassName?: string
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
    <div className={`absolute bottom-6 z-30 flex -translate-x-1/2 flex-col items-center gap-3 ${positionClassName || 'left-1/2'}`}>
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
          <ToolbarButton
            title="打开图片生成"
            ariaLabel="打开图片生成"
            onClick={onCreateImageGenerator}
          ><Brush className="h-4 w-4" /></ToolbarButton>
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

const ToolbarButton = ({ title, ariaLabel = title, onClick, onDragStart, draggable = false, children, disabled = false }: {
  title: string
  ariaLabel?: string
  onClick: () => void
  onDragStart?: (event: ReactDragEvent<HTMLButtonElement>) => void
  draggable?: boolean
  children: ReactNode
  disabled?: boolean
}) => (
  <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-950 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" title={title} aria-label={ariaLabel} draggable={draggable} onDragStart={onDragStart} disabled={disabled} onClick={() => { if (!disabled) onClick() }}>
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
    className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[7px] px-2 py-1 text-[11px] font-semibold transition ${
      active
        ? 'bg-white text-[#141413] shadow-[0_0_0_1px_rgba(20,20,19,0.05)]'
        : 'text-[#87867f] hover:bg-white/60 hover:text-[#4d4c48]'
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

const createLocalId = (prefix: string): string => globalThis.crypto?.randomUUID?.()
  || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const loadImageElement = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('Image asset could not be loaded'))
  image.src = src
})

const mergeById = <T extends { id: string }>(current: readonly T[], incoming: readonly T[]): T[] => {
  const merged = new Map(current.map(item => [item.id, item]))
  incoming.forEach(item => merged.set(item.id, item))
  return Array.from(merged.values())
}

const imageGenerationPlaceholderFrame = (
  draft: Pick<ImageGenerationComposerDraft, 'aspectRatio' | 'width' | 'height'>
): { width: number; height: number } => {
  let ratio = 1
  if (draft.aspectRatio === 'custom' && draft.width && draft.height) {
    ratio = draft.width / draft.height
  } else {
    const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(draft.aspectRatio)
    if (match) ratio = Number(match[1]) / Number(match[2])
  }
  if (!Number.isFinite(ratio) || ratio <= 0) ratio = 1
  return ratio >= 1
    ? { width: 320, height: Math.max(1, Math.round(320 / ratio)) }
    : { width: Math.max(1, Math.round(320 * ratio)), height: 320 }
}

const safeGenerationErrorCode = (value: unknown): string => (
  typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : 'generation_failed'
)

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
