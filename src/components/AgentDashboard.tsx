import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Database,
  Files,
  GitBranch,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  X
} from 'lucide-react'
import { useAgentStore } from '@/stores/agent.store'
import { usePresetStore } from '@/stores/preset.store'
import type { AgentWorkspaceProposal, PromptLibraryWriteProposal } from '@/models/Agent.model'

export function AgentDashboard() {
  const {
    runtimeStatus,
    authStatus,
    runtimeError,
    user,
    models,
    skills,
    tools,
    builtinTools,
    subagentEnabled,
    activeThreadId,
    messages,
    running,
    proposals,
    checkRuntime,
    sendMessage,
    clearMessages
  } = useAgentStore()
  const { presets, initialized, init } = usePresetStore()
  const [draft, setDraft] = useState('用一句话回复：PromptCard Agent runtime is connected.')

  useEffect(() => {
    if (!initialized) init()
    checkRuntime()
  }, [checkRuntime, init, initialized])

  const deepseekModel = useMemo(
    () => models.find(model => model.name === 'deepseek-chat') || models[0],
    [models]
  )
  const promptLibraryProposalCount = useMemo(
    () => proposals.filter(isPromptLibraryProposal).length,
    [proposals]
  )

  const handleSend = async (content = draft) => {
    if (!content.trim() || running) return
    await sendMessage(content.trim(), presets, { permissionScope: 'workspace-chatbot-agent' })
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pb-32 pt-12">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white">
            <Bot className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-black text-black">Agent 仪表盘</h1>
          <p className="mt-2 text-sm text-gray-500">Runtime、模型、工具和诊断对话集中在这里；Prompt 库写入只在 Prompt 库页面审批。</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => checkRuntime()} className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-5 py-3 text-sm font-bold text-black">
            <RefreshCw className="h-4 w-4" />
            重新连接
          </button>
          <button type="button" onClick={clearMessages} className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-bold text-white">
            <X className="h-4 w-4" />
            清空线程
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatusTile icon={<ShieldCheck className="h-5 w-5" />} label="Runtime" value={statusText(runtimeStatus)} active={runtimeStatus === 'connected'} />
        <StatusTile icon={<Bot className="h-5 w-5" />} label="Auth" value={authStatusText(authStatus)} active={authStatus === 'authenticated'} />
        <StatusTile icon={<Sparkles className="h-5 w-5" />} label="Model" value={deepseekModel?.name || '未加载'} active={Boolean(deepseekModel)} />
        <StatusTile icon={<Files className="h-5 w-5" />} label="Skills" value={`${skills.length} 个`} active={skills.length > 0} />
        <StatusTile icon={<Wrench className="h-5 w-5" />} label="Tools" value={`${tools.length + builtinTools.length} 个`} active={tools.length > 0} />
        <StatusTile icon={<Database className="h-5 w-5" />} label="Prompt 库" value={`${presets.length} presets`} active />
      </div>

      {runtimeError && (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {runtimeError}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.85fr)]">
        <section className="rounded-3xl bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-black">诊断对话</h2>
              <p className="mt-1 text-xs font-semibold text-gray-400">
                {activeThreadId ? `Thread ${activeThreadId}` : user?.email || '应用内自动接入中'}
              </p>
            </div>
            <QuickButton
              label="Runtime 检查"
              onClick={() => setDraft('请说明当前 PromptCard Agent runtime 的连接状态、可用模型、工具和技能。不要生成 Prompt 库写入提案。')}
            />
          </div>

          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            className="h-32 w-full resize-none rounded-3xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 outline-none focus:border-black"
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={runtimeStatus !== 'connected' || running || !draft.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-40"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              发送到 Agent
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {messages.length === 0 ? (
              <div className="rounded-3xl bg-gray-50 p-6 text-sm font-semibold text-gray-400">暂无消息</div>
            ) : (
              messages.map(message => (
                <div key={message.id} className={`rounded-3xl p-4 text-sm leading-6 ${message.role === 'user' ? 'bg-black text-white' : 'bg-gray-50 text-gray-800'}`}>
                  <div className="mb-2 text-xs font-black opacity-60">{message.role === 'user' ? 'You' : 'Agent'}</div>
                  <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-3xl bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-black text-black">能力面板</h2>
            </div>
            <SummaryRow label="Subagent" value={subagentEnabled ? '已启用' : '未启用'} />
            <SummaryRow label="Tool Search" value={builtinTools.includes('tool_search') ? '已启用' : '未启用'} />
            <SummaryRow label="工具组" value={toolGroups(tools)} />
            <div className="mt-5">
              <CapabilityList title="Tools" items={[...builtinTools, ...tools.map(tool => `${tool.group}:${tool.name}`)].slice(0, 10)} />
              <CapabilityList title="Skills" items={skills.filter(skill => skill.enabled !== false).map(skill => skill.name).slice(0, 10)} />
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
            <h2 className="text-lg font-black text-black">Prompt 库写入权限</h2>
            <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm font-semibold leading-6 text-gray-500">
              Prompt 拆解、写入、更新和归档只在 Prompt 库页面处理。
              {promptLibraryProposalCount > 0
                ? ` 当前有 ${promptLibraryProposalCount} 个 Prompt 库提案，请前往 Prompt 库审批。`
                : ' 当前没有待审批的 Prompt 库提案。'}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function StatusTile({ icon, label, value, active }: { icon: ReactNode; label: string; value: string; active?: boolean }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-2xl ${active ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}>
        {icon}
      </div>
      <div className="text-xs font-black uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1 truncate text-sm font-black text-black">{value}</div>
    </div>
  )
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-black text-amber-800">
      <Sparkles className="h-4 w-4" />
      {label}
    </button>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4 flex items-center justify-between border-b border-gray-100 pb-3 last:border-0">
      <span className="text-sm font-bold text-gray-500">{label}</span>
      <span className="max-w-[180px] truncate text-right text-sm font-black text-black">{value}</span>
    </div>
  )
}

function CapabilityList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs font-black uppercase tracking-wider text-gray-400">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-xs font-semibold text-gray-400">暂无</span>
        ) : (
          items.map(item => (
            <span key={item} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
              {item}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

function isPromptLibraryProposal(proposal: AgentWorkspaceProposal): proposal is PromptLibraryWriteProposal {
  return proposal.kind === 'prompt_library_write_proposal' || Boolean((proposal as PromptLibraryWriteProposal).presetDraft)
}

function toolGroups(tools: { group: string }[]) {
  const groups = Array.from(new Set(tools.map(tool => tool.group))).filter(Boolean)
  return groups.length ? groups.join(' / ') : '未加载'
}

function statusText(status: string) {
  if (status === 'connected') return '已连接'
  if (status === 'disconnected') return '未连接'
  return '检查中'
}

function authStatusText(status: string) {
  if (status === 'authenticated') return '应用内接入'
  if (status === 'setup-required') return '需初始化'
  if (status === 'unauthenticated') return '未接入'
  return '接入中'
}
