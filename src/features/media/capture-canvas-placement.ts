import type { FreeCanvasMediaNode } from '@/domain/free-canvas/free-canvas'
import { createFreeCanvasImageNodeFromMedia } from '@/domain/free-canvas/free-canvas-project'
import { validateImageGeneratorConnection, type ImageGeneratorConnectionValidationErrorCode } from '@/domain/free-canvas/image-generator-connections'
import type { IFreeCanvasProject } from '@/models/PromptHistory.model'
import type { RecentCaptureItem } from '@/storage/storage-service-client'
import { storage } from '@/utils/storage'

export const createCaptureCanvasMediaNode = (
  capture: RecentCaptureItem,
  timestamp = Date.now(),
  assetUrl: (assetId: string) => string = storage.assets.url
): FreeCanvasMediaNode => {
  const size = fitCaptureForCanvas(capture.width, capture.height)
  return {
    id: `capture-media-${capture.id}-${timestamp}`,
    kind: 'imageAsset',
    title: capture.title,
    position: { x: 120, y: 120 },
    width: size.width,
    height: size.height,
    assetId: capture.assetId,
    imageUrl: assetUrl(capture.assetId),
    meta: {
      recentCaptureId: capture.id,
      originalWidth: capture.width,
      originalHeight: capture.height
    }
  }
}

export const createCaptureCanvasUpdates = (
  capture: RecentCaptureItem,
  projectId: string,
  nodeId: string
): Partial<RecentCaptureItem> => ({
  status: capture.registeredPromptId ? 'registeredToPromptLibrary' : 'placedOnCanvas',
  linkedProjectId: projectId,
  linkedCanvasNodeId: nodeId
})

export type GeneratedResultCanvasPlacement = {
  node: FreeCanvasMediaNode
  connection: null | {
    source: string
    target: string
    sourceHandle: 'image-output'
    targetHandle: 'reference-image'
  }
}

export const createGeneratedResultCanvasPlacement = (
  capture: RecentCaptureItem,
  placement: { kind: 'image' } | { kind: 'reference'; targetNodeId: string },
  timestamp = Date.now(),
  assetUrl: (assetId: string) => string = storage.assets.url
): GeneratedResultCanvasPlacement => {
  if (capture.purpose !== 'generatedResult') {
    throw new Error('Only generated results can use generated-result placement')
  }
  const node = createCaptureCanvasMediaNode(capture, timestamp, assetUrl)
  return {
    node,
    connection: placement.kind === 'reference'
      ? {
          source: node.id,
          target: placement.targetNodeId,
          sourceHandle: 'image-output',
          targetHandle: 'reference-image'
        }
      : null
  }
}

export const applyGeneratedResultCanvasPlacement = (
  project: IFreeCanvasProject,
  capture: RecentCaptureItem,
  placement: { kind: 'image' } | { kind: 'reference'; targetNodeId: string },
  timestamp = Date.now()
): { project: IFreeCanvasProject; nodeId: string | null; error: ImageGeneratorConnectionValidationErrorCode | null } => {
  const generated = createGeneratedResultCanvasPlacement(capture, placement, timestamp)
  const imageNode = createFreeCanvasImageNodeFromMedia(generated.node, timestamp)
  if (!generated.connection) {
    return {
      nodeId: imageNode.id,
      error: null,
      project: { ...project, nodes: [...project.nodes, imageNode], selectedNodeId: imageNode.id }
    }
  }

  const candidateProject = { ...project, nodes: [...project.nodes, imageNode] }
  const validationError = validateImageGeneratorConnection(candidateProject, {
    source: imageNode.id,
    target: generated.connection.target,
    targetHandle: 'reference-image'
  })[0]
  if (validationError) return { project, nodeId: null, error: validationError.code }

  const inputOrder = project.edges.filter(edge => (
    edge.target === generated.connection!.target && edge.targetHandle === 'reference-image'
  )).length
  const edgeId = `free-edge-${imageNode.id}-${generated.connection.target}-reference-image-${timestamp}`
  return {
    nodeId: imageNode.id,
    error: null,
    project: {
      ...project,
      nodes: [...project.nodes, imageNode],
      edges: [...project.edges, {
        id: edgeId,
        source: imageNode.id,
        target: generated.connection.target,
        sourceHandle: 'image-output',
        targetHandle: 'reference-image',
        inputOrder,
        referenceId: `reference-${edgeId}`,
        createdAt: timestamp
      }],
      selectedNodeId: generated.connection.target
    }
  }
}

const fitCaptureForCanvas = (width: number, height: number): { width: number; height: number } => {
  const maximum = 360
  const safeWidth = Math.max(1, width || maximum)
  const safeHeight = Math.max(1, height || 220)
  const scale = maximum / Math.max(safeWidth, safeHeight)
  return { width: safeWidth * scale, height: safeHeight * scale }
}
