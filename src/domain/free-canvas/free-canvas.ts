import type { Edge, Node, XYPosition } from '@xyflow/react'
import type {
  IThreeStageForm,
  IThreeStageItem,
  IThreeStagePage,
  IThreeStageProject,
  ThreeStageKey
} from '@/models/PromptHistory.model'
import { normalizeThreeStagePages, syncThreeStageLegacyFields } from '@/domain/three-stage/three-stage-pages'

export type FreeCanvasMediaNodeKind = 'imageAsset' | 'textOverlay' | 'arrowAnnotation' | 'mediaGroup'
export type FreeCanvasNodeKind = 'threeStageForm' | FreeCanvasMediaNodeKind

export interface FreeCanvasPosition {
  x: number
  y: number
}

export interface FreeCanvasMediaNode {
  id: string
  kind: FreeCanvasMediaNodeKind
  title: string
  position: FreeCanvasPosition
  width: number
  height: number
  assetId?: string | null
  imageUrl?: string
  imagePrompt?: string
  sourceNodeId?: string | null
  generatedFromAgent?: boolean
  crop?: {
    x: number
    y: number
    width: number
    height: number
  } | null
  text?: string
  color?: string
  meta: Record<string, unknown>
}

export interface FreeCanvasUserEdge {
  id: string
  source: string
  target: string
  label?: string
  createdAt: number
}

export interface FreeCanvasMeta {
  mediaNodes: FreeCanvasMediaNode[]
  edges: FreeCanvasUserEdge[]
}

export interface FreeCanvasNodeData extends Record<string, unknown> {
  nodeKind: FreeCanvasNodeKind
  title: string
  subtitle?: string
  pageId?: string
  itemId?: string
  formId?: string
  formType?: ThreeStageKey
  pairId?: string | null
  mediaNode?: FreeCanvasMediaNode
  form?: IThreeStageForm
  selectedFieldId?: string
  onSelectField?: (form: IThreeStageForm, fieldId: string) => void
  onUpdateField?: (form: IThreeStageForm, fieldId: string, value: string) => void
  onUpdateMediaText?: (nodeId: string, text: string) => void
}

export type FreeCanvasFlowNode = Node<FreeCanvasNodeData>
export type FreeCanvasFlowEdge = Edge

export const threeStageFormNodeId = (formId: string): string => `three-stage-form:${formId}`
export const mediaNodeFlowId = (mediaNodeId: string): string => `media:${mediaNodeId}`

export const getFreeCanvasMeta = (threeStage: IThreeStageProject): FreeCanvasMeta => {
  const candidate = threeStage.meta?.freeCanvas as Partial<FreeCanvasMeta> | undefined
  return {
    mediaNodes: Array.isArray(candidate?.mediaNodes) ? candidate.mediaNodes.map(normalizeMediaNode) : [],
    edges: Array.isArray(candidate?.edges) ? candidate.edges.map(normalizeUserEdge).filter(edge => edge.source && edge.target) : []
  }
}

export const setFreeCanvasMeta = (threeStage: IThreeStageProject, meta: Partial<FreeCanvasMeta>): IThreeStageProject => {
  const currentMeta = getFreeCanvasMeta(threeStage)
  return {
  ...threeStage,
  meta: {
    ...threeStage.meta,
    freeCanvas: {
      ...currentMeta,
      ...meta,
      mediaNodes: (meta.mediaNodes || currentMeta.mediaNodes).map(normalizeMediaNode),
      edges: (meta.edges || currentMeta.edges).map(normalizeUserEdge).filter(edge => edge.source && edge.target)
    }
  }
}
}

export const createFreeCanvasMediaNode = (
  kind: FreeCanvasMediaNodeKind,
  position: FreeCanvasPosition,
  timestamp = Date.now()
): FreeCanvasMediaNode => ({
  id: `${timestamp}-${kind}-${Math.random().toString(36).slice(2, 8)}`,
  kind,
  title: mediaTitle(kind),
  position,
  width: kind === 'arrowAnnotation' ? 260 : 300,
  height: kind === 'textOverlay' ? 120 : kind === 'arrowAnnotation' ? 120 : 220,
  assetId: null,
  imageUrl: '',
  imagePrompt: '',
  sourceNodeId: null,
  generatedFromAgent: false,
  crop: null,
  text: kind === 'textOverlay' ? '文字标注' : kind === 'arrowAnnotation' ? '箭头说明' : '',
  color: '#111827',
  meta: {}
})

export const addFreeCanvasMediaNode = (
  threeStage: IThreeStageProject,
  node: FreeCanvasMediaNode
): IThreeStageProject => {
  const meta = getFreeCanvasMeta(threeStage)
  return setFreeCanvasMeta(threeStage, { mediaNodes: [...meta.mediaNodes, normalizeMediaNode(node)] })
}

export const updateFreeCanvasMediaNode = (
  threeStage: IThreeStageProject,
  nodeId: string,
  updates: Partial<FreeCanvasMediaNode>
): IThreeStageProject => {
  const meta = getFreeCanvasMeta(threeStage)
  return setFreeCanvasMeta(threeStage, {
    mediaNodes: meta.mediaNodes.map(node => node.id === nodeId ? normalizeMediaNode({ ...node, ...updates }) : node)
  })
}

export const removeFreeCanvasMediaNode = (
  threeStage: IThreeStageProject,
  nodeId: string
): IThreeStageProject => {
  const meta = getFreeCanvasMeta(threeStage)
  const flowNodeId = mediaNodeFlowId(nodeId)
  return setFreeCanvasMeta(threeStage, {
    mediaNodes: meta.mediaNodes.filter(node => node.id !== nodeId),
    edges: meta.edges.filter(edge => edge.source !== flowNodeId && edge.target !== flowNodeId)
  })
}

export const removeFreeCanvasFlowNodes = (
  threeStage: IThreeStageProject,
  flowNodeIds: string[]
): IThreeStageProject => {
  if (flowNodeIds.length === 0) return threeStage

  const removedFlowIds = new Set(flowNodeIds)
  const removedMediaIds = new Set(
    flowNodeIds
      .filter(nodeId => nodeId.startsWith('media:'))
      .map(nodeId => nodeId.replace(/^media:/, ''))
  )
  const meta = getFreeCanvasMeta(threeStage)

  return setFreeCanvasMeta(threeStage, {
    mediaNodes: meta.mediaNodes.filter(node => !removedMediaIds.has(node.id)),
    edges: meta.edges.filter(edge => !removedFlowIds.has(edge.source) && !removedFlowIds.has(edge.target))
  })
}

export const addFreeCanvasEdge = (
  threeStage: IThreeStageProject,
  edge: Pick<FreeCanvasUserEdge, 'source' | 'target'> & Partial<FreeCanvasUserEdge>,
  timestamp = Date.now()
): IThreeStageProject => {
  if (!edge.source || !edge.target || edge.source === edge.target) return threeStage
  const meta = getFreeCanvasMeta(threeStage)
  const duplicate = meta.edges.some(candidate => candidate.source === edge.source && candidate.target === edge.target)
  if (duplicate) return threeStage

  return setFreeCanvasMeta(threeStage, {
    ...meta,
    edges: [
      ...meta.edges,
      normalizeUserEdge({
        id: edge.id || `free-canvas-edge:${edge.source}:${edge.target}:${timestamp}`,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        createdAt: edge.createdAt || timestamp
      })
    ]
  })
}

export const getFreeCanvasConnectedChain = (
  graph: { nodes: FreeCanvasFlowNode[]; edges: FreeCanvasFlowEdge[] },
  edgeId: string | null
): {
  nodeIds: string[]
  nodes: FreeCanvasFlowNode[]
  edges: FreeCanvasFlowEdge[]
} => {
  if (!edgeId) return { nodeIds: [], nodes: [], edges: [] }
  const selectedEdge = graph.edges.find(edge => edge.id === edgeId)
  if (!selectedEdge) return { nodeIds: [], nodes: [], edges: [] }

  const visited = new Set<string>()
  const queue = [selectedEdge.source, selectedEdge.target]

  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (!nodeId || visited.has(nodeId)) continue
    visited.add(nodeId)

    for (const edge of graph.edges) {
      if (edge.source === nodeId && !visited.has(edge.target)) queue.push(edge.target)
      if (edge.target === nodeId && !visited.has(edge.source)) queue.push(edge.source)
    }
  }

  const chainEdges = graph.edges.filter(edge => visited.has(edge.source) && visited.has(edge.target))
  return {
    nodeIds: Array.from(visited),
    nodes: graph.nodes.filter(node => visited.has(node.id)),
    edges: chainEdges
  }
}

export const buildFreeCanvasGraph = (threeStage: IThreeStageProject): {
  nodes: FreeCanvasFlowNode[]
  edges: FreeCanvasFlowEdge[]
} => {
  const synced = syncThreeStageLegacyFields(threeStage)
  const pages = normalizeThreeStagePages(synced)
  const nodes: FreeCanvasFlowNode[] = []
  const edges: FreeCanvasFlowEdge[] = []

  pages.forEach((page, pageIndex) => {
    page.items.forEach((item, itemIndex) => {
      if (item.kind === 'character') {
        nodes.push(formNode(page, item, item.form, defaultFormPosition(pageIndex, itemIndex, 0)))
        return
      }

      const storyboardNode = formNode(page, item, item.storyboardForm, defaultFormPosition(pageIndex, itemIndex, 1), item.pairId)
      const videoNode = formNode(page, item, item.videoPromptForm, defaultFormPosition(pageIndex, itemIndex, 2), item.pairId)
      nodes.push(storyboardNode, videoNode)
      edges.push({
        id: `three-stage-pair:${item.pairId}`,
        source: storyboardNode.id,
        target: videoNode.id,
        label: `绑定组 #${item.number}`,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#c7ccd5', strokeWidth: 1.5 }
      })
    })
  })

  for (const mediaNode of getFreeCanvasMeta(threeStage).mediaNodes) {
    nodes.push({
      id: mediaNodeFlowId(mediaNode.id),
      type: 'freeCanvasMedia',
      position: mediaNode.position,
      data: {
        nodeKind: mediaNode.kind,
        title: mediaNode.title,
        subtitle: mediaSubtitle(mediaNode),
        mediaNode
      }
    })
  }

  for (const edge of getFreeCanvasMeta(threeStage).edges) {
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#111827', strokeWidth: 1.8 },
      data: { userCreated: true, createdAt: edge.createdAt }
    })
  }

  return { nodes, edges }
}

export const updateFreeCanvasNodePosition = (
  threeStage: IThreeStageProject,
  nodeId: string,
  position: XYPosition
): IThreeStageProject => {
  if (nodeId.startsWith('media:')) {
    return updateFreeCanvasMediaNode(threeStage, nodeId.replace(/^media:/, ''), { position })
  }

  const formId = nodeId.replace(/^three-stage-form:/, '')
  const pages = normalizeThreeStagePages(threeStage).map(page => ({
    ...page,
    items: page.items.map(item => updateItemFormPosition(item, formId, position))
  }))

  return syncThreeStageLegacyFields({ ...threeStage, pages })
}

const updateItemFormPosition = (
  item: IThreeStageItem,
  formId: string,
  position: FreeCanvasPosition
): IThreeStageItem => {
  if (item.kind === 'character' && item.form.id === formId) {
    return { ...item, form: updateFormCanvasPosition(item.form, position), updatedAt: Date.now() }
  }
  if (item.kind === 'storyVideoPair') {
    if (item.storyboardForm.id === formId) {
      return { ...item, storyboardForm: updateFormCanvasPosition(item.storyboardForm, position), updatedAt: Date.now() }
    }
    if (item.videoPromptForm.id === formId) {
      return { ...item, videoPromptForm: updateFormCanvasPosition(item.videoPromptForm, position), updatedAt: Date.now() }
    }
  }
  return item
}

const updateFormCanvasPosition = (form: IThreeStageForm, position: FreeCanvasPosition): IThreeStageForm => ({
  ...form,
  meta: {
    ...form.meta,
    canvas: {
      ...(typeof form.meta.canvas === 'object' && form.meta.canvas ? form.meta.canvas : {}),
      position
    }
  },
  updatedAt: Date.now()
})

const formNode = (
  page: IThreeStagePage,
  item: IThreeStageItem,
  form: IThreeStageForm,
  fallbackPosition: FreeCanvasPosition,
  pairId: string | null = null
): FreeCanvasFlowNode => ({
  id: threeStageFormNodeId(form.id),
  type: 'threeStageForm',
  position: getFormCanvasPosition(form) || fallbackPosition,
  data: {
    nodeKind: 'threeStageForm',
    title: form.title,
    subtitle: formSubtitle(form.type),
    pageId: page.id,
    itemId: item.id,
    formId: form.id,
    formType: form.type,
    pairId
  }
})

const getFormCanvasPosition = (form: IThreeStageForm): FreeCanvasPosition | null => {
  const canvas = form.meta.canvas as { position?: Partial<FreeCanvasPosition> } | undefined
  const x = canvas?.position?.x
  const y = canvas?.position?.y
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null
}

const defaultFormPosition = (pageIndex: number, itemIndex: number, lane: number): FreeCanvasPosition => ({
  x: 80 + lane * 380,
  y: 80 + pageIndex * 420 + itemIndex * 190
})

const normalizeMediaNode = (node: Partial<FreeCanvasMediaNode>): FreeCanvasMediaNode => ({
  id: node.id || `${Date.now()}-media`,
  kind: node.kind || 'imageAsset',
  title: node.title || mediaTitle(node.kind || 'imageAsset'),
  position: {
    x: Number(node.position?.x || 0),
    y: Number(node.position?.y || 0)
  },
  width: Number(node.width || 300),
  height: Number(node.height || 220),
  assetId: node.assetId || null,
  imageUrl: node.imageUrl || '',
  imagePrompt: node.imagePrompt || '',
  sourceNodeId: node.sourceNodeId || null,
  generatedFromAgent: Boolean(node.generatedFromAgent),
  crop: node.crop || null,
  text: node.text || '',
  color: node.color || '#111827',
  meta: node.meta || {}
})

const normalizeUserEdge = (edge: Partial<FreeCanvasUserEdge>): FreeCanvasUserEdge => ({
  id: edge.id || `free-canvas-edge:${edge.source || 'source'}:${edge.target || 'target'}:${Date.now()}`,
  source: String(edge.source || ''),
  target: String(edge.target || ''),
  label: edge.label ? String(edge.label) : undefined,
  createdAt: Number(edge.createdAt || Date.now())
})

const mediaTitle = (kind: FreeCanvasMediaNodeKind): string => {
  if (kind === 'imageAsset') return '图片节点'
  if (kind === 'textOverlay') return '文字标注'
  if (kind === 'arrowAnnotation') return '箭头标注'
  return '媒体组合'
}

const mediaSubtitle = (node: FreeCanvasMediaNode): string => {
  if (node.kind === 'imageAsset') return node.imageUrl ? '已置入图片' : '等待图片置入'
  if (node.kind === 'textOverlay') return node.text || '文字嵌入层'
  if (node.kind === 'arrowAnnotation') return node.text || '箭头说明层'
  return '图片/文字/箭头组合'
}

const formSubtitle = (type: ThreeStageKey): string => {
  if (type === 'character') return '人物板节点'
  if (type === 'storyboard') return '故事板节点'
  return '视频提示词节点'
}
