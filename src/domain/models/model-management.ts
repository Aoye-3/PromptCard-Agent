export type ModelModality = 'chat' | 'image'

export interface ModelProvider {
  id: string
}

export interface ModelCatalogEntry {
  id: string
  providerId: string
  modality: ModelModality
}

export interface ModelConnection {
  id: string
  providerId: string
}

export type ModelSlot = 'chat.primary' | 'image.primary'

export interface ModelAssignment {
  slot: ModelSlot
  connectionId: string
  modelId: string
}

export interface ImageModelBinding {
  connectionId: string
  modelId: string
}

export type ModelAssignmentValidationErrorCode =
  | 'model_not_found'
  | 'incompatible_model_slot'

export interface ModelAssignmentValidationError {
  code: ModelAssignmentValidationErrorCode
}

const SLOT_MODALITY: Record<ModelSlot, ModelModality> = {
  'chat.primary': 'chat',
  'image.primary': 'image'
}

export const validateModelAssignment = (
  assignment: ModelAssignment,
  catalog: readonly ModelCatalogEntry[]
): ModelAssignmentValidationError[] => {
  const model = catalog.find(candidate => candidate.id === assignment.modelId)
  if (!model) return [{ code: 'model_not_found' }]
  return model.modality === SLOT_MODALITY[assignment.slot]
    ? []
    : [{ code: 'incompatible_model_slot' }]
}
