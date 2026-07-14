import { afterEach, describe, expect, it, vi } from 'vitest'
import { createModelManagementClient } from './model-management-client'

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
        updatedAt: 2
      }]
    }))
    const client = createModelManagementClient(fetchMock as unknown as typeof fetch)

    const [connection] = await client.listConnections()

    expect(connection).toMatchObject({
      id: 'connection-1',
      credentialConfigured: true,
      credentialMask: '••••••••'
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
})
