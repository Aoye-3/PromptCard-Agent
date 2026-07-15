export type ModelModality = 'chat' | 'image'
export type ModelSlot = 'chat.primary' | 'image.primary'
export type ImageModelMode = 'generate' | 'edit' | 'region-edit'
export type ImageOutputFormat = 'png' | 'jpeg'
export type ImageRegionInput = 'point' | 'bbox'

export interface ModelProvider {
  id: string
  displayName: string
  defaultApiBase: string
}

export interface ModelCapabilities {
  modes?: string[]
  resolutions?: string[]
  aspectRatios?: string[]
  customSize?: {
    minPixels: number
    maxPixels: number
    minAspectRatio: number
    maxAspectRatio: number
  } | null
  outputFormats?: string[]
  watermark?: boolean
  maxReferenceImages?: number
  mentionStrategy?: string
  regionInputs?: string[]
  outputCount?: number
  streaming?: boolean
}

export interface ModelCatalogEntry {
  id: string
  providerId: string
  modality: ModelModality
  displayName: string
  capabilities?: ModelCapabilities
}

export interface ModelCatalog {
  providers: ModelProvider[]
  models: ModelCatalogEntry[]
}

export interface ModelConnectionTestState {
  ok: boolean
  checkedAt: number
  message: string
}

export interface ModelConnection {
  id: string
  providerId: string
  displayName: string
  apiBase: string
  enabled: boolean
  credentialConfigured: boolean
  credentialMask?: string | null
  createdAt: number
  updatedAt: number
  lastTest?: ModelConnectionTestState
}

export interface ModelAssignment {
  slot: ModelSlot
  connectionId: string
  modelId: string
}

export interface ImageModelBinding {
  connectionId: string
  modelId: string
}

export interface ModelConnectionInput {
  providerId: string
  displayName: string
  apiBase: string
  enabled: boolean
  credential?: string
  clearCredential?: boolean
}

export interface ModelAssignmentInput {
  connectionId: string
  modelId: string
}

export interface ModelConnectionTestResult {
  success: boolean
  message: string
}

export type ImageGenerationProviderStatus = 'ready' | 'missing' | 'incompatible' | 'check_failed'

export interface ImageGenerationSdkError {
  code: string
  message: string
}

export interface ImageGenerationProviderDiagnostic {
  providerId: string
  status: ImageGenerationProviderStatus
  sdk: {
    packageName: string
    installedVersion: string | null
    requiredVersion: string
    compatible: boolean
    error: ImageGenerationSdkError | null
  }
}

export interface ImageGenerationStatus {
  serverEnabled: boolean
  checkedAt: number
  credentialStore: { available: boolean }
  providers: ImageGenerationProviderDiagnostic[]
}

export interface ModelConnectionDependencies {
  assignments: ModelSlot[]
  canvasNodeCount: number | null
  canvasNodeCountAvailable: boolean
}

export interface RuntimeErrorPresentation {
  message: string
  action: string
}

const DEFAULT_RUNTIME_ERROR: RuntimeErrorPresentation = {
  message: '图片生成失败，请稍后重试。',
  action: '稍后重试'
}

const RUNTIME_ERROR_PRESENTATIONS: Record<string, RuntimeErrorPresentation> = {
  credential_missing: { message: '所选模型连接尚未配置凭据。', action: '更新凭据' },
  credential_store_unavailable: { message: '系统凭据库当前不可用。', action: '查看服务状态' },
  connection_disabled: { message: '所选模型连接已停用。', action: '前往连接' },
  connection_not_tested: { message: '所选模型连接尚未测试成功。', action: '前往连接' },
  connection_test_failed: { message: '所选模型连接的最近一次测试失败。', action: '前往连接' },
  assignment_missing: { message: '尚未配置默认图片模型。', action: '前往配置' },
  runtime_disabled: { message: '图片生成服务尚未启用。', action: '查看服务状态' },
  ark_sdk_missing: { message: 'Ark SDK 尚未安装或无法导入。', action: '重新检测' },
  ark_sdk_incompatible: { message: 'Ark SDK 版本不兼容。', action: '重新检测' },
  ark_sdk_check_failed: { message: '无法检测 Ark SDK。', action: '重新检测' },
  invalid_size: { message: '所选图片尺寸不受支持。', action: '修改参数' },
  invalid_input: { message: '图片生成输入无效。', action: '修改参数' },
  invalid_runtime_response: { message: '图片生成服务返回了无效结果。', action: '稍后重试' },
  generation_busy: { message: '当前模型连接正在处理其他请求。', action: '稍后重试' },
  rate_limited: { message: '图片服务请求过于频繁，请稍后重试。', action: '稍后重试' },
  timeout: { message: '图片生成超时。', action: '稍后重试' },
  service_unavailable: { message: '图片生成服务暂时不可用。', action: '稍后重试' },
  storage_write_failed: { message: '生成结果无法写入本地存储。', action: '检查本地存储' },
  generation_failed: DEFAULT_RUNTIME_ERROR
}

export const getRuntimeErrorPresentation = (code: string): RuntimeErrorPresentation => (
  RUNTIME_ERROR_PRESENTATIONS[code] || DEFAULT_RUNTIME_ERROR
)

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
