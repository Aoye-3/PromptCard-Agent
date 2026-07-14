import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, KeyRound, Loader2, Plus, RefreshCw, Save, Trash2, XCircle } from 'lucide-react'
import {
  modelManagementClient,
  type ModelAssignment,
  type ModelCatalog,
  type ModelConnection,
  type ModelConnectionInput,
  type ModelConnectionTestResult,
  type ModelSlot
} from '@/services/model-management-client'

export const INITIAL_MODEL_CREDENTIAL_DRAFT = ''

export interface ModelManagementSnapshot {
  catalog: ModelCatalog
  connections: ModelConnection[]
  assignments: ModelAssignment[]
}

interface ModelManagementPanelActions {
  onSelectConnection: (connectionId: string) => void
  onCreateConnection: () => void
  onDraftChange: (updates: Partial<ModelConnectionInput>) => void
  onCredentialChange: (credential: string) => void
  onSaveConnection: () => void
  onClearCredential: () => void
  onTestConnection: (connectionId: string) => void
  onDeleteConnection: (connectionId: string) => void
  onAssignmentChange: (slot: ModelSlot, value: string) => void
  onReload: () => void
}

interface ModelManagementPanelContentProps {
  snapshot: ModelManagementSnapshot
  selectedConnectionId: string | null
  draft: ModelConnectionInput
  credentialDraft: string
  busyAction: string | null
  testResults: Record<string, ModelConnectionTestResult>
  error: string | null
  actions: ModelManagementPanelActions
}

const EMPTY_SNAPSHOT: ModelManagementSnapshot = {
  catalog: { providers: [], models: [] },
  connections: [],
  assignments: []
}

const EMPTY_DRAFT: ModelConnectionInput = {
  providerId: '',
  displayName: '',
  apiBase: '',
  enabled: true
}

export function ModelManagementPanel() {
  const [snapshot, setSnapshot] = useState<ModelManagementSnapshot>(EMPTY_SNAPSHOT)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ModelConnectionInput>(EMPTY_DRAFT)
  const [credentialDraft, setCredentialDraft] = useState(INITIAL_MODEL_CREDENTIAL_DRAFT)
  const [busyAction, setBusyAction] = useState<string | null>('load')
  const [testResults, setTestResults] = useState<Record<string, ModelConnectionTestResult>>({})
  const [error, setError] = useState<string | null>(null)

  const loadSnapshot = async (preferredConnectionId?: string | null) => {
    setBusyAction('load')
    setError(null)
    try {
      const [catalog, connections, assignments] = await Promise.all([
        modelManagementClient.getCatalog(),
        modelManagementClient.listConnections(),
        modelManagementClient.listAssignments()
      ])
      const nextSnapshot = { catalog, connections, assignments }
      setSnapshot(nextSnapshot)
      const selected = connections.find(connection => connection.id === preferredConnectionId)
        || connections[0]
        || null
      if (selected) {
        setSelectedConnectionId(selected.id)
        setDraft(connectionDraft(selected))
      } else {
        setSelectedConnectionId(null)
        setDraft(newConnectionDraft(catalog))
      }
      setCredentialDraft(INITIAL_MODEL_CREDENTIAL_DRAFT)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setBusyAction(null)
    }
  }

  useEffect(() => {
    void loadSnapshot()
  }, [])

  const runAction = async (name: string, action: () => Promise<void>) => {
    setBusyAction(name)
    setError(null)
    try {
      await action()
    } catch (actionError) {
      setError(errorMessage(actionError))
    } finally {
      setBusyAction(null)
    }
  }

  const actions = useMemo<ModelManagementPanelActions>(() => ({
    onSelectConnection: connectionId => {
      const connection = snapshot.connections.find(item => item.id === connectionId)
      if (!connection) return
      setSelectedConnectionId(connectionId)
      setDraft(connectionDraft(connection))
      setCredentialDraft(INITIAL_MODEL_CREDENTIAL_DRAFT)
    },
    onCreateConnection: () => {
      setSelectedConnectionId(null)
      setDraft(newConnectionDraft(snapshot.catalog))
      setCredentialDraft(INITIAL_MODEL_CREDENTIAL_DRAFT)
    },
    onDraftChange: updates => setDraft(current => ({ ...current, ...updates })),
    onCredentialChange: setCredentialDraft,
    onSaveConnection: () => void runAction('save', async () => {
      const input = { ...draft, credential: credentialDraft }
      const saved = selectedConnectionId
        ? await modelManagementClient.updateConnection(selectedConnectionId, input)
        : await modelManagementClient.createConnection(input)
      await loadSnapshot(saved.id)
    }),
    onClearCredential: () => {
      if (!selectedConnectionId) return
      void runAction('credential', async () => {
        await modelManagementClient.updateConnection(selectedConnectionId, { ...draft, clearCredential: true })
        await loadSnapshot(selectedConnectionId)
      })
    },
    onTestConnection: connectionId => void runAction(`test:${connectionId}`, async () => {
      const result = await modelManagementClient.testConnection(connectionId)
      setTestResults(current => ({ ...current, [connectionId]: result }))
      const connections = await modelManagementClient.listConnections()
      setSnapshot(current => ({ ...current, connections }))
    }),
    onDeleteConnection: connectionId => void runAction('delete', async () => {
      await modelManagementClient.deleteConnection(connectionId)
      await loadSnapshot(null)
    }),
    onAssignmentChange: (slot, value) => void runAction(`assignment:${slot}`, async () => {
      const [connectionId, modelId] = value.split('::')
      if (!connectionId || !modelId) return
      const assignment = await modelManagementClient.updateAssignment(slot, { connectionId, modelId })
      setSnapshot(current => ({
        ...current,
        assignments: [...current.assignments.filter(item => item.slot !== slot), assignment]
      }))
    }),
    onReload: () => void loadSnapshot(selectedConnectionId)
  }), [credentialDraft, draft, selectedConnectionId, snapshot])

  return (
    <ModelManagementPanelContent
      snapshot={snapshot}
      selectedConnectionId={selectedConnectionId}
      draft={draft}
      credentialDraft={credentialDraft}
      busyAction={busyAction}
      testResults={testResults}
      error={error}
      actions={actions}
    />
  )
}

export function ModelManagementPanelContent({
  snapshot,
  selectedConnectionId,
  draft,
  credentialDraft,
  busyAction,
  testResults,
  error,
  actions
}: ModelManagementPanelContentProps) {
  const selectedConnection = snapshot.connections.find(connection => connection.id === selectedConnectionId) || null
  const selectedAssigned = selectedConnection
    ? snapshot.assignments.some(assignment => assignment.connectionId === selectedConnection.id)
    : false

  return (
    <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]" data-model-management-panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-950">模型服务</h2>
          <p className="mt-2 text-sm font-semibold text-gray-400">统一管理模型提供商连接、凭据与默认模型槽位。</p>
        </div>
        <div className="flex gap-2">
          <ActionButton onClick={actions.onReload} disabled={busyAction !== null} icon={<RefreshCw className="h-4 w-4" />}>
            重新读取
          </ActionButton>
          <ActionButton onClick={actions.onCreateConnection} icon={<Plus className="h-4 w-4" />}>
            新建连接
          </ActionButton>
        </div>
      </div>

      {error && <div role="alert" className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)]">
        <div>
          <h3 className="text-sm font-black text-gray-950">连接</h3>
          <div className="mt-3 space-y-3">
            {busyAction === 'load' && snapshot.connections.length === 0 ? (
              <div role="status" className="rounded-2xl bg-gray-50 p-5 text-sm font-semibold text-gray-400">正在加载模型连接…</div>
            ) : snapshot.connections.length === 0 ? (
              <div className="rounded-2xl bg-gray-50 p-5 text-sm font-semibold text-gray-500">尚未创建模型连接。</div>
            ) : snapshot.connections.map(connection => {
              const provider = snapshot.catalog.providers.find(item => item.id === connection.providerId)
              const models = snapshot.catalog.models.filter(model => model.providerId === connection.providerId)
              const testResult = testResults[connection.id]
              return (
                <div key={connection.id} className={`rounded-2xl border p-4 ${selectedConnectionId === connection.id ? 'border-gray-950 bg-gray-50' : 'border-gray-200'}`}>
                  <button type="button" className="w-full text-left" onClick={() => actions.onSelectConnection(connection.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-gray-950">{connection.displayName}</div>
                        <div className="mt-1 text-xs font-semibold text-gray-500">{provider?.displayName || connection.providerId}</div>
                      </div>
                      <CredentialStatus configured={connection.credentialConfigured} />
                    </div>
                    <div className="mt-3 truncate text-xs font-semibold text-gray-400">{connection.apiBase}</div>
                    {models.map(model => (
                      <div key={model.id} className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-gray-600">
                        <span className="font-black text-gray-800">{model.displayName}</span>
                        <span className="ml-2 font-semibold">{model.modality}</span>
                        {model.capabilities?.modes?.length ? (
                          <div className="mt-1 font-semibold text-gray-400">{model.capabilities.modes.join(' / ')}</div>
                        ) : null}
                      </div>
                    ))}
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
                    <ConnectionTestResult result={testResult} />
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                      onClick={() => actions.onTestConnection(connection.id)}
                      disabled={busyAction !== null || !connection.credentialConfigured}
                    >
                      {busyAction === `test:${connection.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                      测试连接
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 p-5">
          <h3 className="text-sm font-black text-gray-950">{selectedConnection ? '编辑连接' : '新建连接'}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="提供商">
              <select
                value={draft.providerId}
                onChange={event => {
                  const provider = snapshot.catalog.providers.find(item => item.id === event.target.value)
                  actions.onDraftChange({
                    providerId: event.target.value,
                    apiBase: provider?.defaultApiBase || draft.apiBase
                  })
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
              >
                <option value="">选择提供商</option>
                {snapshot.catalog.providers.map(provider => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}
              </select>
            </Field>
            <Field label="连接名称">
              <input value={draft.displayName} onChange={event => actions.onDraftChange({ displayName: event.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400" />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="API 地址">
              <input value={draft.apiBase} onChange={event => actions.onDraftChange({ apiBase: event.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400" />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="凭据" hint={selectedConnection?.credentialConfigured ? '留空保存会保留现有凭据' : '凭据仅提交到后端系统密钥环'}>
              <input
                type="password"
                autoComplete="new-password"
                value={credentialDraft}
                onChange={event => actions.onCredentialChange(event.target.value)}
                placeholder={selectedConnection?.credentialConfigured ? '已配置，留空保留' : '输入 API Key'}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm font-bold text-gray-700">
            <input type="checkbox" checked={draft.enabled} onChange={event => actions.onDraftChange({ enabled: event.target.checked })} />
            启用此连接
          </label>
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4">
            {selectedConnection?.credentialConfigured && (
              <ActionButton onClick={actions.onClearCredential} disabled={busyAction !== null} icon={<KeyRound className="h-4 w-4" />}>
                删除凭据
              </ActionButton>
            )}
            {selectedConnection && (
              <ActionButton onClick={() => actions.onDeleteConnection(selectedConnection.id)} disabled={busyAction !== null || selectedAssigned} icon={<Trash2 className="h-4 w-4" />}>
                删除连接
              </ActionButton>
            )}
            <button
              type="button"
              onClick={actions.onSaveConnection}
              disabled={busyAction !== null || !draft.providerId || !draft.displayName.trim() || !draft.apiBase.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-black text-white disabled:opacity-40"
            >
              {busyAction === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存连接
            </button>
          </div>
          {selectedAssigned && <p className="mt-3 text-right text-xs font-semibold text-gray-400">已分配的连接不能停用或删除。</p>}
        </div>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-6">
        <h3 className="text-sm font-black text-gray-950">默认模型槽位</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(['chat.primary', 'image.primary'] as ModelSlot[]).map(slot => (
            <AssignmentSelect
              key={slot}
              slot={slot}
              snapshot={snapshot}
              disabled={busyAction !== null}
              onChange={value => actions.onAssignmentChange(slot, value)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function AssignmentSelect({
  slot,
  snapshot,
  disabled,
  onChange
}: {
  slot: ModelSlot
  snapshot: ModelManagementSnapshot
  disabled: boolean
  onChange: (value: string) => void
}) {
  const modality = slot === 'chat.primary' ? 'chat' : 'image'
  const assignment = snapshot.assignments.find(item => item.slot === slot)
  const value = assignment ? `${assignment.connectionId}::${assignment.modelId}` : ''
  const options = snapshot.connections.flatMap(connection =>
    connection.enabled
      ? snapshot.catalog.models
        .filter(model => model.providerId === connection.providerId && model.modality === modality)
        .map(model => ({
          value: `${connection.id}::${model.id}`,
          label: `${connection.displayName} · ${model.displayName}`
        }))
      : []
  )
  return (
    <Field label={slot} hint={modality === 'chat' ? '聊天 Agent' : '图片生成'}>
      <select value={value} onChange={event => onChange(event.target.value)} disabled={disabled} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:opacity-50">
        <option value="">未分配</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  )
}

function CredentialStatus({ configured }: { configured: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
      {configured ? '凭据已配置' : '凭据未配置'}
    </span>
  )
}

function ConnectionTestResult({ result }: { result?: ModelConnectionTestResult }) {
  if (!result) return <span className="text-xs font-semibold text-gray-400">尚未测试</span>
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${result.success ? 'text-emerald-700' : 'text-red-700'}`}>
      {result.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {result.message}
    </span>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-black text-gray-950">{label}</span>
        {hint && <span className="text-xs font-semibold text-gray-400">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function ActionButton({
  onClick,
  disabled,
  icon,
  children
}: {
  onClick: () => void
  disabled?: boolean
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-black text-gray-700 hover:bg-gray-200 disabled:opacity-40">
      {icon}
      {children}
    </button>
  )
}

const connectionDraft = (connection: ModelConnection): ModelConnectionInput => ({
  providerId: connection.providerId,
  displayName: connection.displayName,
  apiBase: connection.apiBase,
  enabled: connection.enabled
})

const newConnectionDraft = (catalog: ModelCatalog): ModelConnectionInput => {
  const provider = catalog.providers[0]
  return {
    providerId: provider?.id || '',
    displayName: '',
    apiBase: provider?.defaultApiBase || '',
    enabled: true
  }
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)
