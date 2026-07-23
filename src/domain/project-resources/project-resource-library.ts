import type { ProjectImageGenerationInput } from '@/domain/image-generation/project-conversation'
import type { ProjectResource, ProjectResourceFolder } from '@/storage/storage-service-client'

export const buildFolderPath = (
  folders: ProjectResourceFolder[],
  folderId: string | null
): string => {
  const byId = new Map(folders.map(folder => [folder.id, folder]))
  const path: string[] = []
  const seen = new Set<string>()
  let cursor = folderId
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const folder = byId.get(cursor)
    if (!folder) break
    path.unshift(folder.name)
    cursor = folder.parentId
  }
  return path.join(' / ')
}

export const canMoveFolder = (
  folders: ProjectResourceFolder[],
  folderId: string,
  parentId: string | null
): boolean => {
  if (parentId === folderId) return false
  const byId = new Map(folders.map(folder => [folder.id, folder]))
  const seen = new Set<string>()
  let cursor = parentId
  while (cursor && !seen.has(cursor)) {
    if (cursor === folderId) return false
    seen.add(cursor)
    cursor = byId.get(cursor)?.parentId || null
  }
  return true
}

export const moveProjectResource = (
  resource: ProjectResource,
  folderId: string | null,
  sortOrder: number
): ProjectResource => ({
  ...resource,
  folderId: resource.kind === 'subject' ? null : folderId,
  sortOrder,
  revision: resource.revision + 1,
  updatedAt: Date.now()
})

export const appendSubjectReference = (
  inputs: ProjectImageGenerationInput[],
  subject: ProjectResource,
  maxReferenceImages: number
): {
  inputs: ProjectImageGenerationInput[]
  reason: 'duplicate' | 'limit' | null
} => {
  if (inputs.some(input => input.assetId === subject.providerAssetId)) {
    return { inputs, reason: 'duplicate' }
  }
  if (inputs.length >= maxReferenceImages) {
    return { inputs, reason: 'limit' }
  }
  return {
    inputs: [
      ...inputs,
      {
        referenceId: `project-resource-${subject.id}`,
        assetId: subject.providerAssetId,
        sourceAssetId: subject.sourceAssetId,
        label: subject.name,
        role: 'reference-image',
        order: inputs.length
      }
    ],
    reason: null
  }
}
