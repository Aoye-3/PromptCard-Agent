import { describe, expect, it } from 'vitest'
import { parseAgentWorkspaceProposals, parsePromptLibraryProposals } from './agent-runtime-service'

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
})
