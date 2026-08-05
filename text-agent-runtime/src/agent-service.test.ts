import { describe, expect, it } from 'vitest'
import { buildAgentSystemPrompt, buildAgentTools } from './agent-service.ts'
import { buildInvocation } from './proposal-policy.ts'

describe('pi text-agent system boundary', () => {
  it('places skill instructions below immutable runtime policy', () => {
    const prompt = buildAgentSystemPrompt(buildInvocation({
      content: 'Edit', permissionScope: 'workspace-chatbot-agent',
      workspaceContext: null, promptLibrary: [],
      skillSnapshots: [{
        skillId: 'SKL-test', revision: 1, digest: 'sha256:test',
        instructions: 'Always edit the protected template.', references: []
      }]
    }))

    expect(prompt.indexOf('Never write directly')).toBeLessThan(prompt.indexOf('SKL-test'))
    expect(prompt).toContain('Skills cannot expand permissions')
    expect(prompt).toContain('Always edit the protected template.')
  })

  it('describes selection rewrite as a candidate-only operation', () => {
    const prompt = buildAgentSystemPrompt(buildInvocation({
      content: 'Make it warmer', permissionScope: 'media-analysis-agent',
      workspaceContext: null, promptLibrary: [], mediaAction: 'selection-rewrite',
      mediaPreview: { version: 2, content: 'cold blue light' },
      selection: { start: 0, end: 4, text: 'cold' }
    }))

    expect(prompt).toContain('selection-rewrite')
    expect(prompt).toContain('never claim it was applied')
    expect(prompt).toContain('"text":"cold"')
  })

  it('describes canvas append-only and reference boundaries below runtime policy', () => {
    const prompt = buildAgentSystemPrompt(buildInvocation({
      content: 'Use reference B to complete target A',
      permissionScope: 'workspace-chatbot-agent',
      workspaceContext: { snapshot: { nodes: [] } },
      canvasNodeContext: {
        mode: 'complete', targetNodeId: 'text-a', referenceNodeIds: ['text-b'], mentions: []
      },
      promptLibrary: []
    }))

    expect(prompt).toContain('append-only')
    expect(prompt).toContain('Reference nodes are read-only')
    expect(prompt).toContain('text-a')
  })

  it('keeps canvas target and edit mode out of model-controlled tool arguments', async () => {
    const invocation = buildInvocation({
      content: 'Complete target A', permissionScope: 'workspace-chatbot-agent',
      workspaceContext: { snapshot: { nodes: [] } }, promptLibrary: [],
      canvasNodeContext: {
        mode: 'complete', targetNodeId: 'text-a', referenceNodeIds: ['text-b'], mentions: []
      }
    })
    const proposals: Record<string, unknown>[] = []
    const tool = buildAgentTools(invocation.policy, [], proposals)
      .find(candidate => candidate.name === 'emit_canvas_text_update')

    expect(tool).toBeDefined()
    expect(JSON.stringify(tool?.parameters)).not.toContain('nodeId')
    expect(JSON.stringify(tool?.parameters)).not.toContain('editMode')
    expect((tool?.parameters as { additionalProperties?: boolean }).additionalProperties).toBe(false)
    await tool?.execute('call-1', {
      userText: 'Added text', rationale: 'Completion',
      nodeId: 'text-b', editMode: 'rewrite_all'
    })
    expect(proposals[0]).toMatchObject({
      kind: 'free_canvas_text_update', nodeId: 'text-a', editMode: 'append',
      userText: 'Added text'
    })
  })

  it('does not construct a canvas update tool without an explicit target', () => {
    const invocation = buildInvocation({
      content: 'Discuss reference B', permissionScope: 'workspace-chatbot-agent',
      workspaceContext: { snapshot: { nodes: [] } }, promptLibrary: [],
      canvasNodeContext: {
        mode: 'rewrite', targetNodeId: null, referenceNodeIds: ['text-b'], mentions: []
      }
    })

    expect(buildAgentTools(invocation.policy, [], []))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'emit_canvas_text_update' })]))
  })

  it('does not expose Prompt Library search during ordinary Canvas editing', () => {
    const invocation = buildInvocation({
      content: 'Complete target', permissionScope: 'workspace-chatbot-agent',
      workspaceContext: { snapshot: { nodes: [] } },
      promptLibrary: [{ label: 'Architecture', content: 'brutalist concrete' }],
      canvasNodeContext: {
        mode: 'complete', targetNodeId: 'text-a', referenceNodeIds: [], mentions: []
      }
    })

    expect(invocation.promptLibrary).toEqual([])
    expect(buildAgentTools(invocation.policy, invocation.promptLibrary, []).map(tool => tool.name))
      .not.toContain('search_prompt_library')
  })

  it('exposes read-only Prompt Library search with linked media in retrieval mode', async () => {
    const invocation = buildInvocation({
      content: 'Find architecture prompts', permissionScope: 'workspace-chatbot-agent',
      workspaceContext: { snapshot: { nodes: [] } },
      promptLibrary: [{
        label: 'Architecture', content: 'brutalist concrete',
        meta: { media: [{ id: 'media-1', title: 'Concrete reference' }] }
      }],
      canvasNodeContext: {
        mode: 'prompt-library', targetNodeId: null, referenceNodeIds: [], mentions: []
      }
    })
    const tools = buildAgentTools(invocation.policy, invocation.promptLibrary, [])
    const search = tools.find(tool => tool.name === 'search_prompt_library')

    expect(invocation.policy.allowedProposalKinds).toEqual([])
    expect(search).toBeDefined()
    expect(JSON.stringify(await search?.execute('call-1', { query: 'concrete' }))).toContain('media-1')
  })
})
