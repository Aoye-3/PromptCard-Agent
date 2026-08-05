import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentRuntimeService } from './agent-runtime-service'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('agentRuntimeService conversation model binding', () => {
  it('updates a project conversation through the Gateway validation boundary', async () => {
    const response = {
      id: 'conversation/1',
      projectId: 'project/1',
      modelBinding: {
        connectionId: 'connection-1',
        providerId: 'volcengine-ark',
        modelId: 'doubao-seed-2-0-lite-260215'
      }
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(agentRuntimeService.updateConversationModel('project/1', 'conversation/1', response.modelBinding))
      .resolves.toEqual(response)
    expect(fetchMock).toHaveBeenCalledWith(
      '/agent-api/promptcard/runtime/projects/project%2F1/conversations/conversation%2F1/model',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ modelBinding: response.modelBinding })
      })
    )
  })
})
