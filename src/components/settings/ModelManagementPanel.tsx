import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  XCircle
} from 'lucide-react'
import {
  modelManagementClient,
  type ImageGenerationStatus,
  type ModelAssignment,
  type ModelCatalog,
  type ModelConnection,
  type ModelConnectionInput,
  type ModelConnectionTestResult,
  type ModelModality,
  type ModelSlot
} from '@/services/model-management-client'

export const INITIAL_MODEL_CREDENTIAL_DRAFT = ''

export interface ModelManagementSnapshot {
  catalog: ModelCatalog
  connections: ModelConnection[]
  assignments: ModelAssignment[]
}

type ProviderStatus = ImageGenerationStatus['providers'][number]

interface ModelManagementPanelActions {
  onSelectConnection: (connectionId: string) => void
  onCreateConnection: () => void
  onDraftChange: (updates: Partial<ModelConnectionInput>) => void
  onCredentialChange: (credential: string) => void
  onSaveConnection: () => void
  onSaveAndTestConnection: () => void
  onCancelEdit: () => void
  onClearCredential: () => void
  onTestConnection: (connectionId: string) => void
  onDeleteConnection: (connectionId: string) => void
  onAssignmentChange: (slot: ModelSlot, value: string) => void
  onClearAssignment: (slot: ModelSlot) => void
  onReload: () => void
  onReloadImageStatus: () => void
}

interface ModelManagementPanelContentProps {
  modality: ModelModality
  snapshot: ModelManagementSnapshot
  imageStatus: ImageGenerationStatus | null
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

export function ModelManagementPanel({ modality, onAssignmentSaved }: {
  modality: ModelModality
  onAssignmentSaved?: (assignment: ModelAssignment) => void
}) {
  const [snapshot, setSnapshot] = useState<ModelManagementSnapshot>(EMPTY_SNAPSHOT)
  const [imageStatus, setImageStatus] = useState<ImageGenerationStatus | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ModelConnectionInput>(EMPTY_DRAFT)
  const [credentialDraft, setCredentialDraft] = useState(INITIAL_MODEL_CREDENTIAL_DRAFT)
  const [busyAction, setBusyAction] = useState<string | null>('load')
  const [testResults, setTestResults] = useState<Record<string, ModelConnectionTestResult>>({})
  const [error, setError] = useState<string | null>(null)

  const modalityConnections = (nextSnapshot: ModelManagementSnapshot, targetModality = modality) => {
    const providerIds = new Set(nextSnapshot.catalog.models
      .filter(model => model.modality === targetModality)
      .map(model => model.providerId))
    return nextSnapshot.connections.filter(connection => providerIds.has(connection.providerId))
  }

  const selectDraft = (
    nextSnapshot: ModelManagementSnapshot,
    preferredConnectionId?: string | null,
    targetModality = modality
  ) => {
    const connections = modalityConnections(nextSnapshot, targetModality)
    const selected = connections.find(connection => connection.id === preferredConnectionId) || connections[0] || null
    setSelectedConnectionId(selected?.id || null)
    setDraft(selected ? connectionDraft(selected) : newConnectionDraft(nextSnapshot.catalog, targetModality))
    setCredentialDraft(INITIAL_MODEL_CREDENTIAL_DRAFT)
  }

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
      selectDraft(nextSnapshot, preferredConnectionId)
    } catch (loadError) {
      setError(safeModelErrorMessage(loadError))
    } finally {
      setBusyAction(null)
    }
  }

  const loadImageStatus = async () => {
    try {
      setImageStatus(await modelManagementClient.getImageGenerationStatus())
    } catch (statusError) {
      setError(safeModelErrorMessage(statusError))
    }
  }

  useEffect(() => {
    void loadSnapshot()
    void loadImageStatus()
  }, [])

  useEffect(() => {
    selectDraft(snapshot, selectedConnectionId, modality)
  }, [modality])

  const runAction = async (name: string, action: () => Promise<void>, onError?: (message: string) => void) => {
    setBusyAction(name)
    setError(null)
    try {
      await action()
    } catch (actionError) {
      const message = safeModelErrorMessage(actionError)
      onError?.(message)
      setError(message)
    } finally {
      setBusyAction(null)
    }
  }

  const saveConnection = async (testAfterSave: boolean) => {
    const input = { ...draft, credential: credentialDraft }
    const saved = selectedConnectionId
      ? await modelManagementClient.updateConnection(selectedConnectionId, input)
      : await modelManagementClient.createConnection(input)
    setCredentialDraft(INITIAL_MODEL_CREDENTIAL_DRAFT)
    setTestResults(current => removeModelConnectionTestResult(current, saved.id))
    if (testAfterSave) await modelManagementClient.testConnection(saved.id)
    await loadSnapshot(saved.id)
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
      setDraft(newConnectionDraft(snapshot.catalog, modality))
      setCredentialDraft(INITIAL_MODEL_CREDENTIAL_DRAFT)
    },
    onDraftChange: updates => setDraft(current => ({ ...current, ...updates })),
    onCredentialChange: setCredentialDraft,
    onSaveConnection: () => void runAction('save', () => saveConnection(false)),
    onSaveAndTestConnection: () => void runAction('save-and-test', () => saveConnection(true)),
    onCancelEdit: () => selectDraft(snapshot, selectedConnectionId),
    onClearCredential: () => {
      if (!selectedConnectionId) return
      void runAction('credential', async () => {
        await modelManagementClient.updateConnection(selectedConnectionId, { ...draft, clearCredential: true })
        setCredentialDraft(INITIAL_MODEL_CREDENTIAL_DRAFT)
        setTestResults(current => removeModelConnectionTestResult(current, selectedConnectionId))
        await loadSnapshot(selectedConnectionId)
      })
    },
    onTestConnection: connectionId => void runAction(`test:${connectionId}`, async () => {
      const result = await modelManagementClient.testConnection(connectionId)
      setTestResults(current => recordModelConnectionTestResult(current, connectionId, result))
      const connections = await modelManagementClient.listConnections()
      setSnapshot(current => ({ ...current, connections }))
    }, message => {
      setTestResults(current => recordModelConnectionTestResult(current, connectionId, { success: false, message }))
    }),
    onDeleteConnection: connectionId => void runAction('delete', async () => {
      const dependencies = await modelManagementClient.getConnectionDependencies(connectionId)
      if (!dependencies.canvasNodeCountAvailable || dependencies.canvasNodeCount === null) {
        throw new Error('无法确认画布引用，已停止删除。请刷新后重试。')
      }
      if (dependencies.assignments.length || dependencies.canvasNodeCount) {
        throw new Error(dependencies.canvasNodeCount
          ? `该连接仍被 ${dependencies.canvasNodeCount} 个画布节点使用，请先解除引用。`
          : '该连接仍是默认模型，请先取消默认模型。')
      }
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
      onAssignmentSaved?.(assignment)
    }),
    onClearAssignment: slot => void runAction(`assignment:${slot}`, async () => {
      await modelManagementClient.clearAssignment(slot)
      setSnapshot(current => ({ ...current, assignments: current.assignments.filter(item => item.slot !== slot) }))
    }),
    onReload: () => void loadSnapshot(selectedConnectionId),
    onReloadImageStatus: () => void runAction('sdk-status', loadImageStatus)
  }), [credentialDraft, draft, imageStatus, modality, onAssignmentSaved, selectedConnectionId, snapshot])

  return (
    <ModelManagementPanelContent
      modality={modality}
      snapshot={snapshot}
      imageStatus={imageStatus}
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
  modality,
  snapshot,
  imageStatus,
  selectedConnectionId,
  draft,
  credentialDraft,
  busyAction,
  testResults,
  error,
  actions
}: ModelManagementPanelContentProps) {
  const slot: ModelSlot = modality === 'chat' ? 'chat.primary' : 'image.primary'
  const providerIds = new Set(snapshot.catalog.models
    .filter(model => model.modality === modality)
    .map(model => model.providerId))
  const providers = snapshot.catalog.providers.filter(provider => providerIds.has(provider.id))
  const connections = snapshot.connections.filter(connection => providerIds.has(connection.providerId))
  const selectedConnection = connections.find(connection => connection.id === selectedConnectionId) || null
  const selectedAssigned = selectedConnection
    ? snapshot.assignments.some(assignment => assignment.connectionId === selectedConnection.id)
    : false
  const provider = snapshot.catalog.providers.find(item => item.id === draft.providerId)
  const arkReadOnly = draft.providerId === 'volcengine-ark'

  return (
    <section className="rounded-[24px] border border-gray-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]" data-model-management-panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-950">{modality === 'image' ? '图片生成模型' : '文字模型'}</h2>
          <p className="mt-2 text-sm font-semibold text-gray-400">
            {modality === 'image' ? '管理图片生成服务、Ark SDK、连接与默认图片模型。' : '管理文字模型连接、凭据与默认文字模型。'}
          </p>
        </div>
        <div className="flex gap-2">
          <ActionButton onClick={actions.onReload} disabled={busyAction !== null} icon={<RefreshCw className="h-4 w-4" />}>刷新</ActionButton>
          <ActionButton onClick={actions.onCreateConnection} icon={<Plus className="h-4 w-4" />}>新建连接</ActionButton>
        </div>
      </div>

      {error && <div role="alert" className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      {modality === 'image' && (
        <ImageServiceChain snapshot={snapshot} imageStatus={imageStatus} busy={busyAction === 'sdk-status'} onReload={actions.onReloadImageStatus} />
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(420px,1.15fr)]">
        <div>
          <h3 className="text-sm font-black text-gray-950">账号连接</h3>
          <div className="mt-3 space-y-3">
            {busyAction === 'load' && connections.length === 0 ? (
              <div role="status" className="rounded-2xl bg-gray-50 p-5 text-sm font-semibold text-gray-400">正在加载连接…</div>
            ) : connections.length === 0 ? (
              <div className="rounded-2xl bg-gray-50 p-5 text-sm font-semibold text-gray-500">尚未创建此类模型连接。</div>
            ) : connections.map(connection => {
              const connectionProvider = snapshot.catalog.providers.find(item => item.id === connection.providerId)
              const models = snapshot.catalog.models.filter(model => model.providerId === connection.providerId && model.modality === modality)
              const testResult = testResults[connection.id]
              return (
                <div key={connection.id} className={`rounded-2xl border p-4 ${selectedConnectionId === connection.id ? 'border-gray-950 bg-gray-50' : 'border-gray-200'}`}>
                  <button type="button" className="w-full text-left" onClick={() => actions.onSelectConnection(connection.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-gray-950">{connection.displayName}</div>
                        <div className="mt-1 text-xs font-semibold text-gray-500">{connectionProvider?.displayName || connection.providerId}</div>
                      </div>
                      <CredentialStatus configured={connection.credentialConfigured} />
                    </div>
                    {models.map(model => (
                      <div key={model.id} className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-gray-600">
                        <span className="font-black text-gray-800">{model.displayName}</span>
                        {model.capabilities?.modes?.length ? <div className="mt-1 font-semibold text-gray-400">{model.capabilities.modes.join(' / ')}</div> : null}
                      </div>
                    ))}
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
                    <ConnectionTestResult result={testResult} persisted={connection.lastTest} />
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                      onClick={() => actions.onTestConnection(connection.id)}
                      disabled={busyAction !== null || !connection.credentialConfigured || !connection.enabled}
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
                  const nextProvider = providers.find(item => item.id === event.target.value)
                  actions.onDraftChange({ providerId: event.target.value, apiBase: nextProvider?.defaultApiBase || '' })
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
              >
                <option value="">选择提供商</option>
                {providers.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}
              </select>
            </Field>
            <Field label="连接名称">
              <input aria-label="连接名称" value={draft.displayName} onChange={event => actions.onDraftChange({ displayName: event.target.value })} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400" />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="API 地址" hint={arkReadOnly ? '火山方舟官方地址' : undefined}>
              <input
                aria-label="API 地址"
                value={arkReadOnly ? provider?.defaultApiBase || draft.apiBase : draft.apiBase}
                readOnly={arkReadOnly}
                onChange={event => actions.onDraftChange({ apiBase: event.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none read-only:bg-gray-100 read-only:text-gray-500 focus:border-gray-400"
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="API Key" hint={selectedConnection?.credentialConfigured ? '留空保存会保留现有凭据' : '仅提交到系统凭据库'}>
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
              <ActionButton onClick={actions.onClearCredential} disabled={busyAction !== null} icon={<KeyRound className="h-4 w-4" />}>删除凭据</ActionButton>
            )}
            {selectedConnection && (
              <ActionButton onClick={() => actions.onDeleteConnection(selectedConnection.id)} disabled={busyAction !== null || selectedAssigned} icon={<Trash2 className="h-4 w-4" />}>删除连接</ActionButton>
            )}
            <ActionButton onClick={actions.onCancelEdit} disabled={busyAction !== null} icon={<XCircle className="h-4 w-4" />}>取消</ActionButton>
            <button type="button" onClick={actions.onSaveConnection} disabled={!canSave(draft, busyAction)} className="inline-flex items-center gap-2 rounded-xl bg-gray-200 px-4 py-2 text-sm font-black text-gray-800 disabled:opacity-40">
              <Save className="h-4 w-4" />仅保存
            </button>
            <button type="button" onClick={actions.onSaveAndTestConnection} disabled={!canSave(draft, busyAction)} className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-black text-white disabled:opacity-40">
              {busyAction === 'save-and-test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}保存并测试
            </button>
          </div>
          {selectedAssigned && <p className="mt-3 text-right text-xs font-semibold text-gray-400">该连接正在作为默认模型使用，取消默认模型后才能删除。</p>}
        </div>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-6">
        <h3 className="text-sm font-black text-gray-950">{modality === 'image' ? '默认图片模型' : '默认文字模型'}</h3>
        <div className="mt-3 max-w-xl">
          <AssignmentSelect
            slot={slot}
            snapshot={snapshot}
            providerStatus={modality === 'image' ? imageStatus?.providers.find(item => item.providerId === 'volcengine-ark') : undefined}
            disabled={busyAction !== null}
            onChange={value => value ? actions.onAssignmentChange(slot, value) : actions.onClearAssignment(slot)}
          />
        </div>
      </div>
    </section>
  )
}

function ImageServiceChain({
  snapshot,
  imageStatus,
  busy,
  onReload
}: {
  snapshot: ModelManagementSnapshot
  imageStatus: ImageGenerationStatus | null
  busy: boolean
  onReload: () => void
}) {
  const provider = snapshot.catalog.providers.find(item => item.id === 'volcengine-ark')
  const model = snapshot.catalog.models.find(item => item.providerId === 'volcengine-ark' && item.modality === 'image')
  const status = imageStatus?.providers.find(item => item.providerId === 'volcengine-ark')
  const ready = Boolean(imageStatus?.serverEnabled && imageStatus.credentialStore.available && status?.status === 'ready' && status.sdk.compatible)
  const steps = [provider?.displayName || '火山方舟', 'Ark SDK', '账号连接', model?.displayName || 'Seedream 5.0 Pro', '默认图片模型']
  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4" aria-label="图片生成服务链路" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, index) => (
          <div key={step} className="contents">
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-800">{step}</div>
            {index < steps.length - 1 && <ArrowRight aria-hidden="true" className="h-4 w-4 text-gray-300" />}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
        <div className="text-xs font-semibold text-gray-500">
          <span className={ready ? 'font-black text-emerald-700' : 'font-black text-amber-700'}>{ready ? '服务可用' : sdkStatusLabel(status, imageStatus)}</span>
          {status && <span className="ml-3">{status.sdk.packageName} · 当前 {status.sdk.installedVersion || '未安装'} · 要求 {status.sdk.requiredVersion}</span>}
        </div>
        <button type="button" onClick={onReload} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-gray-700 disabled:opacity-40">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}重新检测
        </button>
      </div>
    </div>
  )
}

function AssignmentSelect({
  slot,
  snapshot,
  providerStatus,
  disabled,
  onChange
}: {
  slot: ModelSlot
  snapshot: ModelManagementSnapshot
  providerStatus?: ProviderStatus
  disabled: boolean
  onChange: (value: string) => void
}) {
  const modality: ModelModality = slot === 'chat.primary' ? 'chat' : 'image'
  const assignment = snapshot.assignments.find(item => item.slot === slot)
  const value = assignment ? `${assignment.connectionId}::${assignment.modelId}` : ''
  const candidates = snapshot.connections.flatMap(connection => snapshot.catalog.models
    .filter(model => model.providerId === connection.providerId && model.modality === modality)
    .map(model => ({
      connection,
      model,
      reason: assignmentDisabledReason(connection, modality === 'image' ? providerStatus : undefined, modality === 'image')
    })))
  const currentReason = candidates.find(candidate => `${candidate.connection.id}::${candidate.model.id}` === value)?.reason
  return (
    <Field label="选择默认模型" hint={modality === 'chat' ? '用于聊天 Agent' : '用于图片生成节点'}>
      <select value={value} onChange={event => onChange(event.target.value)} disabled={disabled} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:opacity-50">
        <option value="">未设置默认模型</option>
        {candidates.map(candidate => (
          <option key={`${candidate.connection.id}::${candidate.model.id}`} value={`${candidate.connection.id}::${candidate.model.id}`} disabled={Boolean(candidate.reason)}>
            {candidate.connection.displayName} · {candidate.model.displayName}{candidate.reason ? `（${candidate.reason}）` : ''}
          </option>
        ))}
      </select>
      {currentReason && <span className="mt-2 block text-xs font-bold text-amber-700">当前默认模型不可用：{currentReason}</span>}
    </Field>
  )
}

export function assignmentDisabledReason(
  connection: ModelConnection,
  providerStatus?: ProviderStatus,
  requireProviderStatus = false
): string | null {
  if (!connection.enabled) return '连接已停用'
  if (!connection.credentialConfigured) return '尚未配置凭据'
  if (!connection.lastTest) return '请先测试连接'
  if (!connection.lastTest.ok) return '最近一次连接测试未通过'
  if (requireProviderStatus && !providerStatus) return '正在检测 Ark SDK 状态'
  if (providerStatus) {
    if (providerStatus.status === 'incompatible' || !providerStatus.sdk.compatible) return 'Ark SDK 版本不兼容'
    if (providerStatus.status === 'missing') return 'Ark SDK 尚未安装'
    if (providerStatus.status === 'check_failed') return 'Ark SDK 检测失败'
    if (providerStatus.status !== 'ready') return '图片生成服务尚未就绪'
  }
  return null
}

function CredentialStatus({ configured }: { configured: boolean }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{configured ? '凭据已配置' : '凭据未配置'}</span>
}

function ConnectionTestResult({ result, persisted }: { result?: ModelConnectionTestResult; persisted?: ModelConnection['lastTest'] }) {
  if (result) {
    return <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${result.success ? 'text-emerald-700' : 'text-red-700'}`}>{result.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{result.success ? '连接测试通过' : '连接测试未通过'}</span>
  }
  if (!persisted) return <span className="text-xs font-semibold text-gray-400">尚未测试</span>
  return (
    <span className={`text-xs font-bold ${persisted.ok ? 'text-emerald-700' : 'text-red-700'}`}>
      {persisted.ok ? '连接测试通过' : '连接测试未通过'}
      <span className="ml-2 font-semibold text-gray-400">上次检测 {formatCheckedAt(persisted.checkedAt)}</span>
    </span>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-2 flex items-center justify-between gap-3"><span className="text-sm font-black text-gray-950">{label}</span>{hint && <span className="text-xs font-semibold text-gray-400">{hint}</span>}</span>{children}</label>
}

function ActionButton({ onClick, disabled, icon, children }: { onClick: () => void; disabled?: boolean; icon: ReactNode; children: ReactNode }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-black text-gray-700 hover:bg-gray-200 disabled:opacity-40">{icon}{children}</button>
}

const canSave = (draft: ModelConnectionInput, busyAction: string | null) => busyAction === null && Boolean(draft.providerId && draft.displayName.trim() && draft.apiBase.trim())

const connectionDraft = (connection: ModelConnection): ModelConnectionInput => ({
  providerId: connection.providerId,
  displayName: connection.displayName,
  apiBase: connection.apiBase,
  enabled: connection.enabled
})

const newConnectionDraft = (catalog: ModelCatalog, modality: ModelModality): ModelConnectionInput => {
  const providerIds = new Set(catalog.models.filter(model => model.modality === modality).map(model => model.providerId))
  const provider = catalog.providers.find(item => providerIds.has(item.id))
  return { providerId: provider?.id || '', displayName: '', apiBase: provider?.defaultApiBase || '', enabled: true }
}

const sdkStatusLabel = (status: ProviderStatus | undefined, imageStatus: ImageGenerationStatus | null) => {
  if (!imageStatus) return '正在检测服务状态'
  if (!imageStatus.serverEnabled) return '图片生成服务未启用'
  if (!imageStatus.credentialStore.available) return '系统凭据库不可用'
  if (!status) return '未检测到火山方舟 Provider'
  if (status.status === 'missing') return 'Ark SDK 尚未安装'
  if (status.status === 'incompatible') return 'Ark SDK 版本不兼容'
  if (status.status === 'check_failed') return 'Ark SDK 检测失败'
  return status.status === 'ready' ? '服务可用' : '图片生成服务尚未就绪'
}

const formatCheckedAt = (value: number) => {
  if (!value) return '未知'
  const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value
  return new Date(milliseconds).toLocaleString('zh-CN', { hour12: false })
}

const SAFE_ERROR_COPY: Record<string, string> = {
  credential_missing: '尚未配置凭据，请更新 API Key。',
  credential_store_unavailable: '系统凭据库不可用，暂时无法安全保存 API Key。',
  connection_disabled: '连接已停用，请先启用连接。',
  connection_not_tested: '请先测试连接。',
  ark_sdk_missing: 'Ark SDK 尚未安装或无法导入，请重新检测。',
  ark_sdk_incompatible: 'Ark SDK 版本不兼容，请重新检测。',
  ark_sdk_check_failed: 'Ark SDK 检测失败，请重新检测。'
}

const safeModelErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error)
  try {
    const payload = JSON.parse(raw) as { code?: string; message?: string }
    if (payload.code && SAFE_ERROR_COPY[payload.code]) return SAFE_ERROR_COPY[payload.code]
    return payload.message || '模型服务操作失败，请稍后重试。'
  } catch {
    return raw.length <= 160 && !/[A-Z]:\\|Traceback|https?:\/\//i.test(raw)
      ? raw
      : '模型服务操作失败，请稍后重试。'
  }
}

export const recordModelConnectionTestResult = (
  current: Record<string, ModelConnectionTestResult>,
  connectionId: string,
  result: ModelConnectionTestResult
): Record<string, ModelConnectionTestResult> => ({ ...current, [connectionId]: result })

const removeModelConnectionTestResult = (
  current: Record<string, ModelConnectionTestResult>,
  connectionId: string
): Record<string, ModelConnectionTestResult> => Object.fromEntries(
  Object.entries(current).filter(([id]) => id !== connectionId)
)
