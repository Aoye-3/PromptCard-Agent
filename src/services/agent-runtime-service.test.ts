import { describe, expect, it } from 'vitest'
import { parseAgentWorkspaceProposals } from './agent-runtime-service'

describe('agent runtime proposal parsing', () => {
  it('parses a free canvas text creation proposal', () => {
    const proposals = parseAgentWorkspaceProposals(JSON.stringify({
      kind: 'free_canvas_text_create',
      id: 'create-1',
      agentName: 'PromptCard Agent',
      title: 'Agent Prompt',
      userText: 'cinematic portrait',
      rationale: 'No text node is selected.',
      status: 'pending',
      createdAt: 1
    }))

    expect(proposals).toEqual([
      expect.objectContaining({
        kind: 'free_canvas_text_create',
        id: 'create-1',
        title: 'Agent Prompt',
        userText: 'cinematic portrait'
      })
    ])
  })

  it('parses an editable media prompt preview without treating it as a write', () => {
    const proposals = parseAgentWorkspaceProposals(JSON.stringify({
      kind: 'media_prompt_preview', id: 'preview-1',
      previewDraft: { label: 'Industrial', type: 'style', category: 'media', content: 'brushed metal' },
      rationale: 'Derived from the selected image.'
    }))

    expect(proposals).toEqual([expect.objectContaining({
      kind: 'media_prompt_preview',
      previewDraft: expect.objectContaining({ content: 'brushed metal' })
    })])
  })

  it('parses append and selection rewrite canvas proposals without legacy mode fallback', () => {
    const proposals = parseAgentWorkspaceProposals(JSON.stringify({
      kind: 'agent_workspace_proposals',
      proposals: [
        {
          kind: 'free_canvas_text_update', id: 'append-1', nodeId: 'text-1',
          editMode: 'append', userText: 'new detail', baseContentDigest: 'sha256:base'
        },
        {
          kind: 'free_canvas_text_update', id: 'rewrite-1', nodeId: 'text-1',
          editMode: 'rewrite_selection', userText: 'warm',
          selection: { start: 0, end: 4, selectedText: 'cold' },
          baseContentDigest: 'sha256:base'
        }
      ]
    }))

    expect(proposals).toEqual([
      expect.objectContaining({ editMode: 'append', userText: 'new detail' }),
      expect.objectContaining({
        editMode: 'rewrite_selection',
        selection: { start: 0, end: 4, selectedText: 'cold' }
      })
    ])
  })
})
