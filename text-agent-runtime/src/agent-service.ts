import { randomUUID } from 'node:crypto'
import { Agent, type AgentMessage, type AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'
import { createTextProviderRuntime } from './provider-runtime.ts'
import {
  buildInvocation,
  type InvocationInput,
  type PromptLibraryItem
} from './proposal-policy.ts'

interface SessionRecord {
  sessionKey?: string
  projectId?: string
  mode?: string
  messages: AgentMessage[]
}

export interface AgentRequest extends InvocationInput {
  threadId?: string
  sessionKey?: string
  projectId?: string
  mode?: string
}

const sessions = new Map<string, SessionRecord>()

export async function invokeAgent(request: AgentRequest) {
  const threadId = request.threadId || randomUUID()
  const previous = sessions.get(threadId)
  assertSessionCompatible(previous, request)
  const invocation = buildInvocation(request)
  const proposals: Record<string, unknown>[] = []
  const tools = buildTools(invocation.policy, invocation.promptLibrary, proposals)
  const providerRuntime = await createTextProviderRuntime()
  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(invocation),
      model: providerRuntime.model,
      tools,
      messages: previous?.messages || []
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

  sessions.set(threadId, {
    sessionKey: request.sessionKey,
    projectId: request.projectId,
    mode: request.mode,
    messages: agent.state.messages.slice(-40)
  })

  return {
    threadId,
    text: lastAssistantText(agent.state.messages)
      || (proposals.length ? '已生成待确认的修改提案。' : '分析完成。'),
    proposals,
    diagnostics: {
      orchestrator: 'pi',
      modelProvider: providerRuntime.model.provider,
      integrationGroup: providerRuntime.integrationGroup?.id,
      attachmentCount: invocation.attachments.length,
      allowedProposalKinds: invocation.policy.allowedProposalKinds
    }
  }
}

function buildTools(
  policy: ReturnType<typeof buildInvocation>['policy'],
  promptLibrary: PromptLibraryItem[],
  proposals: Record<string, unknown>[]
): AgentTool[] {
  const tools: AgentTool[] = [{
    name: 'search_prompt_library',
    label: 'Search Prompt Library',
    description: 'Search the provided Prompt Library snapshot by label and content.',
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
  }]

  if (policy.allowedProposalKinds.includes('free_canvas_text_update') && policy.selectedTextNodeId) {
    tools.push(proposalTool(
      'emit_canvas_text_update',
      'Propose selected Canvas text update',
      Type.Object({
        mode: Type.Union([Type.Literal('replace'), Type.Literal('append')]),
        userText: Type.String({ minLength: 1 }),
        rationale: Type.String()
      }),
      params => ({
        kind: 'free_canvas_text_update',
        nodeId: policy.selectedTextNodeId,
        mode: params.mode,
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
  return tools
}

function proposalTool(
  name: string,
  description: string,
  parameters: any,
  build: (params: any) => Record<string, unknown>,
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
        ...build(params)
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

function buildSystemPrompt(invocation: ReturnType<typeof buildInvocation>) {
  const context = invocation.workspaceContext
    ? JSON.stringify(invocation.workspaceContext)
    : 'No Canvas workspace context.'
  const library = JSON.stringify(invocation.promptLibrary)
  const mediaInstruction = invocation.attachments.length
    ? 'Analyze only the single explicitly attached image. Do not infer access to other media.'
    : ''
  return [
    'You are PromptCard Agent, a focused prompt-writing assistant.',
    'Never write directly to Canvas or Prompt Library. All mutations must use an available emit_* proposal tool.',
    'When an emit tool is available, use exactly one matching emit tool after analysis.',
    'Use search_prompt_library when library examples help. Do not invent library records.',
    mediaInstruction,
    `Allowed proposal kinds: ${JSON.stringify(invocation.policy.allowedProposalKinds)}.`,
    `Selected text node id: ${invocation.policy.selectedTextNodeId || 'none'}.`,
    `Workspace context: ${context}`,
    `Prompt Library snapshot: ${library}`
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

function assertSessionCompatible(previous: SessionRecord | undefined, request: AgentRequest) {
  if (!previous) return
  const fields: Array<keyof Pick<SessionRecord, 'sessionKey' | 'projectId' | 'mode'>> = [
    'sessionKey',
    'projectId',
    'mode'
  ]
  for (const field of fields) {
    if (previous[field] && request[field] && previous[field] !== request[field]) {
      throw new Error(`session_${field}_mismatch`)
    }
  }
}
