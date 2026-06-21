import {
  buildFreeCanvasFormOutput,
  buildFreeCanvasGraph,
  getFreeCanvasMeta,
  type FreeCanvasFlowNode,
  type FreeCanvasMediaNode
} from './free-canvas'
import { normalizeThreeStagePages } from '@/domain/three-stage/three-stage-pages'
import type {
  IFreeCanvasEdge,
  IFreeCanvasImageNode,
  IFreeCanvasNode,
  IFreeCanvasPosition,
  IFreeCanvasProject,
  IFreeCanvasTextNode,
  IFreeCanvasTextSegment,
  IFreeCanvasViewport,
  IPromptProject
} from '@/models/PromptHistory.model'

const DEFAULT_USER_COLOR = '#111827'
const DEFAULT_PRESET_COLOR = '#ef4423'

export const createFreeCanvasProject = (
  timestamp = Date.now(),
  overrides: Partial<IFreeCanvasProject> = {}
): IFreeCanvasProject => normalizeFreeCanvasProject({
  nodes: overrides.nodes || [],
  edges: overrides.edges || [],
  viewport: overrides.viewport ?? null,
  selectedNodeId: overrides.selectedNodeId ?? null,
  meta: overrides.meta || {}
}, timestamp)

export const createFreeCanvasTextNode = (
  text: string,
  position: IFreeCanvasPosition,
  timestamp = Date.now(),
  source: 'preset' | 'user' = 'user'
): IFreeCanvasTextNode => {
  const trimmed = String(text || '')
  return {
    id: `free-text-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'text',
    title: 'Text',
    position,
    width: 420,
    height: 180,
    fontSize: 'large',
    segments: trimmed ? [createTextSegment(trimmed, source, timestamp)] : [],
    meta: {}
  }
}

export const createQuickTextNode = (
  text: string,
  position: IFreeCanvasPosition,
  timestamp = Date.now()
): IFreeCanvasTextNode => createFreeCanvasTextNode(text, position, timestamp, 'preset')

export const createFreeCanvasImageNodeFromMedia = (
  media: FreeCanvasMediaNode,
  timestamp = Date.now()
): IFreeCanvasImageNode => ({
  id: `free-image-${media.id || timestamp}`,
  kind: 'image',
  title: media.title || 'Image',
  position: normalizePosition(media.position),
  width: Number(media.width || 300),
  height: Number(media.height || 220),
  assetId: media.assetId || null,
  imageUrl: media.imageUrl || '',
  imagePrompt: media.imagePrompt || '',
  sourceNodeId: media.sourceNodeId || null,
  crop: media.crop || null,
  meta: { legacyMediaNodeId: media.id }
})

export const appendFreeCanvasUserText = (
  project: IFreeCanvasProject,
  nodeId: string,
  text: string,
  timestamp = Date.now()
): IFreeCanvasProject => updateTextNodeSegments(project, nodeId, segments => [
  ...segments,
  createTextSegment(text, 'user', timestamp)
])

export const updateFreeCanvasTextNodeUserText = (
  project: IFreeCanvasProject,
  nodeId: string,
  text: string,
  mode: 'replace' | 'append' = 'replace',
  timestamp = Date.now()
): IFreeCanvasProject => updateTextNodeSegments(project, nodeId, segments => {
  const presetSegments = segments.filter(segment => segment.source === 'preset')
  const userSegments = segments.filter(segment => segment.source === 'user')
  if (mode === 'append' && userSegments.length > 0) {
    const lastUserId = userSegments[userSegments.length - 1].id
    return segments.map(segment => segment.id === lastUserId
      ? { ...segment, text: [segment.text, text].filter(Boolean).join('\n'), updatedAt: timestamp }
      : segment)
  }
  return [
    ...presetSegments,
    createTextSegment(text, 'user', timestamp)
  ]
})

export const replaceFreeCanvasTextRange = (
  project: IFreeCanvasProject,
  nodeId: string,
  range: { start: number; end: number },
  insertedText: string,
  color = DEFAULT_USER_COLOR,
  timestamp = Date.now()
): IFreeCanvasProject => updateTextNodeSegments(project, nodeId, segments => {
  const fullTextLength = segments.reduce((total, segment) => total + segment.text.length, 0)
  const start = clampNumber(range.start, 0, fullTextLength)
  const end = clampNumber(Math.max(range.end, start), start, fullTextLength)
  const nextSegments: IFreeCanvasTextSegment[] = []
  let cursor = 0
  let inserted = false

  segments.forEach(segment => {
    const segmentText = String(segment.text || '')
    const segmentStart = cursor
    const segmentEnd = cursor + segmentText.length
    const beforeLength = clampNumber(start - segmentStart, 0, segmentText.length)
    const afterOffset = clampNumber(end - segmentStart, 0, segmentText.length)

    if (beforeLength > 0) {
      nextSegments.push(createTextSegmentWithColor(segmentText.slice(0, beforeLength), segment.source, segment.color, timestamp))
    }

    if (!inserted && segmentEnd >= start) {
      if (insertedText) {
        nextSegments.push(createTextSegmentWithColor(insertedText, 'user', color, timestamp))
      }
      inserted = true
    }

    if (afterOffset < segmentText.length) {
      nextSegments.push(createTextSegmentWithColor(segmentText.slice(afterOffset), segment.source, segment.color, timestamp))
    }

    cursor = segmentEnd
  })

  if (!inserted && insertedText) {
    nextSegments.push(createTextSegmentWithColor(insertedText, 'user', color, timestamp))
  }

  return mergeAdjacentTextSegments(nextSegments)
})

export const updateFreeCanvasNodePosition = (
  project: IFreeCanvasProject,
  nodeId: string,
  position: IFreeCanvasPosition
): IFreeCanvasProject => ({
  ...project,
  nodes: project.nodes.map(node => node.id === nodeId ? { ...node, position: normalizePosition(position) } : node)
})

export const updateFreeCanvasTextNodeStyle = (
  project: IFreeCanvasProject,
  nodeId: string,
  updates: Partial<Pick<IFreeCanvasTextNode, 'fontSize'>> & { color?: string }
): IFreeCanvasProject => ({
  ...project,
  nodes: project.nodes.map(node => {
    if (node.id !== nodeId || node.kind !== 'text') return node
    return {
      ...node,
      fontSize: updates.fontSize || node.fontSize,
      meta: updates.color ? { ...node.meta, userTextColor: updates.color } : node.meta,
      segments: updates.color
        ? node.segments.map(segment => segment.source === 'user' ? { ...segment, color: updates.color || segment.color } : segment)
        : node.segments
    }
  })
})

export const updateFreeCanvasTextSegments = (
  project: IFreeCanvasProject,
  nodeId: string,
  segments: IFreeCanvasTextSegment[]
): IFreeCanvasProject => updateTextNodeSegments(project, nodeId, () => segments.map(normalizeTextSegment))

export const removeFreeCanvasProjectNodes = (
  project: IFreeCanvasProject,
  nodeIds: string[]
): IFreeCanvasProject => {
  const removed = new Set(nodeIds)
  return {
    ...project,
    nodes: project.nodes.filter(node => !removed.has(node.id)),
    edges: project.edges.filter(edge => !removed.has(edge.source) && !removed.has(edge.target)),
    selectedNodeId: project.selectedNodeId && removed.has(project.selectedNodeId) ? null : project.selectedNodeId || null
  }
}

export const normalizeFreeCanvasProject = (
  value: Partial<IFreeCanvasProject> | undefined,
  timestamp = Date.now()
): IFreeCanvasProject => {
  const nodes = Array.isArray(value?.nodes) ? value.nodes.map(node => normalizeNode(node, timestamp)).filter((node): node is IFreeCanvasNode => Boolean(node)) : []
  const nodeIds = new Set(nodes.map(node => node.id))
  const edges = Array.isArray(value?.edges)
    ? value.edges.map(edge => normalizeEdge(edge, timestamp)).filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    : []
  const selectedNodeId = value?.selectedNodeId && nodeIds.has(value.selectedNodeId) ? value.selectedNodeId : null
  return {
    nodes,
    edges,
    viewport: normalizeViewport(value?.viewport),
    selectedNodeId,
    meta: value?.meta && typeof value.meta === 'object' ? value.meta : {}
  }
}

export const freeCanvasTextDisplay = (node: IFreeCanvasTextNode): string =>
  node.segments.map(segment => segment.text).filter(Boolean).join('\n')

export const freeCanvasPresetText = (node: IFreeCanvasTextNode): string =>
  node.segments.filter(segment => segment.source === 'preset').map(segment => segment.text).filter(Boolean).join('\n')

export const freeCanvasUserText = (node: IFreeCanvasTextNode): string =>
  node.segments.filter(segment => segment.source === 'user').map(segment => segment.text).filter(Boolean).join('\n')

export const migrateLegacyThreeStageFreeCanvasProject = (project: IPromptProject): IPromptProject => {
  if (project.type !== 'three-stage' || project.meta?.builderTemplateId !== 'free-canvas' || !project.threeStage) return project

  const graph = buildFreeCanvasGraph(project.threeStage)
  const formsById = new Map(normalizeThreeStagePages(project.threeStage).flatMap(page =>
    page.items.map(item => [item.form.id, item.form] as const)
  ))
  const idMap = new Map<string, string>()
  const nodes = graph.nodes.flatMap((node, index) => {
    const migrated = migrateLegacyNode(node, index, formsById)
    if (migrated) idMap.set(node.id, migrated.id)
    return migrated ? [migrated] : []
  })
  const edges = getFreeCanvasMeta(project.threeStage).edges.flatMap(edge => {
    const source = idMap.get(edge.source)
    const target = idMap.get(edge.target)
    if (!source || !target) return []
    return [{
      id: edge.id,
      source,
      target,
      label: edge.label,
      createdAt: edge.createdAt
    }]
  })

  return {
    ...project,
    type: 'free-canvas',
    threeStage: undefined,
    freeCanvas: createFreeCanvasProject(Date.now(), {
      nodes,
      edges,
      selectedNodeId: nodes[0]?.id || null,
      meta: {
        migratedFrom: 'three-stage-free-canvas',
        migratedAt: Date.now()
      }
    }),
    meta: {
      ...project.meta,
      legacyBuilderTemplateId: project.meta.builderTemplateId,
      builderTemplateId: undefined
    }
  }
}

const migrateLegacyNode = (
  node: FreeCanvasFlowNode,
  index: number,
  formsById: Map<string, ReturnType<typeof normalizeThreeStagePages>[number]['items'][number]['form']>
): IFreeCanvasNode | null => {
  const timestamp = Date.now() + index
  const form = node.data.formId ? formsById.get(node.data.formId) : undefined
  if (node.data.nodeKind === 'threeStageForm' && form) {
    return {
      ...createFreeCanvasTextNode(buildFreeCanvasFormOutput(form), node.position, timestamp, 'user'),
      id: `free-text-${node.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
      title: node.data.title,
      meta: { legacyNodeId: node.id, legacyFormId: node.data.formId, legacyFormType: node.data.formType }
    }
  }
  const media = node.data.mediaNode
  if (!media) return null
  if (media.kind === 'imageAsset') {
    return {
      ...createFreeCanvasImageNodeFromMedia(media, timestamp),
      id: `free-image-${media.id}`
    }
  }
  if (media.kind === 'arrowAnnotation') {
    return {
      id: `free-arrow-${media.id}`,
      kind: 'arrow',
      title: media.title || 'Arrow',
      position: normalizePosition(media.position),
      width: Number(media.width || 260),
      height: Number(media.height || 120),
      text: media.text || '',
      color: media.color || DEFAULT_USER_COLOR,
      meta: { legacyMediaNodeId: media.id }
    }
  }
  return {
    ...createFreeCanvasTextNode(media.text || '', normalizePosition(media.position), timestamp, 'user'),
    id: `free-text-${media.id}`,
    title: media.title || 'Text',
    width: Number(media.width || 360),
    height: Number(media.height || 160),
    meta: { legacyMediaNodeId: media.id }
  }
}

const updateTextNodeSegments = (
  project: IFreeCanvasProject,
  nodeId: string,
  update: (segments: IFreeCanvasTextSegment[]) => IFreeCanvasTextSegment[]
): IFreeCanvasProject => ({
  ...project,
  nodes: project.nodes.map(node => node.id === nodeId && node.kind === 'text'
    ? { ...node, segments: update(node.segments).map(normalizeTextSegment) }
    : node)
})

const createTextSegment = (
  text: string,
  source: 'preset' | 'user',
  timestamp: number
): IFreeCanvasTextSegment => createTextSegmentWithColor(
  text,
  source,
  source === 'preset' ? DEFAULT_PRESET_COLOR : DEFAULT_USER_COLOR,
  timestamp
)

const createTextSegmentWithColor = (
  text: string,
  source: 'preset' | 'user',
  color: string,
  timestamp: number
): IFreeCanvasTextSegment => ({
  id: `segment-${timestamp}-${source}-${Math.random().toString(36).slice(2, 8)}`,
  source,
  text: String(text || ''),
  color,
  createdAt: timestamp,
  updatedAt: timestamp
})

const mergeAdjacentTextSegments = (segments: IFreeCanvasTextSegment[]): IFreeCanvasTextSegment[] =>
  segments.filter(segment => segment.text).reduce<IFreeCanvasTextSegment[]>((merged, segment) => {
    const previous = merged[merged.length - 1]
    if (previous && previous.source === segment.source && previous.color === segment.color) {
      merged[merged.length - 1] = {
        ...previous,
        text: `${previous.text}${segment.text}`,
        updatedAt: Math.max(previous.updatedAt, segment.updatedAt)
      }
      return merged
    }
    return [...merged, segment]
  }, [])

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(Math.max(Number.isFinite(value) ? value : min, min), max)

const normalizeNode = (node: Partial<IFreeCanvasNode>, timestamp: number): IFreeCanvasNode | null => {
  if (node.kind === 'image') {
    return {
      id: node.id || `free-image-${timestamp}`,
      kind: 'image',
      title: node.title || 'Image',
      position: normalizePosition(node.position),
      width: Number(node.width || 300),
      height: Number(node.height || 220),
      assetId: node.assetId || null,
      imageUrl: node.imageUrl || '',
      imagePrompt: node.imagePrompt || '',
      sourceNodeId: node.sourceNodeId || null,
      crop: node.crop || null,
      meta: node.meta || {}
    }
  }
  if (node.kind === 'arrow') {
    return {
      id: node.id || `free-arrow-${timestamp}`,
      kind: 'arrow',
      title: node.title || 'Arrow',
      position: normalizePosition(node.position),
      width: Number(node.width || 260),
      height: Number(node.height || 120),
      text: String(node.text || ''),
      color: node.color || DEFAULT_USER_COLOR,
      meta: node.meta || {}
    }
  }
  const textNode = node as Partial<IFreeCanvasTextNode>
  return {
    id: textNode.id || `free-text-${timestamp}`,
    kind: 'text',
    title: textNode.title || 'Text',
    position: normalizePosition(textNode.position),
    width: Number(textNode.width || 420),
    height: Number(textNode.height || 180),
    fontSize: textNode.fontSize || 'large',
    segments: Array.isArray(textNode.segments) ? textNode.segments.map(normalizeTextSegment) : [],
    meta: textNode.meta || {}
  }
}

const normalizeTextSegment = (segment: Partial<IFreeCanvasTextSegment>): IFreeCanvasTextSegment => {
  const source = segment.source === 'preset' ? 'preset' : 'user'
  const now = Date.now()
  return {
    id: segment.id || `segment-${now}-${source}`,
    source,
    text: String(segment.text || ''),
    color: segment.color || (source === 'preset' ? DEFAULT_PRESET_COLOR : DEFAULT_USER_COLOR),
    createdAt: Number(segment.createdAt || now),
    updatedAt: Number(segment.updatedAt || segment.createdAt || now)
  }
}

const normalizePosition = (position: Partial<IFreeCanvasPosition> | undefined): IFreeCanvasPosition => ({
  x: Number(position?.x || 0),
  y: Number(position?.y || 0)
})

const normalizeViewport = (viewport: Partial<IFreeCanvasViewport> | null | undefined): IFreeCanvasViewport | null => {
  if (!viewport) return null
  return {
    x: Number(viewport.x || 0),
    y: Number(viewport.y || 0),
    zoom: Number(viewport.zoom || 1)
  }
}

const normalizeEdge = (edge: Partial<IFreeCanvasEdge>, timestamp: number): IFreeCanvasEdge => ({
  id: edge.id || `free-edge-${edge.source || 'source'}-${edge.target || 'target'}-${timestamp}`,
  source: String(edge.source || ''),
  target: String(edge.target || ''),
  label: edge.label ? String(edge.label) : undefined,
  createdAt: Number(edge.createdAt || timestamp)
})
