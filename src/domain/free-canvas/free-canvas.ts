import type { Edge, Node, XYPosition } from '@xyflow/react'
import type {
  IThreeStageForm,
  IThreeStageFormItem,
  IThreeStagePage,
  IThreeStageProject,
  ThreeStageKey
} from '@/models/PromptHistory.model'
import { normalizeThreeStagePages, selectThreeStageFormAfterRemoval, syncThreeStageLegacyFields } from '@/domain/three-stage/three-stage-pages'
import {
  buildThreeStageFormOutput,
  normalizeFixedContentOverrides,
  type FixedContentOverrides
} from '@/domain/three-stage/three-stage-definitions'

export type FreeCanvasMediaNodeKind = 'imageAsset' | 'textOverlay' | 'arrowAnnotation' | 'mediaGroup'
export type FreeCanvasNodeKind = 'threeStageForm' | FreeCanvasMediaNodeKind

export interface FreeCanvasCropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FreeCanvasCropLines {
  horizontal: number[]
  vertical: number[]
}

export interface FreeCanvasCropRegion extends FreeCanvasCropRect {
  row: number
  column: number
}

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
  crop?: FreeCanvasCropRect | null
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

export interface RemoveFreeCanvasNodesResult {
  threeStage: IThreeStageProject
  removedNodeIds: string[]
  blockedReason: string | null
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
  onUpdateFixedContent?: (form: IThreeStageForm, contentId: string, value: string) => void
  onToggleFixedContent?: (form: IThreeStageForm, contentId: string, unlocked: boolean) => void
  onResetFixedContent?: (form: IThreeStageForm, contentId: string) => void
  onCopyOutput?: (form: IThreeStageForm) => void
  onUpdateMediaText?: (nodeId: string, text: string) => void
  onStartImageCrop?: (nodeId: string) => void
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

export const normalizeFreeCanvasCropLines = (lines: number[], minimumGap = 0.005): number[] => {
  const sorted = lines
    .filter(value => Number.isFinite(value) && value > 0 && value < 1)
    .sort((left, right) => left - right)

  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] >= minimumGap)
}

export const buildFreeCanvasCropGrid = (lines: FreeCanvasCropLines): FreeCanvasCropRegion[] => {
  const horizontal = [0, ...normalizeFreeCanvasCropLines(lines.horizontal), 1]
  const vertical = [0, ...normalizeFreeCanvasCropLines(lines.vertical), 1]
  const regions: FreeCanvasCropRegion[] = []

  for (let row = 0; row < horizontal.length - 1; row += 1) {
    for (let column = 0; column < vertical.length - 1; column += 1) {
      regions.push({
        x: vertical[column],
        y: horizontal[row],
        width: vertical[column + 1] - vertical[column],
        height: horizontal[row + 1] - horizontal[row],
        row,
        column
      })
    }
  }
  return regions
}

export const createFreeCanvasCroppedNodes = (
  source: FreeCanvasMediaNode,
  lines: FreeCanvasCropLines,
  timestamp = Date.now()
): FreeCanvasMediaNode[] => {
  if (!source.assetId) return []
  const regions = buildFreeCanvasCropGrid(lines)
  const startX = source.position.x + source.width + 40
  const gap = 10

  return regions.map((region, index) => ({
    ...createFreeCanvasMediaNode('imageAsset', {
      x: startX + source.width * region.x + region.column * gap,
      y: source.position.y + source.height * region.y + region.row * gap
    }, timestamp + index),
    title: `${source.title} ${index + 1}`,
    width: source.width * region.width,
    height: source.height * region.height,
    assetId: source.assetId,
    imageUrl: source.imageUrl,
    sourceNodeId: source.id,
    crop: { x: region.x, y: region.y, width: region.width, height: region.height },
    meta: { ...source.meta, cropIndex: index }
  }))
}

export const duplicateFreeCanvasMediaNode = (
  source: FreeCanvasMediaNode,
  timestamp = Date.now(),
  offset = 28
): FreeCanvasMediaNode => ({
  ...source,
  id: `${timestamp}-${source.kind}-${Math.random().toString(36).slice(2, 8)}`,
  title: `${source.title} 副本`,
  position: { x: source.position.x + offset, y: source.position.y + offset },
  crop: source.crop ? { ...source.crop } : null,
  meta: { ...source.meta, duplicatedFromNodeId: source.id }
})

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

export const removeFreeCanvasNodes = (
  threeStage: IThreeStageProject,
  flowNodeIds: string[]
): RemoveFreeCanvasNodesResult => {
  const requestedIds = new Set(flowNodeIds)
  if (requestedIds.size === 0) {
    return { threeStage, removedNodeIds: [], blockedReason: null }
  }

  const graph = buildFreeCanvasGraph(threeStage)
  const itemIdsByPage = new Map<string, Set<string>>()
  const removedFlowIds = new Set<string>()

  for (const node of graph.nodes) {
    if (!requestedIds.has(node.id)) continue
    if (node.data.nodeKind !== 'threeStageForm') {
      removedFlowIds.add(node.id)
      continue
    }
    if (!node.data.pageId || !node.data.itemId) continue
    const pageItemIds = itemIdsByPage.get(node.data.pageId) || new Set<string>()
    pageItemIds.add(node.data.itemId)
    itemIdsByPage.set(node.data.pageId, pageItemIds)

    for (const pairedNode of graph.nodes) {
      if (pairedNode.data.itemId === node.data.itemId) removedFlowIds.add(pairedNode.id)
    }
  }

  const pages = normalizeThreeStagePages(threeStage)
  const emptiesPage = pages.some(page => {
    const removedItemIds = itemIdsByPage.get(page.id)
    return removedItemIds && page.items.every(item => removedItemIds.has(item.id))
  })
  if (emptiesPage) {
    return { threeStage, removedNodeIds: [], blockedReason: '每页至少保留一个表单。' }
  }

  const nextPages = pages.map(page => {
    const removedItemIds = itemIdsByPage.get(page.id)
    if (!removedItemIds?.size) return page
    const items = page.items.filter(item => !removedItemIds.has(item.id))
    return {
      ...page,
      items,
      selectedItemId: items[0]?.id || null,
      updatedAt: Date.now()
    }
  })
  const removedMediaIds = new Set(
    Array.from(removedFlowIds)
      .filter(nodeId => nodeId.startsWith('media:'))
      .map(nodeId => nodeId.replace(/^media:/, ''))
  )
  const meta = getFreeCanvasMeta(threeStage)
  const selected = selectThreeStageFormAfterRemoval(threeStage, nextPages, threeStage.selectedPageId || undefined)
  const updated = setFreeCanvasMeta(syncThreeStageLegacyFields(selected), {
    mediaNodes: meta.mediaNodes.filter(node => !removedMediaIds.has(node.id)),
    edges: meta.edges.filter(edge => !removedFlowIds.has(edge.source) && !removedFlowIds.has(edge.target))
  })

  return {
    threeStage: updated,
    removedNodeIds: Array.from(removedFlowIds),
    blockedReason: null
  }
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
      nodes.push(formNode(page, item, item.form, defaultFormPosition(pageIndex, itemIndex, formLane(item.form.type))))
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

export const getFormFixedContentOverrides = (form: IThreeStageForm): FixedContentOverrides => {
  const canvas = form.meta.canvas as { fixedContent?: unknown } | undefined
  return normalizeFixedContentOverrides(form.type, canvas?.fixedContent)
}

export const updateFreeCanvasFormFixedContent = (
  threeStage: IThreeStageProject,
  formId: string,
  contentId: string,
  update: { value?: string; unlocked?: boolean } | null
): IThreeStageProject => {
  const pages = normalizeThreeStagePages(threeStage).map(page => ({
    ...page,
    items: page.items.map(item => updateItemFormFixedContent(item, formId, contentId, update))
  }))
  return syncThreeStageLegacyFields({ ...threeStage, pages })
}

export const buildFreeCanvasFormOutput = (
  form: IThreeStageForm,
  project?: IThreeStageProject
): string => buildThreeStageFormOutput(form, project)

const updateItemFormPosition = (
  item: IThreeStageFormItem,
  formId: string,
  position: FreeCanvasPosition
): IThreeStageFormItem => {
  if (item.form.id === formId) {
    return { ...item, form: updateFormCanvasPosition(item.form, position), updatedAt: Date.now() }
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

const updateItemFormFixedContent = (
  item: IThreeStageFormItem,
  formId: string,
  contentId: string,
  update: { value?: string; unlocked?: boolean } | null
): IThreeStageFormItem => {
  const updateForm = (form: IThreeStageForm): IThreeStageForm => {
    if (form.id !== formId) return form
    const canvas = typeof form.meta.canvas === 'object' && form.meta.canvas
      ? form.meta.canvas as Record<string, unknown>
      : {}
    const fixedContent = { ...getFormFixedContentOverrides(form) }
    if (update === null) {
      delete fixedContent[contentId]
    } else {
      fixedContent[contentId] = { ...fixedContent[contentId], ...update }
    }
    return {
      ...form,
      meta: { ...form.meta, canvas: { ...canvas, fixedContent } },
      updatedAt: Date.now()
    }
  }

  const form = updateForm(item.form)
  return form === item.form ? item : { ...item, form, updatedAt: form.updatedAt }
}

const formNode = (
  page: IThreeStagePage,
  item: IThreeStageFormItem,
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

const formLane = (type: ThreeStageKey): number => {
  if (type === 'storyboard') return 1
  if (type === 'videoPrompt') return 2
  if (type === 'object') return 3
  return 0
}

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
  crop: normalizeCropRect(node.crop),
  text: node.text || '',
  color: node.color || '#111827',
  meta: node.meta || {}
})

const normalizeCropRect = (crop: FreeCanvasCropRect | null | undefined): FreeCanvasCropRect | null => {
  if (!crop) return null
  const x = Math.min(1, Math.max(0, Number(crop.x) || 0))
  const y = Math.min(1, Math.max(0, Number(crop.y) || 0))
  const width = Math.min(1 - x, Math.max(0, Number(crop.width) || 0))
  const height = Math.min(1 - y, Math.max(0, Number(crop.height) || 0))
  return width > 0 && height > 0 ? { x, y, width, height } : null
}

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

const readableFormSubtitle = (type: ThreeStageKey): string => {
  if (type === 'character') return '人物版节点'
  if (type === 'object') return '物品版节点'
  if (type === 'storyboard') return '故事版节点'
  return '提示词版节点'
}

const formSubtitle = (type: ThreeStageKey): string => {
  return readableFormSubtitle(type)
}
