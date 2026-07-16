import { describe, expect, test } from 'vitest'
import {
  getRuntimeErrorPresentation,
  validateModelAssignment,
  type ImageModelBinding,
  type ModelAssignment,
  type ModelCatalogEntry,
  type ModelConnection,
  type ModelProvider
} from './model-management'

const provider: ModelProvider = {
  id: 'provider-one', displayName: 'Provider One', defaultApiBase: 'https://provider.example'
}
const connection: ModelConnection = {
  id: 'connection-one', providerId: provider.id, displayName: 'Connection One',
  apiBase: 'https://provider.example', enabled: true, credentialConfigured: true,
  createdAt: 1, updatedAt: 1
}
const chatModel: ModelCatalogEntry = {
  id: 'chat-model',
  providerId: provider.id,
  displayName: 'Chat model',
  modality: 'chat'
}
const imageModel: ModelCatalogEntry = {
  id: 'image-model',
  providerId: provider.id,
  displayName: 'Image model',
  modality: 'image'
}
const imageBinding: ImageModelBinding = {
  connectionId: connection.id,
  modelId: imageModel.id
}

describe('model management domain', () => {
  test('represents provider-neutral catalog, connection, assignment, and image binding data', () => {
    const assignment: ModelAssignment = {
      slot: 'image.primary',
      connectionId: connection.id,
      modelId: imageModel.id
    }

    expect({ provider, connection, chatModel, imageModel, assignment, imageBinding }).toEqual({
      provider,
      connection,
      chatModel,
      imageModel,
      assignment: { slot: 'image.primary', connectionId: 'connection-one', modelId: 'image-model' },
      imageBinding: { connectionId: 'connection-one', modelId: 'image-model' }
    })
  })

  test('rejects assigning a chat model to image.primary', () => {
    const errors = validateModelAssignment({
      slot: 'image.primary',
      connectionId: connection.id,
      modelId: chatModel.id
    }, [chatModel, imageModel])

    expect(errors).toEqual([{ code: 'incompatible_model_slot' }])
  })

  test('rejects assigning an image model to chat.primary', () => {
    const errors = validateModelAssignment({
      slot: 'chat.primary',
      connectionId: connection.id,
      modelId: imageModel.id
    }, [chatModel, imageModel])

    expect(errors).toEqual([{ code: 'incompatible_model_slot' }])
  })

  test('accepts models that match their assigned slot', () => {
    expect(validateModelAssignment({
      slot: 'chat.primary',
      connectionId: connection.id,
      modelId: chatModel.id
    }, [chatModel, imageModel])).toEqual([])
    expect(validateModelAssignment({
      slot: 'image.primary',
      connectionId: connection.id,
      modelId: imageModel.id
    }, [chatModel, imageModel])).toEqual([])
  })

  test('rejects an assignment when the catalog model is missing', () => {
    expect(validateModelAssignment({
      slot: 'image.primary',
      connectionId: connection.id,
      modelId: 'missing-model'
    }, [chatModel, imageModel])).toEqual([{ code: 'model_not_found' }])
  })

  test('represents the complete provider-neutral image capability contract', () => {
    const entry: ModelCatalogEntry = {
      id: 'seedream',
      providerId: provider.id,
      displayName: 'Seedream',
      modality: 'image',
      capabilities: {
        modes: ['generate', 'edit', 'region-edit'],
        resolutions: ['1K', '2K'],
        aspectRatios: ['1:1', '16:9'],
        customSize: {
          minPixels: 921600,
          maxPixels: 4624220,
          minAspectRatio: 0.0625,
          maxAspectRatio: 16
        },
        outputFormats: ['png', 'jpeg'],
        watermark: true,
        maxReferenceImages: 10,
        mentionStrategy: 'ordered-image-labels',
        promptOptimization: {
          modes: ['standard', 'fast'],
          default: 'standard'
        },
        inputConstraints: {
          formats: ['jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'heic', 'heif'],
          maxImages: 10,
          maxBytesPerImage: 31457280,
          maxPixelsPerImage: 36000000,
          minSideExclusive: 14,
          minAspectRatio: 0.0625,
          maxAspectRatio: 16
        },
        annotationInputs: ['raster-markup'],
        regionInputs: ['point', 'bbox'],
        responseTransports: ['url', 'b64_json'],
        outputCount: 1,
        streaming: false
      }
    }

    expect(entry.capabilities).toMatchObject({
      aspectRatios: ['1:1', '16:9'],
      customSize: {
        minPixels: 921600,
        maxPixels: 4624220,
        minAspectRatio: 0.0625,
        maxAspectRatio: 16
      },
      outputFormats: ['png', 'jpeg'],
      watermark: true,
      promptOptimization: { modes: ['standard', 'fast'], default: 'standard' },
      inputConstraints: {
        formats: ['jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif', 'heic', 'heif'],
        maxImages: 10,
        maxBytesPerImage: 31457280,
        maxPixelsPerImage: 36000000,
        minSideExclusive: 14,
        minAspectRatio: 0.0625,
        maxAspectRatio: 16
      },
      annotationInputs: ['raster-markup'],
      responseTransports: ['url', 'b64_json']
    })
  })

  test('maps runtime error codes to safe Chinese recovery metadata', () => {
    expect(getRuntimeErrorPresentation('credential_missing')).toEqual({
      message: '所选模型连接尚未配置凭据。',
      action: '更新凭据'
    })
    expect(getRuntimeErrorPresentation('unknown_provider_failure')).toEqual({
      message: '图片生成失败，请稍后重试。',
      action: '稍后重试'
    })
  })
})
