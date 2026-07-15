import { afterEach, describe, expect, it, vi } from 'vitest'
import imageGenerationStatusFixture from '../../tests/fixtures/image-generation-status.json'
import {
  ModelManagementClientError,
  createModelManagementClient
} from './model-management-client'

const jsonResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 204 ? 'No Content' : 'OK',
  json: async () => payload,
  text: async () => JSON.stringify(payload)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('model management client', () => {
  it('returns only the safe connection response fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      connections: [{
        id: 'connection-1',
        providerId: 'deepseek',
        displayName: 'Primary chat',
        apiBase: 'https://api.deepseek.com',
        enabled: true,
        credentialConfigured: true,
        credentialMask: '••••••••',
        apiKey: 'must-never-reach-the-browser',
        createdAt: 1,
        updatedAt: 2,
        lastTest: { ok: false, checkedAt: 3, message: 'Connection failed.' }
      }]
    }))
    const client = createModelManagementClient(fetchMock as unknown as typeof fetch)

    const [connection] = await client.listConnections()

    expect(connection).toMatchObject({
      id: 'connection-1',
      credentialConfigured: true,
      credentialMask: '••••••••',
      lastTest: { ok: false, checkedAt: 3, message: 'Connection failed.' }
    })
    expect(connection).not.toHaveProperty('apiKey')
  })

  it('omits an unfilled credential when updating a connection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 'connection-1',
      providerId: 'deepseek',
      displayName: 'Renamed chat',
      apiBase: 'https://api.deepseek.com',
      enabled: true,
      credentialConfigured: true,
      credentialMask: '••••••••',
      createdAt: 1,
      updatedAt: 2
    }))
    const client = createModelManagementClient(fetchMock as unknown as typeof fetch)

    await client.updateConnection('connection-1', {
      providerId: 'deepseek',
      displayName: 'Renamed chat',
      apiBase: 'https://api.deepseek.com',
      enabled: true,
      credential: ''
    })

    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body))).toEqual({
      providerId: 'deepseek',
      displayName: 'Renamed chat',
      apiBase: 'https://api.deepseek.com',
      enabled: true
    })
  })

  it('sends an empty credential only for an explicit credential removal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: 'connection-1',
      providerId: 'deepseek',
      displayName: 'Primary chat',
      apiBase: 'https://api.deepseek.com',
      enabled: true,
      credentialConfigured: false,
      credentialMask: null,
      createdAt: 1,
      updatedAt: 2
    }))
    const client = createModelManagementClient(fetchMock as unknown as typeof fetch)

    await client.updateConnection('connection-1', {
      providerId: 'deepseek',
      displayName: 'Primary chat',
      apiBase: 'https://api.deepseek.com',
      enabled: true,
      clearCredential: true
    })

    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(String(request.body))).toMatchObject({ credential: '' })
  })

  it('loads catalog and assignments from their separate endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ providers: [], models: [] }))
      .mockResolvedValueOnce(jsonResponse({ assignments: [] }))
    const client = createModelManagementClient(fetchMock as unknown as typeof fetch)

    await client.getCatalog()
    await client.listAssignments()

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/agent-api/promptcard/runtime/model-catalog',
      expect.objectContaining({ credentials: 'include' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/agent-api/promptcard/runtime/model-assignments',
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('uses the generic connection and assignment routes for mutations', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        id: 'connection-1', providerId: 'deepseek', displayName: 'Chat',
        apiBase: 'https://api.deepseek.com', enabled: true,
        credentialConfigured: true, credentialMask: '••••••••', createdAt: 1, updatedAt: 1
      }, 201))
      .mockResolvedValueOnce(jsonResponse({ success: true, message: 'Connection ok.' }))
      .mockResolvedValueOnce(jsonResponse({
        slot: 'chat.primary', connectionId: 'connection-1', modelId: 'deepseek-chat'
      }))
      .mockResolvedValueOnce(jsonResponse(undefined, 204))
    const client = createModelManagementClient(fetchMock as unknown as typeof fetch)

    await client.createConnection({
      providerId: 'deepseek', displayName: 'Chat', apiBase: 'https://api.deepseek.com',
      enabled: true, credential: 'sk-secret'
    })
    await client.testConnection('connection-1')
    await client.updateAssignment('chat.primary', {
      connectionId: 'connection-1', modelId: 'deepseek-chat'
    })
    await client.deleteConnection('connection-1')

    expect(fetchMock.mock.calls.map(call => [call[0], (call[1] as RequestInit).method])).toEqual([
      ['/agent-api/promptcard/runtime/model-connections', 'POST'],
      ['/agent-api/promptcard/runtime/model-connections/connection-1/test', 'POST'],
      ['/agent-api/promptcard/runtime/model-assignments/chat.primary', 'PUT'],
      ['/agent-api/promptcard/runtime/model-connections/connection-1', 'DELETE']
    ])
  })

  it('loads and safely normalizes image generation runtime diagnostics', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(imageGenerationStatusFixture))
    const client = createModelManagementClient(fetchMock as unknown as typeof fetch)

    await expect(client.getImageGenerationStatus()).resolves.toEqual({
      serverEnabled: true,
      checkedAt: 1752572345678,
      credentialStore: { available: true },
      providers: [{
        providerId: 'volcengine-ark',
        status: 'ready',
        sdk: {
          packageName: 'volcengine-python-sdk',
          installedVersion: '5.0.36',
          requiredVersion: '5.0.36',
          compatible: true,
          error: null
        }
      }]
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/agent-api/promptcard/runtime/image-generation-status',
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('clears an assignment and loads connection dependencies', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(undefined, 204))
      .mockResolvedValueOnce(jsonResponse({
        assignments: ['image.primary'],
        canvasNodeCount: null,
        canvasNodeCountAvailable: false,
        nodes: ['must-not-leak']
      }))
    const client = createModelManagementClient(fetchMock as unknown as typeof fetch)

    await client.clearAssignment('image.primary')
    await expect(client.getConnectionDependencies('connection/one')).resolves.toEqual({
      assignments: ['image.primary'],
      canvasNodeCount: null,
      canvasNodeCountAvailable: false
    })

    expect(fetchMock.mock.calls.map(call => [call[0], (call[1] as RequestInit).method])).toEqual([
      ['/agent-api/promptcard/runtime/model-assignments/image.primary', 'DELETE'],
      ['/agent-api/promptcard/runtime/model-connections/connection%2Fone/dependencies', undefined]
    ])
  })

  it('parses structured runtime errors without retaining unsafe backend text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      detail: {
        code: 'credential_missing',
        message: 'sk-secret at C:/runtime/provider.py',
        action: 'run dangerous command',
        retryable: false,
        field: 'credential',
        traceback: 'must-not-leak'
      }
    }, 400))
    const client = createModelManagementClient(fetchMock as unknown as typeof fetch)

    const failure = await client.updateAssignment('image.primary', {
      connectionId: 'connection-1', modelId: 'seedream'
    }).catch(error => error)

    expect(failure).toEqual(expect.objectContaining({
      name: 'ModelManagementClientError',
      code: 'credential_missing',
      message: '所选模型连接尚未配置凭据。',
      action: '更新凭据',
      retryable: false,
      field: 'credential'
    }))
    expect(failure).toBeInstanceOf(ModelManagementClientError)
    expect(JSON.stringify(failure)).not.toContain('sk-secret')
    expect(JSON.stringify(failure)).not.toContain('provider.py')
    expect(JSON.stringify(failure)).not.toContain('dangerous command')
  })
})
