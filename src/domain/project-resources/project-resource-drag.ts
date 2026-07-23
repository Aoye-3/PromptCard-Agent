export const PROJECT_MATERIAL_DRAG_MIME = 'application/x-promptcard-project-material'

export interface ProjectMaterialDragPayload {
  projectId: string
  id: string
  name: string
  sourceAssetId: string
  previewAssetId: string
  width: number
  height: number
}

export const isProjectMaterialDrag = (dataTransfer: DataTransfer): boolean =>
  Array.from(dataTransfer.types).includes(PROJECT_MATERIAL_DRAG_MIME)

export const readProjectMaterialDrag = (dataTransfer: DataTransfer): ProjectMaterialDragPayload | null => {
  if (!isProjectMaterialDrag(dataTransfer)) return null
  try {
    const candidate = JSON.parse(dataTransfer.getData(PROJECT_MATERIAL_DRAG_MIME)) as Partial<ProjectMaterialDragPayload>
    if (
      typeof candidate.projectId !== 'string'
      || typeof candidate.id !== 'string'
      || typeof candidate.name !== 'string'
      || typeof candidate.sourceAssetId !== 'string'
      || typeof candidate.previewAssetId !== 'string'
      || typeof candidate.width !== 'number'
      || typeof candidate.height !== 'number'
      || !Number.isFinite(candidate.width)
      || !Number.isFinite(candidate.height)
      || candidate.width <= 0
      || candidate.height <= 0
    ) {
      return null
    }
    return candidate as ProjectMaterialDragPayload
  } catch {
    return null
  }
}
