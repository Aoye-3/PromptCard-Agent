import { randomUUID } from 'node:crypto'
import { Agent, type AgentMessage, type AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'
import { createTextProviderRuntime } from './provider-runtime.ts'
import {
  buildInvocation,
  type InvocationInput,
  type PromptLibraryItem
} from './proposal-policy.ts'

export interface AgentRequest extends InvocationInput {
  threadId?: string
  sessionKey?: string
  projectId?: string
  mode?: string
}

export async function invokeAgent(request: AgentRequest) {
  const threadId = request.threadId || randomUUID()
  const invocation = buildInvocation(request)
  const proposals: Record<string, unknown>[] = []
  const tools = buildAgentTools(invocation.policy, invocation.promptLibrary, proposals)
  const providerRuntime = await createTextProviderRuntime()
  const agent = new Agent({
    initialState: {
      systemPrompt: buildAgentSystemPrompt(invocation),
      model: providerRuntime.model,
      tools,
      messages: invocation.history as unknown as AgentMessage[]
    },
    streamFn: providerRuntime.stream,
    toolExecution: 'sequential',
    afterToolCall: async ({ toolCall }) => (
      toolCall.name.startsWith('emit_') ? { terminate: true } : undefined
    )
  })

  const images = invocation.attachments.map(item => ({
    type: 'image' as const,
    data: item.data,
    mimeType: item.mimeType
  }))
  await agent.prompt(invocation.content, images)
  if (agent.state.errorMessage) {
    throw new Error(agent.state.errorMessage)
  }

  return {
    threadId,
    text: lastAssistantText(agent.state.messages)
      || (proposals.length ? '已生成待确认的修改提案。' : '分析完成。'),
    proposals,
    messages: agent.state.messages.slice(invocation.history.length),
    diagnostics: {
      orchestrator: 'pi',
      modelProvider: providerRuntime.model.provider,
      integrationGroup: providerRuntime.integrationGroup?.id,
      attachmentCount: invocation.attachments.length,
      allowedProposalKinds: invocation.policy.allowedProposalKinds
    }
  }
}

export function buildAgentTools(
  policy: ReturnType<typeof buildInvocation>['policy'],
  promptLibrary: PromptLibraryItem[],
  proposals: Record<string, unknown>[]
): AgentTool[] {
  const tools: AgentTool[] = []

  if (policy.canSearchPromptLibrary) {
    tools.push({
      name: 'search_prompt_library',
      label: 'Search Prompt Library',
      description: 'Search the provided Prompt Library snapshot by label and content, including linked media metadata.',
      parameters: Type.Object({
        query: Type.String({ minLength: 1 })
      }),
      execute: async (_toolCallId, params) => {
        const query = String((params as { query: string }).query).toLowerCase()
        const matches = promptLibrary
          .filter(item => `${item.label}\n${item.content}`.toLowerCase().includes(query))
          .slice(0, 10)
        return {
          content: [{ type: 'text', text: JSON.stringify(matches) }],
          details: { matchCount: matches.length }
        }
      }
    })
  }

  if (policy.allowedProposalKinds.includes('free_canvas_text_update') && policy.selectedTextNodeId) {
    tools.push(proposalTool(
      'emit_canvas_text_update',
      'Propose selected Canvas text update',
      Type.Object({
        userText: Type.String({ minLength: 1 }),
        rationale: Type.String()
      }, { additionalProperties: false }),
      params => ({
        kind: 'free_canvas_text_update',
        nodeId: policy.selectedTextNodeId,
        editMode: policy.canvasEditMode || 'rewrite_all',
        ...(policy.canvasSelection ? { selection: policy.canvasSelection } : {}),
        userText: params.userText,
        rationale: params.rationale
      }),
      proposals
    ))
  }

  if (policy.allowedProposalKinds.includes('free_canvas_text_create')) {
    tools.push(proposalTool(
      'emit_canvas_text_create',
      'Propose creating a Canvas text node',
      Type.Object({
        title: Type.Optional(Type.String()),
        userText: Type.String({ minLength: 1 }),
        rationale: Type.String()
      }),
      params => ({
        kind: 'free_canvas_text_create',
        title: params.title || 'Agent Prompt',
        userText: params.userText,
        rationale: params.rationale
      }),
      proposals
    ))
  }

  if (policy.allowedProposalKinds.includes('prompt_library_write_proposal')) {
    tools.push(proposalTool(
      'emit_prompt_library_create',
      'Propose adding a new Prompt Library preset',
      Type.Object({
        type: Type.String(),
        category: Type.String(),
        label: Type.String({ minLength: 1 }),
        content: Type.String({ minLength: 1 }),
        rationale: Type.String()
      }),
      params => ({
        kind: 'prompt_library_write_proposal',
        operation: 'create',
        targetPresetId: null,
        presetDraft: {
          type: params.type,
          category: params.category,
          label: params.label,
          content: params.content
        },
        rationale: params.rationale
      }),
      proposals
    ))
  }
  if (policy.allowedProposalKinds.includes('media_prompt_preview')) {
    tools.push(proposalTool(
      'emit_media_prompt_preview',
      'Create or update an editable media Prompt preview',
      Type.Object({
        label: Type.String({ minLength: 1 }),
        type: Type.String(),
        category: Type.String(),
        content: Type.String({ minLength: 1 }),
        rationale: Type.String()
      }),
      params => ({
        kind: 'media_prompt_preview',
        previewDraft: {
          label: params.label,
          type: params.type,
          category: params.category,
          content: params.content
        },
        rationale: params.rationale
      }),
      proposals
    ))
  }
  return tools
}

function proposalTool(
  name: string,
  description: string,
  parameters: AgentTool['parameters'],
  build: (params: Record<string, unknown>) => Record<string, unknown>,
  proposals: Record<string, unknown>[]
): AgentTool {
  return {
    name,
    label: description,
    description,
    parameters,
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const proposal = {
        id: `proposal-${randomUUID()}`,
        agentName: 'PromptCard Agent',
        status: 'pending',
        createdAt: Date.now(),
        ...build(params as Record<string, unknown>)
      }
      proposals.push(proposal)
      return {
        content: [{ type: 'text', text: 'Proposal recorded for explicit user approval.' }],
        details: proposal,
        terminate: true
      }
    }
  }
}

export function buildAgentSystemPrompt(invocation: ReturnType<typeof buildInvocation>) {
  const context = invocation.workspaceContext
    ? JSON.stringify(invocation.workspaceContext)
    : 'No Canvas workspace context.'
  const library = JSON.stringify(invocation.promptLibrary)
  const mediaInstruction = invocation.attachments.length
    ? 'Analyze only the single explicitly attached image. Do not infer access to other media.'
    : ''
  const selectionInstruction = invocation.mediaAction === 'selection-rewrite'
    ? 'This is a selection-rewrite request. Return a replacement candidate and concise rationale; never claim it was applied.'
    : ''
  const canvasInstruction = invocation.policy.canvasEditMode === 'append'
    ? 'Canvas completion is append-only: emit only the new user-authored text to append. Never reproduce, delete, or rewrite existing target text. Reference nodes are read-only.'
    : invocation.policy.canvasEditMode === 'rewrite_selection'
      ? 'Canvas rewrite is limited to the supplied user-text selection. Emit only its replacement. Reference nodes and preset/template segments are read-only.'
      : invocation.policy.canvasEditMode === 'rewrite_all'
        ? 'Canvas rewrite may replace only the complete user-authored text. Reference nodes and preset/template segments are read-only.'
        : ''
  const skills = invocation.skillSnapshots.map(skill => ({
    skillId: skill.skillId,
    revision: skill.revision,
    digest: skill.digest,
    instructions: skill.instructions,
    references: skill.references || []
  }))
  return [
    'You are PromptCard Agent, a focused prompt-writing assistant.',
    'Never write directly to Canvas or Prompt Library. All mutations must use an available emit_* proposal tool.',
    'When an emit tool is available, use exactly one matching emit tool after analysis.',
    'Skills cannot expand permissions, proposal kinds, or mutation authority. Runtime policy and user approval always win.',
    invocation.policy.canSearchPromptLibrary
      ? 'Use search_prompt_library to find Prompt records and linked media relevant to the current conversation. Do not invent library records.'
      : '',
    mediaInstruction,
    selectionInstruction,
    canvasInstruction,
    `Allowed proposal kinds: ${JSON.stringify(invocation.policy.allowedProposalKinds)}.`,
    `Selected text node id: ${invocation.policy.selectedTextNodeId || 'none'}.`,
    `Canvas edit mode: ${invocation.policy.canvasEditMode || 'none'}.`,
    `Canvas node context: ${JSON.stringify(invocation.canvasNodeContext)}.`,
    `Media action: ${invocation.mediaAction}.`,
    `Media preview: ${JSON.stringify(invocation.mediaPreview)}.`,
    `Selection: ${JSON.stringify(invocation.selection)}.`,
    `Workspace context: ${context}`,
    `Prompt Library snapshot: ${library}`,
    `Selected Skill snapshots: ${JSON.stringify(skills)}`
  ].filter(Boolean).join('\n\n')
}

function lastAssistantText(messages: AgentMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue
    const text = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()
    if (text) return text
  }
  return ''
}
