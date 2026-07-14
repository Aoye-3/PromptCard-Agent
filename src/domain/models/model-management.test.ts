import { describe, expect, test } from 'vitest'
import {
  validateModelAssignment,
  type ImageModelBinding,
  type ModelAssignment,
  type ModelCatalogEntry,
  type ModelConnection,
  type ModelProvider
} from './model-management'

const provider: ModelProvider = { id: 'provider-one' }
const connection: ModelConnection = { id: 'connection-one', providerId: provider.id }
const chatModel: ModelCatalogEntry = {
  id: 'chat-model',
  providerId: provider.id,
  modality: 'chat'
}
const imageModel: ModelCatalogEntry = {
  id: 'image-model',
  providerId: provider.id,
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
      provider: { id: 'provider-one' },
      connection: { id: 'connection-one', providerId: 'provider-one' },
      chatModel: { id: 'chat-model', providerId: 'provider-one', modality: 'chat' },
      imageModel: { id: 'image-model', providerId: 'provider-one', modality: 'image' },
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
})
