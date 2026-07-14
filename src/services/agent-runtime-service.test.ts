import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentRuntimeService, parseAgentWorkspaceProposals, parsePromptLibraryProposals } from './agent-runtime-service'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('agent runtime proposal parsing', () => {
  it('parses workspace proposal envelopes', () => {
    const text = `Agent response
\`\`\`json
{
  "kind": "agent_workspace_proposals",
  "proposals": [
    {
      "kind": "workspace_card_update",
      "id": "proposal-card",
      "contextId": "card:project:0",
      "agentName": "DeepSeek Agent",
      "updates": [{ "cardId": "card-1", "content": "Updated content" }],
      "rationale": "Improve clarity",
      "status": "pending",
      "createdAt": 1
    },
    {
      "kind": "storyboard_update",
      "id": "proposal-story",
      "contextId": "storyboard:project:sequence:row",
      "agentName": "DeepSeek Agent",
      "sequenceId": "sequence-1",
      "rowId": "row-1",
      "rowUpdates": { "action": "Runs" },
      "rationale": "Add motion",
      "status": "pending",
      "createdAt": 2
    }
  ]
}
\`\`\``

    const proposals = parseAgentWorkspaceProposals(text)
    expect(proposals).toHaveLength(2)
    expect(proposals[0].kind).toBe('workspace_card_update')
    expect(proposals[1].kind).toBe('storyboard_update')
  })

  it('keeps legacy prompt library proposal parsing compatible', () => {
    const text = `\`\`\`json
{
  "kind": "prompt_library_write_proposal",
  "proposal": {
    "id": "proposal-preset",
    "agentName": "DeepSeek Agent",
    "operation": "create",
    "targetPresetId": null,
    "presetDraft": {
      "type": "style",
      "category": "agent",
      "label": "Noir",
      "content": "high contrast noir lighting",
      "meta": { "source": "agent-runtime" }
    },
    "rationale": "Useful style preset",
    "status": "pending",
    "createdAt": 3
  }
}
\`\`\``

    const proposals = parsePromptLibraryProposals(text)
    expect(proposals).toHaveLength(1)
    expect(proposals[0].presetDraft.label).toBe('Noir')
    expect(proposals[0].kind).toBe('prompt_library_write_proposal')
  })

  it('ignores invalid proposal JSON safely', () => {
    expect(parseAgentWorkspaceProposals('```json\n{ broken }\n```')).toEqual([])
    expect(parseAgentWorkspaceProposals('plain text only')).toEqual([])
  })

  it('filters Prompt Library writes out of workspace chatbot proposals', () => {
    const text = `\`\`\`json
{
  "kind": "agent_workspace_proposals",
  "proposals": [
    {
      "kind": "workspace_card_create",
      "id": "proposal-card",
      "agentName": "DeepSeek Agent",
      "cardDraft": {
        "type": "subject",
        "title": "Subject",
        "content": "A clearer subject card"
      },
      "rationale": "Build the current workspace",
      "status": "pending",
      "createdAt": 1
    },
    {
      "kind": "prompt_library_write_proposal",
      "id": "proposal-library",
      "agentName": "DeepSeek Agent",
      "operation": "create",
      "targetPresetId": null,
      "presetDraft": {
        "type": "style",
        "category": "agent",
        "label": "Library-only",
        "content": "Should only be handled inside Prompt Library"
      },
      "rationale": "Library write",
      "status": "pending",
      "createdAt": 2
    }
  ]
}
\`\`\``

    const proposals = parseAgentWorkspaceProposals(text, {
      permissionScope: 'workspace-chatbot-agent'
    })

    expect(proposals).toHaveLength(1)
    expect(proposals[0].kind).toBe('workspace_card_create')
  })

  it('parses free-canvas text updates in workspace chatbot scope', () => {
    const text = `\`\`\`json
{
  "kind": "agent_workspace_proposals",
  "proposals": [
    {
      "kind": "free_canvas_text_update",
      "id": "proposal-free-text",
      "contextId": "free-canvas:project-free:text-1",
      "agentName": "DeepSeek Agent",
      "nodeId": "text-1",
      "mode": "replace",
      "userText": "Agent rewritten user text",
      "rationale": "Only user-authored text is editable",
      "status": "pending",
      "createdAt": 3
    }
  ]
}
\`\`\``

    const proposals = parseAgentWorkspaceProposals(text, {
      permissionScope: 'workspace-chatbot-agent'
    })

    expect(proposals).toEqual([
      expect.objectContaining({
        kind: 'free_canvas_text_update',
        nodeId: 'text-1',
        mode: 'replace',
        userText: 'Agent rewritten user text'
      })
    ])
  })

  it('keeps Prompt Library writes available in Prompt Library agent scope', () => {
    const text = `\`\`\`json
{
  "kind": "prompt_library_write_proposal",
  "proposal": {
    "id": "proposal-library",
    "agentName": "DeepSeek Agent",
    "operation": "create",
    "targetPresetId": null,
    "presetDraft": {
      "type": "style",
      "category": "agent",
      "label": "Library-only",
      "content": "Prompt Library owns this write"
    },
    "rationale": "Library write",
    "status": "pending",
    "createdAt": 2
  }
}
\`\`\``

    const proposals = parseAgentWorkspaceProposals(text, {
      permissionScope: 'prompt-library-agent'
    })

    expect(proposals).toHaveLength(1)
    expect(proposals[0].kind).toBe('prompt_library_write_proposal')
  })

  it('rejects update and archive Prompt Library proposals in Prompt Library agent scope', () => {
    const text = `\`\`\`json
{
  "kind": "agent_workspace_proposals",
  "proposals": [
    {
      "kind": "prompt_library_write_proposal",
      "id": "proposal-create",
      "agentName": "DeepSeek Agent",
      "operation": "create",
      "targetPresetId": null,
      "presetDraft": {
        "type": "style",
        "category": "agent",
        "label": "Create only",
        "content": "Allowed new preset"
      },
      "rationale": "Additive",
      "status": "pending",
      "createdAt": 1
    },
    {
      "kind": "prompt_library_write_proposal",
      "id": "proposal-update",
      "agentName": "DeepSeek Agent",
      "operation": "update",
      "targetPresetId": "preset-1",
      "presetDraft": {
        "type": "style",
        "category": "agent",
        "label": "Update",
        "content": "Should be rejected"
      },
      "rationale": "Not allowed",
      "status": "pending",
      "createdAt": 2
    },
    {
      "kind": "prompt_library_write_proposal",
      "id": "proposal-archive",
      "agentName": "DeepSeek Agent",
      "operation": "archive",
      "targetPresetId": "preset-2",
      "presetDraft": {
        "type": "style",
        "category": "agent",
        "label": "Archive",
        "content": "Should be rejected"
      },
      "rationale": "Not allowed",
      "status": "pending",
      "createdAt": 3
    }
  ]
}
\`\`\``

    const proposals = parseAgentWorkspaceProposals(text, {
      permissionScope: 'prompt-library-agent'
    })

    expect(proposals.map(proposal => proposal.id)).toEqual(['proposal-create'])
  })

  it('sends PromptCard runtime messages through the boundary endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        threadId: 'thread-1',
        text: 'agent response',
        proposals: [],
        diagnostics: { runtime: 'ok' }
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await agentRuntimeService.sendMessage({
      threadId: 'thread-1',
      content: '补全选中卡片',
      mode: 'card-workspace',
      sessionKey: 'workspace:card:project-1',
      projectId: 'project-1',
      workspaceContext: {
        contextId: 'card:project-1:0',
        mode: 'card-workspace',
        projectId: 'project-1',
        projectTitle: 'Project',
        snapshot: { selectedCardIds: ['card-1'] }
      }
    })

    expect(response.threadId).toBe('thread-1')
    expect(fetchMock).toHaveBeenCalledWith(
      '/agent-api/promptcard/runtime/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-1',
          content: '补全选中卡片',
          mode: 'card-workspace',
          sessionKey: 'workspace:card:project-1',
          projectId: 'project-1',
          workspaceContext: {
            contextId: 'card:project-1:0',
            mode: 'card-workspace',
            projectId: 'project-1',
            projectTitle: 'Project',
            snapshot: { selectedCardIds: ['card-1'] }
          }
        })
      })
    )
  })

  it('parses three-stage field update proposals', () => {
    const text = `\`\`\`json
{
  "kind": "agent_workspace_proposals",
  "proposals": [
    {
      "kind": "three_stage_field_update",
      "id": "proposal-three-stage",
      "contextId": "three-stage:project:characterBoard:characterCore",
      "agentName": "DeepSeek Agent",
      "stageKey": "characterBoard",
      "fieldId": "characterCore",
      "mode": "replace",
      "content": "Sharper character core",
      "rationale": "Improve specificity",
      "status": "pending",
      "createdAt": 4
    }
  ]
}
\`\`\``

    const proposals = parseAgentWorkspaceProposals(text, {
      permissionScope: 'workspace-chatbot-agent'
    })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({
      kind: 'three_stage_field_update',
      stageKey: 'characterBoard',
      fieldId: 'characterCore',
      mode: 'replace',
      content: 'Sharper character core'
    })
  })

  it('persists legacy runtime options and returns them on a fresh read', async () => {
    let persisted = {
      enabled: true,
      apiBase: 'https://api.deepseek.com',
      apiKeyConfigured: true,
      apiKeyPreview: '••••••••',
      modelName: 'deepseek-chat',
      temperature: 0.3,
      maxTokens: 4096,
      availableModels: ['deepseek-chat']
    }
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (!url.endsWith('/model-config')) throw new Error(`Unexpected request: ${url}`)
      if (init?.method === 'PUT') {
        persisted = { ...persisted, ...JSON.parse(String(init.body)) }
      }
      return { ok: true, status: 200, json: async () => persisted }
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(agentRuntimeService.saveModelConfig({ temperature: 0.65, maxTokens: 8192 })).resolves.toMatchObject({
      temperature: 0.65,
      maxTokens: 8192
    })
    await expect(agentRuntimeService.getModelConfig()).resolves.toMatchObject({
      temperature: 0.65,
      maxTokens: 8192
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/agent-api/promptcard/runtime/model-config',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ temperature: 0.65, maxTokens: 8192 })
      })
    )
  })

  it('tests unsaved legacy candidates without persisting them', async () => {
    const persisted = {
      enabled: true,
      apiBase: 'https://api.deepseek.com',
      apiKeyConfigured: true,
      modelName: 'deepseek-chat',
      temperature: 0.3,
      maxTokens: 4096,
      availableModels: ['deepseek-chat']
    }
    const candidate = {
      apiKey: 'sk-unsaved',
      apiBase: 'https://candidate.deepseek.com',
      modelName: 'deepseek-reasoner',
      temperature: 0.55,
      maxTokens: 6144
    }
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/model-config/test') && init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ success: true, message: 'Connection ok.' }) }
      }
      if (url.endsWith('/model-config') && !init?.method) {
        return { ok: true, status: 200, json: async () => persisted }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(agentRuntimeService.testModelConfig(candidate)).resolves.toEqual({
      success: true,
      message: 'Connection ok.'
    })
    await expect(agentRuntimeService.getModelConfig()).resolves.toMatchObject(persisted)

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/agent-api/promptcard/runtime/model-config/test',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(candidate) })
    )
    expect(fetchMock.mock.calls.some(call => (call[1] as RequestInit | undefined)?.method === 'PUT')).toBe(false)
  })
})
