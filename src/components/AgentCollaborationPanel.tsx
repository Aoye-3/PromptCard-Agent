import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Bot, Check, Loader2, MoreHorizontal, RefreshCw, Send, Wand2, X } from 'lucide-react'
import { useAgentStore } from '@/stores/agent.store'
import { usePresetStore } from '@/stores/preset.store'
import type {
  AgentMessage,
  AgentWorkspaceContext,
  AgentWorkspaceMode,
  AgentWorkspaceProposal
} from '@/models/Agent.model'

interface AgentCollaborationPanelProps {
  title: string
  mode: AgentWorkspaceMode
  workspaceContext: AgentWorkspaceContext
  sessionKey?: string
  onApplyWorkspaceProposal: (proposal: AgentWorkspaceProposal) => Promise<void> | void
  autoApplyWorkspaceChanges?: boolean
  compact?: boolean
  embedded?: boolean
  contextLabel?: string
}

const agentQuickPrompts = [
  {
    label: '补全选中卡片',
    prompt: '请读取当前选中的卡片和页面上下文，直接补全选中卡片的内容。'
  },
  {
    label: '改写当前页',
    prompt: '请把当前页所有提示词卡片改写得更具体、更适合视频生成，并直接更新相关卡片。'
  },
  {
    label: '新增卡片',
    prompt: '请根据当前页面缺失的信息，新增一张最有帮助的提示词卡片。'
  }
] as const

export function AgentCollaborationPanel({
  title,
  mode,
  workspaceContext,
  sessionKey: sessionKeyProp,
  onApplyWorkspaceProposal,
  autoApplyWorkspaceChanges = false,
  compact = false,
  embedded = false,
  contextLabel = '已读取工作区'
}: AgentCollaborationPanelProps) {
  const sessionKey = sessionKeyProp || `workspace:${mode.replace('-workspace', '')}:${workspaceContext.projectId}`
  const {
    runtimeStatus,
    authStatus,
    runtimeError,
    getAgentSession,
    checkRuntime,
    sendMessage,
    markProposalStatus
  } = useAgentStore()
  const session = getAgentSession(sessionKey)
  const messages = session.messages
  const running = session.running
  const pendingProposals = session.proposals.filter(proposal => proposal.status === 'pending')
  const visibleRuntimeError = session.runtimeError || runtimeError
  const { presets, initialized, init } = usePresetStore()
  const [draft, setDraft] = useState(embedded ? '' : '告诉 Agent 你想怎么修改当前选中的提示词卡片。')
  const [appliedMessages, setAppliedMessages] = useState<AgentMessage[]>([])

  useEffect(() => {
    if (!initialized) init()
    checkRuntime()
  }, [checkRuntime, init, initialized])

  const conversationMessages = useMemo(
    () => [...messages, ...appliedMessages].sort((a, b) => a.createdAt - b.createdAt),
    [appliedMessages, messages]
  )

  const handleSend = async (content = draft) => {
    if (!content.trim() || running) return
    const returnedProposals = await sendMessage(content.trim(), presets, {
      workspaceContext,
      mode,
      permissionScope: 'workspace-chatbot-agent',
      sessionKey
    })

    if (autoApplyWorkspaceChanges) {
      const workspaceProposals = returnedProposals.filter(isDirectWorkspaceProposal)
      for (const proposal of workspaceProposals) {
        await onApplyWorkspaceProposal(proposal)
        markProposalStatus(proposal.id, 'approved', sessionKey)
      }
      if (workspaceProposals.length > 0) {
        setAppliedMessages(current => [
          ...current,
          {
            id: `agent-applied-${Date.now()}`,
            role: 'system',
            content: summarizeAppliedChanges(workspaceProposals),
            createdAt: Date.now()
          }
        ])
      }
    }

    setDraft('')
  }

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (runtimeStatus !== 'connected' || running || !draft.trim()) return
    void handleSend()
  }

  return (
    <div aria-label={title} className="flex h-full min-h-0 flex-col bg-white">
      {embedded ? (
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#e5e7eb] px-3">
          <div className="flex min-w-0 items-center gap-2 text-[11px]">
            <Bot className="h-3.5 w-3.5 shrink-0 text-[#5e5d59]" aria-hidden="true" />
            <span className="truncate font-semibold text-[#4d4c48]">{contextLabel}</span>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${runtimeStatus === 'connected' ? 'bg-emerald-600' : 'bg-amber-500'}`} />
            <span className="shrink-0 text-[#87867f]">
              {runtimeStatus === 'connected' ? authStatusText(authStatus) : statusText(runtimeStatus)}
            </span>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#87867f] transition hover:bg-[#f3f4f6] hover:text-[#141413]"
            onClick={() => checkRuntime()}
            title="Reconnect runtime"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
      <div className={`shrink-0 border-b border-gray-100 ${compact ? 'p-3' : 'p-5'}`}>
        <div className={`${compact ? 'mb-2' : 'mb-3'} flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-2">
            <div className={`flex items-center justify-center bg-black text-white ${compact ? 'h-8 w-8 rounded-xl' : 'h-9 w-9 rounded-2xl'}`}>
              <Bot className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            </div>
            <div>
              <h2 className={`${compact ? 'text-sm' : 'text-base'} font-black text-gray-950`}>{title}</h2>
              <p className="text-xs font-semibold text-gray-400">
                {runtimeStatus === 'connected' ? authStatusText(authStatus) : statusText(runtimeStatus)}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={`${compact ? 'p-1.5' : 'p-2'} rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-200`}
            onClick={() => checkRuntime()}
            title="Reconnect runtime"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {visibleRuntimeError && (
          <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {visibleRuntimeError}
          </div>
        )}
      </div>
      )}

      {embedded && visibleRuntimeError && (
        <div className="mx-3 mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
          {visibleRuntimeError}
        </div>
      )}

      <div className={`${embedded ? 'flex-1 space-y-2 p-3' : compact ? 'flex-[3_1_0%] space-y-2 p-3' : 'flex-1 space-y-3 p-5'} min-h-0 overflow-y-auto`}>
        {conversationMessages.length === 0 ? (
          embedded ? (
            <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">
              <div className="flex items-start gap-2">
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-[#c96442]" aria-hidden="true" />
                <div>
                  <h3 className="text-[13px] font-bold text-[#141413]">可以直接修改当前画布</h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-[#87867f]">选中节点后，让 Agent 补全、改写或新增内容。</p>
                </div>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-[#f3f4f6]">
                {agentQuickPrompts.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`flex h-9 w-full items-center gap-2 px-3 text-left text-[11px] font-semibold text-[#4d4c48] transition hover:bg-[#f9fafb] ${
                      index > 0 ? 'border-t border-[#f3f4f6]' : ''
                    }`}
                    onClick={() => setDraft(item.prompt)}
                  >
                    <Wand2 className="h-3 w-3 text-[#87867f]" aria-hidden="true" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={`${compact ? 'rounded-xl px-3 py-2 text-xs leading-5' : 'rounded-2xl px-4 py-3 text-sm'} bg-gray-50 font-semibold text-gray-400`}>
              还没有 Agent 对话。选中左侧卡片后，可以直接让 Agent 补全、改写或新增卡片。
            </div>
          )
        ) : (
          conversationMessages.slice(-8).map(message => (
            <div
              key={message.id}
              className={`${compact ? 'rounded-xl px-3 py-2 text-[13px] leading-5' : 'rounded-2xl px-4 py-3 text-sm leading-6'} ${
                message.role === 'user'
                  ? 'bg-black text-white'
                  : message.role === 'system'
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-gray-50 text-gray-700'
              }`}
            >
              <div className="mb-1 text-[11px] font-black uppercase opacity-60">
                {message.role === 'user' ? 'You' : message.role === 'system' ? 'Applied' : 'Agent'}
              </div>
              <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
            </div>
          ))
        )}
      </div>

      {pendingProposals.length > 0 && (
        <div className="shrink-0 space-y-2 border-t border-gray-100 p-3">
          {pendingProposals.slice(-3).map(proposal => (
            <div key={proposal.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-black text-amber-900">{proposalTitle(proposal)}</div>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-amber-800">{proposalSummary(proposal)}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full bg-gray-950 px-3 py-1.5 text-xs font-black text-white"
                  onClick={async () => {
                    await onApplyWorkspaceProposal(proposal)
                    markProposalStatus(proposal.id, 'approved', sessionKey)
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  Apply
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 px-3 py-1.5 text-xs font-black text-amber-900"
                  onClick={() => markProposalStatus(proposal.id, 'rejected', sessionKey)}
                >
                  <X className="h-3.5 w-3.5" />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {embedded ? (
        <div className="shrink-0 border-t border-[#e5e7eb] bg-white p-2.5">
          <div className="mb-2 flex min-w-0 items-center gap-1.5">
            {agentQuickPrompts.slice(0, 2).map(item => (
              <QuickPrompt
                key={item.label}
                label={item.label}
                onClick={() => setDraft(item.prompt)}
                dense
              />
            ))}
            <button
              type="button"
              aria-label={agentQuickPrompts[2].label}
              title={agentQuickPrompts[2].label}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#5e5d59] transition hover:bg-[#f9fafb] hover:text-[#141413]"
              onClick={() => setDraft(agentQuickPrompts[2].prompt)}
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="rounded-[10px] border border-[#d1d5db] bg-white p-2 shadow-[0_0_0_1px_rgba(20,20,19,0.02)] focus-within:border-[#87867f]">
            <textarea
              className="min-h-[58px] max-h-32 w-full resize-none border-0 bg-transparent px-1 py-0.5 text-[13px] leading-5 text-[#141413] outline-none placeholder:text-[#87867f]"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="描述你想修改的内容，Enter 发送，Shift+Enter 换行"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#f3f4f6] px-2 text-[10px] font-semibold text-[#5e5d59]">
                <Bot className="h-3 w-3" aria-hidden="true" />
                画布上下文
              </span>
              <button
                type="button"
                aria-label="发送给 Agent"
                title="发送给 Agent"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#141413] text-white transition hover:bg-[#30302e] disabled:bg-[#d1cfc5]"
                onClick={() => handleSend()}
                disabled={runtimeStatus !== 'connected' || running || !draft.trim()}
              >
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
      <div className={`${compact ? 'shrink-0 p-3' : 'p-5'} border-t border-gray-100`}>
        <div className={`${compact ? 'mb-2 gap-1.5' : 'mb-3 gap-2'} flex flex-wrap`}>
          {agentQuickPrompts.map(item => (
            <QuickPrompt key={item.label} label={item.label} onClick={() => setDraft(item.prompt)} />
          ))}
        </div>
        <textarea
          className={`${compact ? 'min-h-[86px] rounded-xl text-[13px] leading-5' : 'min-h-[112px] rounded-2xl text-sm leading-relaxed'} w-full resize-none border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100`}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder="例如：把主体卡片改得更具体，加入年龄、服装、情绪和画面细节..."
        />
        <button
          type="button"
          className={`${compact ? 'mt-2 py-2 text-[13px]' : 'mt-3 py-2.5 text-sm'} inline-flex w-full items-center justify-center gap-2 rounded-full bg-black px-4 font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300`}
          onClick={() => handleSend()}
          disabled={runtimeStatus !== 'connected' || running || !draft.trim()}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          发送给 Agent
        </button>
      </div>
      )}

    </div>
  )
}

function QuickPrompt({ label, onClick, dense = false }: { label: string; onClick: () => void; dense?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={dense
        ? 'inline-flex h-7 min-w-0 items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-2 text-[10px] font-semibold text-[#5e5d59] transition hover:bg-[#f9fafb] hover:text-[#141413]'
        : 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800 transition hover:bg-amber-100'}
    >
      <Wand2 className={dense ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5'} />
      <span className="truncate">{label}</span>
    </button>
  )
}

function isDirectWorkspaceProposal(proposal: AgentWorkspaceProposal) {
  return proposal.kind === 'workspace_card_create' || proposal.kind === 'workspace_card_update'
}

function proposalTitle(proposal: AgentWorkspaceProposal) {
  if (proposal.kind === 'free_canvas_text_update') return 'Update selected text node'
  if (proposal.kind === 'free_canvas_text_create') return 'Create text node'
  if (proposal.kind === 'prompt_library_write_proposal') return 'Add Prompt Library preset'
  return 'Agent workspace proposal'
}

function proposalSummary(proposal: AgentWorkspaceProposal) {
  if (proposal.kind === 'free_canvas_text_update' || proposal.kind === 'free_canvas_text_create') {
    return proposal.userText
  }
  if (proposal.kind === 'prompt_library_write_proposal') {
    return `${proposal.presetDraft.label}: ${proposal.presetDraft.content}`
  }
  return proposal.rationale
}

function summarizeAppliedChanges(proposals: AgentWorkspaceProposal[]) {
  const created = proposals.filter(proposal => proposal.kind === 'workspace_card_create').length
  const updated = proposals
    .filter((proposal): proposal is Extract<AgentWorkspaceProposal, { kind: 'workspace_card_update' }> => proposal.kind === 'workspace_card_update')
    .reduce((count, proposal) => count + proposal.updates.length, 0)

  const parts = []
  if (updated) parts.push(`已更新 ${updated} 张卡片`)
  if (created) parts.push(`已新增 ${created} 张卡片`)
  return parts.length ? parts.join('，') : 'Agent 已返回修改，但没有可应用的卡片变更。'
}

export const AIChatbotBox = AgentCollaborationPanel

function statusText(status: string) {
  if (status === 'connected') return 'Runtime connected'
  if (status === 'disconnected') return 'Runtime disconnected'
  return 'Checking runtime'
}

function authStatusText(status: string) {
  if (status === 'authenticated') return 'Runtime ready'
  if (status === 'setup-required') return 'Setup required'
  if (status === 'unauthenticated') return 'Auth pending'
  return 'Bootstrapping'
}
