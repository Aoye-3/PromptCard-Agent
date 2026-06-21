import { useEffect, useMemo, useState } from 'react'
import { Bot, Loader2, RefreshCw, Send, Wand2 } from 'lucide-react'
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
}

export function AgentCollaborationPanel({
  title,
  mode,
  workspaceContext,
  sessionKey: sessionKeyProp,
  onApplyWorkspaceProposal,
  autoApplyWorkspaceChanges = false,
  compact = false
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
  const visibleRuntimeError = session.runtimeError || runtimeError
  const { presets, initialized, init } = usePresetStore()
  const [draft, setDraft] = useState('告诉 Agent 你想怎么修改当前选中的提示词卡片。')
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
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

      <div className={`${compact ? 'flex-[3_1_0%] space-y-2 p-3' : 'flex-1 space-y-3 p-5'} min-h-0 overflow-y-auto`}>
        {conversationMessages.length === 0 ? (
          <div className={`${compact ? 'rounded-xl px-3 py-2 text-xs leading-5' : 'rounded-2xl px-4 py-3 text-sm'} bg-gray-50 font-semibold text-gray-400`}>
            还没有 Agent 对话。选中左侧卡片后，可以直接让 Agent 补全、改写或新增卡片。
          </div>
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

      <div className={`${compact ? 'shrink-0 p-3' : 'p-5'} border-t border-gray-100`}>
        <div className={`${compact ? 'mb-2 gap-1.5' : 'mb-3 gap-2'} flex flex-wrap`}>
          <QuickPrompt
            label="补全选中卡片"
            onClick={() => setDraft('请读取当前选中的卡片和页面上下文，直接补全选中卡片的内容。')}
          />
          <QuickPrompt
            label="改写当前页"
            onClick={() => setDraft('请把当前页所有提示词卡片改写得更具体、更适合视频生成，并直接更新相关卡片。')}
          />
          <QuickPrompt
            label="新增卡片"
            onClick={() => setDraft('请根据当前页面缺失的信息，新增一张最有帮助的提示词卡片。')}
          />
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

    </div>
  )
}

function QuickPrompt({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800 transition hover:bg-amber-100"
    >
      <Wand2 className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function isDirectWorkspaceProposal(proposal: AgentWorkspaceProposal) {
  return proposal.kind === 'workspace_card_create' || proposal.kind === 'workspace_card_update'
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
