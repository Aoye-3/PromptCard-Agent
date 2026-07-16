import type { PromptDocument } from '@/models/PromptHistory.model'

export type ComposerImageInputRole = 'source-image' | 'reference-image'

export interface ComposerImageInput {
  referenceId: string
  assetId: string
  sourceAssetId?: string
  label: string
  imageUrl: string
  role: ComposerImageInputRole
  order: number
}

export interface ComposerImageInputValidationError {
  code: 'too_many_images'
  limit: number
}

export const DEFAULT_IMAGE_GENERATION_PREFERENCES = {
  resolution: '2K',
  promptOptimization: 'standard' as const,
  outputFormat: 'png' as const,
  watermark: false
}

export const switchComposerImageInputRole = (
  inputs: readonly ComposerImageInput[],
  referenceId: string,
  role: ComposerImageInputRole
): ComposerImageInput[] => normalizeOrders(inputs.map(input => {
  if (input.referenceId === referenceId) return { ...input, role }
  if (role === 'source-image' && input.role === 'source-image') {
    return { ...input, role: 'reference-image' }
  }
  return { ...input }
}))

export const moveComposerImageInput = (
  inputs: readonly ComposerImageInput[],
  referenceId: string,
  direction: -1 | 1
): ComposerImageInput[] => {
  const ordered = [...inputs].sort((left, right) => left.order - right.order).map(input => ({ ...input }))
  const index = ordered.findIndex(input => input.referenceId === referenceId)
  const destination = index + direction
  if (index < 0 || destination < 0 || destination >= ordered.length) return normalizeOrders(ordered)
  const [input] = ordered.splice(index, 1)
  ordered.splice(destination, 0, input)
  return normalizeOrders(ordered)
}

export const removeComposerImageInput = (
  inputs: readonly ComposerImageInput[],
  referenceId: string
): ComposerImageInput[] => normalizeOrders(inputs.filter(input => input.referenceId !== referenceId))

export const unresolvedPromptReferenceIds = (
  document: PromptDocument,
  inputs: ReadonlyArray<Pick<ComposerImageInput, 'referenceId'>>
): string[] => {
  const available = new Set(inputs.map(input => input.referenceId))
  return Array.from(new Set(document.segments.flatMap(segment => (
    segment.type === 'reference' && !available.has(segment.referenceId)
      ? [segment.referenceId]
      : []
  ))))
}

export const validateComposerImageInputs = (
  inputs: readonly ComposerImageInput[],
  limit = 10
): ComposerImageInputValidationError[] => (
  inputs.length > limit ? [{ code: 'too_many_images', limit }] : []
)

export type ComposerCustomSizeValidationError =
  | 'custom_size_required'
  | 'custom_size_pixel_budget'
  | 'custom_size_aspect_ratio'

export const validateComposerCustomSize = (
  width: number | undefined,
  height: number | undefined
): ComposerCustomSizeValidationError[] => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || Number(width) <= 0 || Number(height) <= 0) {
    return ['custom_size_required']
  }
  const pixels = Number(width) * Number(height)
  if (pixels < 921_600 || pixels > 4_624_220) return ['custom_size_pixel_budget']
  const ratio = Number(width) / Number(height)
  return ratio < 1 / 16 || ratio > 16 ? ['custom_size_aspect_ratio'] : []
}

const normalizeOrders = (inputs: readonly ComposerImageInput[]): ComposerImageInput[] => (
  inputs.map((input, order) => ({ ...input, order }))
)
