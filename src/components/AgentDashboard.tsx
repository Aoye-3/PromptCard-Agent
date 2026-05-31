import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle
} from 'lucide-react'
import { useAgentStore } from '@/stores/agent.store'
import { usePresetStore } from '@/stores/preset.store'
import type { AgentWorkspaceProposal, PromptLibraryWriteProposal } from '@/models/Agent.model'
import type { DeepSeekModelConfigUpdate } from '@/services/agent-runtime-service'

type AgentPanelSection = 'models' | 'default-model' | 'tools' | 'skills' | 'diagnostics'
const DIAGNOSTICS_SESSION_KEY = 'diagnostics:agent-panel'

const sections: Array<{ id: AgentPanelSection; label: string; icon: ReactNode }> = [
  { id: 'models', label: '模型服务', icon: <Database className="h-4 w-4" /> },
  { id: 'default-model', label: '默认模型', icon: <Sparkles className="h-4 w-4" /> },
  { id: 'tools', label: '工具 / ToolUse', icon: <Wrench className="h-4 w-4" /> },
  { id: 'skills', label: '技能', icon: <Search className="h-4 w-4" /> },
  { id: 'diagnostics', label: 'Agent 会话诊断', icon: <Bot className="h-4 w-4" /> }
]

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
    getAgentSession,
    modelConfig,
    modelConfigSaving,
    modelConfigTesting,
    modelConfigTestResult,
    checkRuntime,
    loadModelConfig,
    saveModelConfig,
    testModelConfig,
    sendMessage,
    clearMessages
  } = useAgentStore()
  const diagnosticsSession = getAgentSession(DIAGNOSTICS_SESSION_KEY)
  const messages = diagnosticsSession.messages
  const running = diagnosticsSession.running
  const proposals = diagnosticsSession.proposals
  const activeThreadId = diagnosticsSession.threadId
  const { presets, initialized, init } = usePresetStore()
  const [activeSection, setActiveSection] = useState<AgentPanelSection>('models')
  const [draft, setDraft] = useState('请用一句话说明当前 PromptCard Agent runtime 的连接状态。')
  const [form, setForm] = useState<DeepSeekModelConfigUpdate>({
    enabled: true,
    apiBase: 'https://api.deepseek.com',
    modelName: 'deepseek-chat',
    temperature: 0.3,
    maxTokens: 4096
  })

  useEffect(() => {
    if (!initialized) init()
    checkRuntime()
  }, [checkRuntime, init, initialized])

  useEffect(() => {
    if (!modelConfig) return
    setForm({
      enabled: modelConfig.enabled,
      apiBase: modelConfig.apiBase,
      modelName: modelConfig.modelName,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens
    })
  }, [modelConfig])

  const promptLibraryProposalCount = useMemo(
    () => proposals.filter(isPromptLibraryProposal).length,
    [proposals]
  )
  const activeModel = models.find(model => model.name === modelConfig?.modelName) || models[0]

  const handleSend = async (content = draft) => {
    if (!content.trim() || running) return
    await sendMessage(content.trim(), presets, {
      sessionKey: DIAGNOSTICS_SESSION_KEY,
      permissionScope: 'workspace-chatbot-agent'
    })
  }

  const updateForm = (updates: DeepSeekModelConfigUpdate) => {
    setForm(current => ({ ...current, ...updates }))
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-6 pb-32 pt-8 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
        <div className="mb-5 flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-950">Agent 面板</h1>
            <p className="text-xs font-semibold text-gray-400">统一管理模型、工具和 Chatbox</p>
          </div>
        </div>

        <div className="space-y-1">
          {sections.map(section => (
            <button
              key={section.id}
              type="button"
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-black transition ${
                activeSection === section.id ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'
              }`}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="inline-flex items-center gap-3">{section.icon}{section.label}</span>
              {section.id === 'models' && <StatusDot ok={modelConfig?.apiKeyConfigured} />}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-gray-50 p-4 text-xs font-semibold leading-5 text-gray-500">
          <div className="mb-2 font-black text-gray-950">Runtime</div>
          <div>连接：{statusText(runtimeStatus)}</div>
          <div>认证：{authStatusText(authStatus)}</div>
          <div>用户：{user?.email || '应用内自动接入'}</div>
        </div>
      </aside>

      <main className="min-w-0">
        {runtimeError && (
          <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
            {runtimeError}
          </div>
        )}

        {activeSection === 'models' && (
          <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <PanelHeader title="DeepSeek 模型服务" subtitle="当前版本只接入 DeepSeek。API Key 保存到后端本地配置，不写入浏览器。" />
            <div className="mt-6 space-y-6">
              <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                <div>
                  <div className="text-sm font-black text-gray-950">启用 DeepSeek</div>
                  <div className="text-xs font-semibold text-gray-400">关闭后 Agent Runtime 不应发起模型调用</div>
                </div>
                <button
                  type="button"
                  className={`h-7 w-12 rounded-full p-1 transition ${form.enabled === false ? 'bg-gray-300' : 'bg-emerald-500'}`}
                  onClick={() => updateForm({ enabled: form.enabled === false })}
                >
                  <span className={`block h-5 w-5 rounded-full bg-white transition ${form.enabled === false ? '' : 'translate-x-5'}`} />
                </button>
              </div>

              <Field label="API 密钥" hint={modelConfig?.apiKeyConfigured ? `已保存：${modelConfig.apiKeyPreview}` : '尚未保存 DeepSeek API Key'}>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={form.apiKey || ''}
                    onChange={event => updateForm({ apiKey: event.target.value })}
                    placeholder={modelConfig?.apiKeyConfigured ? '留空则保留当前密钥' : 'sk-...'}
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-black text-gray-700 hover:bg-gray-200"
                    onClick={() => testModelConfig(form)}
                    disabled={modelConfigTesting}
                  >
                    {modelConfigTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    检测
                  </button>
                </div>
              </Field>

              <Field label="API 地址" hint="预览：/chat/completions 会由后端 Runtime 调用">
                <input
                  value={form.apiBase || ''}
                  onChange={event => updateForm({ apiBase: event.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="模型">
                  <input
                    value={form.modelName || ''}
                    onChange={event => updateForm({ modelName: event.target.value })}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
                </Field>
                <Field label="Temperature">
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={form.temperature ?? 0.3}
                    onChange={event => updateForm({ temperature: Number(event.target.value) })}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
                </Field>
                <Field label="Max Tokens">
                  <input
                    type="number"
                    min="256"
                    step="256"
                    value={form.maxTokens ?? 4096}
                    onChange={event => updateForm({ maxTokens: Number(event.target.value) })}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
                </Field>
              </div>

              {modelConfigTestResult && (
                <div className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ${modelConfigTestResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {modelConfigTestResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {modelConfigTestResult.message}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-5">
                <button type="button" onClick={() => loadModelConfig()} className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-5 py-3 text-sm font-black text-gray-700">
                  <RefreshCw className="h-4 w-4" />
                  重新读取
                </button>
                <button type="button" onClick={() => saveModelConfig(form)} disabled={modelConfigSaving} className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-black text-white disabled:opacity-40">
                  {modelConfigSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存配置
                </button>
              </div>
            </div>
          </section>
        )}

        {activeSection === 'default-model' && (
          <InfoPanel title="默认模型" icon={<Sparkles className="h-5 w-5" />}>
            <SummaryRow label="当前默认模型" value={modelConfig?.modelName || activeModel?.name || '未加载'} />
            <SummaryRow label="Runtime 模型数量" value={`${models.length}`} />
            <SummaryRow label="候选模型" value={(modelConfig?.availableModels || models.map(model => model.name)).join(' / ') || '未加载'} />
          </InfoPanel>
        )}

        {activeSection === 'tools' && (
          <InfoPanel title="工具 / ToolUse" icon={<Wrench className="h-5 w-5" />}>
            <SummaryRow label="Subagent" value={subagentEnabled ? '已启用' : '未启用'} />
            <SummaryRow label="Tool Search" value={builtinTools.includes('tool_search') ? '已启用' : '未启用'} />
            <SummaryRow label="工具组" value={toolGroups(tools)} />
            <CapabilityList title="Tools" items={[...builtinTools, ...tools.map(tool => `${tool.group}:${tool.name}`)]} />
          </InfoPanel>
        )}

        {activeSection === 'skills' && (
          <InfoPanel title="技能" icon={<Search className="h-5 w-5" />}>
            <CapabilityList title="Enabled Skills" items={skills.filter(skill => skill.enabled !== false).map(skill => skill.name)} />
          </InfoPanel>
        )}

        {activeSection === 'diagnostics' && (
          <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <PanelHeader title="Agent 会话诊断" subtitle={activeThreadId ? `Thread ${activeThreadId}` : user?.email || '应用内自动接入中'} />
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <StatusTile icon={<ShieldCheck className="h-5 w-5" />} label="Runtime" value={statusText(runtimeStatus)} active={runtimeStatus === 'connected'} />
              <StatusTile icon={<Bot className="h-5 w-5" />} label="Auth" value={authStatusText(authStatus)} active={authStatus === 'authenticated'} />
              <StatusTile icon={<Sparkles className="h-5 w-5" />} label="Model" value={modelConfig?.modelName || '未加载'} active={Boolean(modelConfig?.modelName)} />
              <StatusTile icon={<Database className="h-5 w-5" />} label="Prompt 库提案" value={`${promptLibraryProposalCount}`} active={promptLibraryProposalCount > 0} />
            </div>

            <div className="mt-6">
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                className="h-32 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 outline-none focus:border-gray-400"
              />
              <div className="mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => clearMessages(DIAGNOSTICS_SESSION_KEY)} className="rounded-full bg-gray-100 px-5 py-3 text-sm font-black text-gray-700">清空线程</button>
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
            </div>

            <div className="mt-6 space-y-3">
              {messages.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 p-6 text-sm font-semibold text-gray-400">暂无消息</div>
              ) : (
                messages.map(message => (
                  <div key={message.id} className={`rounded-2xl p-4 text-sm leading-6 ${message.role === 'user' ? 'bg-black text-white' : 'bg-gray-50 text-gray-800'}`}>
                    <div className="mb-2 text-xs font-black opacity-60">{message.role === 'user' ? 'You' : 'Agent'}</div>
                    <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-2xl font-black text-gray-950">{title}</h2>
      <p className="mt-2 text-sm font-semibold text-gray-400">{subtitle}</p>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-black text-gray-950">{label}</span>
        {hint && <span className="text-xs font-semibold text-gray-400">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

function InfoPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">{icon}</div>
        <h2 className="text-2xl font-black text-gray-950">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function StatusTile({ icon, label, value, active }: { icon: ReactNode; label: string; value: string; active?: boolean }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-black text-white' : 'bg-gray-200 text-gray-400'}`}>{icon}</div>
      <div className="text-xs font-black uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1 truncate text-sm font-black text-black">{value}</div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-4 last:border-0">
      <span className="text-sm font-bold text-gray-500">{label}</span>
      <span className="max-w-[70%] truncate text-right text-sm font-black text-black">{value}</span>
    </div>
  )
}

function CapabilityList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-5">
      <div className="mb-3 text-xs font-black uppercase tracking-wider text-gray-400">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-xs font-semibold text-gray-400">暂无</span>
        ) : (
          items.map(item => (
            <span key={item} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">{item}</span>
          ))
        )}
      </div>
    </div>
  )
}

function StatusDot({ ok }: { ok?: boolean }) {
  return <span className={`h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-300'}`} />
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
