import { Database, Home, Image, MessageSquare, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { AIChatbotBox } from '@/components/AgentCollaborationPanel'
import { buildStoryboardWorkspaceContext } from '@/utils/agent-workspace'
import {
  addStoryboardRow,
  addStoryboardSequence,
  deleteStoryboardRow,
  deleteStoryboardSequence,
  duplicateStoryboardRow,
  moveStoryboardRow
} from '@/domain/storyboard/storyboard-operations'
import type { AgentWorkspaceProposal } from '@/models/Agent.model'
import type { IPromptProject, IStoryboardProject, IStoryboardRow, IStoryboardSequence } from '@/models/PromptHistory.model'

export const StoryboardBuilderScreen = ({
  activeProject,
  storyboard,
  onBack,
  onRenameProject,
  onSave,
  onChange,
  previewMode = false
}: {
  activeProject: IPromptProject
  storyboard: IStoryboardProject
  onBack: () => void
  onRenameProject?: () => void
  onSave: () => void
  onChange: (storyboard: IStoryboardProject) => void
  previewMode?: boolean
}) => {
  const sequences = storyboard.sequences
  const activeSequence = sequences.find(sequence => sequence.id === storyboard.selectedSequenceId) || sequences[0]
  const activeSequenceIndex = Math.max(0, sequences.findIndex(sequence => sequence.id === activeSequence?.id))
  const selectedRow = activeSequence?.rows.find(row => row.id === storyboard.selectedRowId) || activeSequence?.rows[0] || null

  const updateStoryboard = (updates: Partial<IStoryboardProject>) => {
    onChange({ ...storyboard, ...updates })
  }

  const updateSequence = (sequenceId: string, updates: Partial<IStoryboardSequence>) => {
    const updatedAt = Date.now()
    updateStoryboard({
      sequences: sequences.map(sequence => sequence.id === sequenceId ? { ...sequence, ...updates, updatedAt } : sequence)
    })
  }

  const updateRow = (rowId: string, updates: Partial<IStoryboardRow>) => {
    if (!activeSequence) return
    const updatedAt = Date.now()
    updateSequence(activeSequence.id, {
      rows: activeSequence.rows.map(row => row.id === rowId ? { ...row, ...updates, updatedAt } : row)
    })
  }

  const workspaceContext = buildStoryboardWorkspaceContext({ activeProject, storyboard })

  const handleApplyStoryboardAgentProposal = (proposal: AgentWorkspaceProposal) => {
    if (proposal.kind !== 'storyboard_update') return
    const sequenceId = proposal.sequenceId || activeSequence?.id
    const rowId = proposal.rowId || selectedRow?.id
    if (sequenceId && proposal.sequenceUpdates) {
      updateSequence(sequenceId, proposal.sequenceUpdates)
    }
    if (rowId && proposal.rowUpdates) {
      const targetSequence = sequences.find(sequence => sequence.rows.some(row => row.id === rowId))
      if (!targetSequence) return
      const updatedAt = Date.now()
      updateStoryboard({
        sequences: sequences.map(sequence => sequence.id === targetSequence.id
          ? { ...sequence, rows: sequence.rows.map(row => row.id === rowId ? { ...row, ...proposal.rowUpdates, updatedAt } : row), updatedAt }
          : sequence)
      })
    }
  }

  const selectSequence = (sequenceId: string) => {
    const nextSequence = sequences.find(sequence => sequence.id === sequenceId)
    if (!nextSequence) return
    updateStoryboard({
      selectedSequenceId: nextSequence.id,
      selectedRowId: nextSequence.rows[0]?.id || null
    })
  }

  const addSequence = () => {
    updateStoryboard(addStoryboardSequence(storyboard))
  }

  const deleteSequence = (sequenceId: string) => {
    updateStoryboard(deleteStoryboardSequence(storyboard, sequenceId))
  }

  const addRow = () => {
    updateStoryboard(addStoryboardRow(storyboard))
  }

  const duplicateRow = (rowId: string) => {
    updateStoryboard(duplicateStoryboardRow(storyboard, rowId))
  }

  const deleteRow = (rowId: string) => {
    updateStoryboard(deleteStoryboardRow(storyboard, rowId))
  }

  const moveRow = (rowId: string, direction: -1 | 1) => {
    updateStoryboard(moveStoryboardRow(storyboard, rowId, direction))
  }

  const handleImageUpload = (rowId: string, file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      updateRow(rowId, { imageUrl: String(reader.result || '') })
    }
    reader.readAsDataURL(file)
  }

  return (
    <section className="min-h-[calc(100vh-168px)] bg-[#f7f8fb] px-6 pb-10 pt-7">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <button className="mb-3 text-sm font-semibold text-gray-500 transition hover:text-gray-950" onClick={onBack}>
            <Home className="h-4 w-4" />
            项目
          </button>
          <div className="flex items-center gap-2">
            <h1 className="break-words text-3xl font-bold">{activeProject.title}</h1>
            {onRenameProject && (
              <button
                type="button"
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900"
                onClick={onRenameProject}
                title="重命名项目"
                aria-label="重命名项目"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">按序列组织风格、约束和单镜头字段。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
            value={storyboard.aspectRatio}
            onChange={(event) => updateStoryboard({ aspectRatio: event.target.value as IStoryboardProject['aspectRatio'] })}
          >
            <option value="16:9">16:9 </option>
            <option value="9:16">9:16 </option>
            <option value="1:1">1:1 </option>
          </select>
          <button className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200" onClick={addSequence}>
            <Plus className="h-4 w-4" />
            新增序列
          </button>
          <button className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800" onClick={onSave}>
            <Database className="h-4 w-4" />
            {previewMode ? '预览不保存' : '保存'}
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap gap-2">
            {sequences.map((sequence, index) => (
              <div
                key={sequence.id}
                className={`group flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold transition ${sequence.id === activeSequence?.id ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
              >
                <button onClick={() => selectSequence(sequence.id)}>
                  Sequence {index + 1}
                </button>
                <button
                  className={`rounded-full p-1 transition ${sequences.length <= 1 ? 'cursor-not-allowed opacity-30' : sequence.id === activeSequence?.id ? 'text-white/70 hover:bg-white/15 hover:text-white' : 'text-gray-400 opacity-0 hover:bg-gray-200 hover:text-red-500 group-hover:opacity-100'}`}
                  title={sequences.length <= 1 ? '至少保留一个序列' : '删除序列'}
                  aria-label="删除序列"
                  disabled={sequences.length <= 1}
                  onClick={(event) => {
                    event.stopPropagation()
                    deleteSequence(sequence.id)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {activeSequence && (
            <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-[18px] border border-gray-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Sequence {activeSequenceIndex + 1}</div>
                <input
                  className="mt-1 w-full rounded-xl border border-transparent bg-transparent px-0 py-1 text-lg font-bold text-gray-950 focus:border-gray-200 focus:bg-gray-50 focus:px-3"
                  value={activeSequence.name}
                  onChange={(event) => updateSequence(activeSequence.id, { name: event.target.value })}
                />
                <textarea
                  className="mt-1 min-h-[54px] w-full resize-y rounded-xl border border-transparent bg-transparent px-0 py-1 text-sm leading-relaxed text-gray-500 focus:border-gray-200 focus:bg-gray-50 focus:px-3"
                  value={activeSequence.description}
                  onChange={(event) => updateSequence(activeSequence.id, { description: event.target.value })}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <StoryboardSequenceField
                  label=""
                  value={activeSequence.style}
                  onChange={(value) => updateSequence(activeSequence.id, { style: value })}
                  placeholder="例如：AI 短片、写实摄影、柔和光线。"
                />
                <StoryboardSequenceField
                  label="约束"
                  value={activeSequence.constraints}
                  onChange={(value) => updateSequence(activeSequence.id, { constraints: value })}
                  placeholder="例如：9:16 竖屏，每段 15 秒，人物站位一致。"
                />
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-[24px] border border-gray-200 bg-[#11151c] shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="grid grid-cols-[120px_minmax(240px,0.65fr)_minmax(520px,1.35fr)] border-b border-white/10 bg-[#161b24] text-sm font-semibold text-gray-200">
            <div className="px-4 py-3">Cut / 时长</div>
            <div className="border-l border-white/10 px-4 py-3">参考帧</div>
            <div className="border-l border-white/10 px-4 py-3">镜头字段</div>
          </div>

          {activeSequence?.rows.map((row, index) => (
            <div
              key={row.id}
              className={`grid min-h-[260px] cursor-pointer grid-cols-[120px_minmax(240px,0.65fr)_minmax(520px,1.35fr)] border-b border-white/10 transition ${
                storyboard.selectedRowId === row.id ? 'bg-[#1d2633]' : 'bg-[#121821] hover:bg-[#171f2a]'
              }`}
              onClick={() => updateStoryboard({ selectedRowId: row.id })}
            >
              <div className="flex flex-col justify-between px-4 py-4 text-gray-100">
                <div>
                  <input
                    className="w-full rounded-lg border-white/10 bg-white/5 px-2 py-1 text-sm font-bold text-white"
                    value={row.cutLabel}
                    onChange={(event) => updateRow(row.id, { cutLabel: event.target.value })}
                  />
                  <input
                    className="mt-3 w-full rounded-lg border-white/10 bg-white/5 px-2 py-2 text-sm font-semibold leading-relaxed text-gray-100"
                    placeholder="4 秒"
                    value={row.duration || ''}
                    onChange={(event) => updateRow(row.id, { duration: event.target.value })}
                  />
                  <textarea
                    className="mt-3 min-h-[64px] w-full rounded-lg border-white/10 bg-white/5 px-2 py-2 text-sm font-semibold leading-relaxed text-gray-100"
                    placeholder="00:04-00:07"
                    value={row.timeRange}
                    onChange={(event) => updateRow(row.id, { timeRange: event.target.value })}
                  />
                </div>
                <div className="flex gap-1 text-gray-400">
                  <button className="rounded p-1 hover:bg-white/10" onClick={(event) => { event.stopPropagation(); moveRow(row.id, -1) }} disabled={index === 0}>↑</button>
                  <button className="rounded p-1 hover:bg-white/10" onClick={(event) => { event.stopPropagation(); moveRow(row.id, 1) }} disabled={index === (activeSequence?.rows.length || 0) - 1}>↓</button>
                </div>
              </div>

              <div className="relative border-l border-white/10">
                {row.imageUrl ? (
                  <img src={row.imageUrl} alt={row.cutLabel} className="h-full min-h-[260px] w-full object-cover" />
                ) : (
                  <label className="flex h-full min-h-[260px] cursor-pointer flex-col items-center justify-center bg-[#202834] text-gray-400 transition hover:bg-[#263142]">
                    <Image className="mb-3 h-10 w-10" />
                    <span className="text-sm font-semibold">图片</span>
                    <span className="mt-1 text-xs text-gray-500">上传参考帧</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageUpload(row.id, event.target.files?.[0])} />
                  </label>
                )}
                {row.imageUrl && (
                  <label className="absolute bottom-3 right-3 cursor-pointer rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black">
                    替换图片
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageUpload(row.id, event.target.files?.[0])} />
                  </label>
                )}
              </div>

              <div className="border-l border-white/10 p-4 text-gray-100">
                <div className="grid gap-2 md:grid-cols-2">
                  <StoryboardMiniField label="主体" value={row.subject || ''} onChange={(value) => updateRow(row.id, { subject: value })} />
                  <StoryboardMiniField label="动作" value={row.action || ''} onChange={(value) => updateRow(row.id, { action: value })} />
                  <StoryboardMiniField label="场景" value={row.scene || ''} onChange={(value) => updateRow(row.id, { scene: value })} />
                  <StoryboardMiniField label="镜头" value={row.camera || ''} onChange={(value) => updateRow(row.id, { camera: value })} />
                  <StoryboardMiniField label="灯光" value={row.lighting || ''} onChange={(value) => updateRow(row.id, { lighting: value })} />
                  <StoryboardMiniField label="音频" value={row.audio || ''} onChange={(value) => updateRow(row.id, { audio: value })} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/15" onClick={(event) => { event.stopPropagation(); duplicateRow(row.id) }}>
                    复制
                  </button>
                  <button className="rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/25" onClick={(event) => { event.stopPropagation(); deleteRow(row.id) }} disabled={(activeSequence?.rows.length || 0) <= 1}>
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div className="sticky bottom-0 border-t border-white/10 bg-[#0f141c]/95 p-4 backdrop-blur">
            <button className="w-full rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm font-bold text-gray-100 transition hover:bg-white/10" onClick={addRow}>
              <Plus className="h-4 w-4" />
              新增镜头
            </button>
          </div>
          </div>
        </div>

        {!previewMode && (
        <AIChatbotBox
          title="Storyboard Agent"
          mode="storyboard-workspace"
          workspaceContext={workspaceContext}
          onApplyWorkspaceProposal={handleApplyStoryboardAgentProposal}
        />
        )}
      </div>
    </section>
  )
}

const StoryboardMiniField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <label className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 text-sm">
    <span className="font-bold text-gray-300">{label}:</span>
    <textarea
      className="min-h-[42px] resize-y rounded-lg border-white/10 bg-white/5 px-2 py-1.5 leading-relaxed text-gray-100 placeholder:text-gray-500"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={`填写${label}`}
    />
  </label>
)

const StoryboardSequenceField = ({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) => (
  <label className="block rounded-[18px] border border-gray-200 bg-white p-4">
    <span className="mb-2 block text-sm font-bold text-gray-950">{label}</span>
    <textarea
      className="min-h-[74px] w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  </label>
)

export const StoryboardAgentPanel = ({
  projectTitle,
  sequenceNumber,
  sequence,
  selectedRow,
  draft,
  onDraftChange,
  onSend
}: {
  projectTitle: string
  sequenceNumber: number
  sequence?: IStoryboardSequence
  selectedRow: IStoryboardRow | null
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
}) => (
  <aside className="sticky top-24 flex h-[calc(100vh-136px)] min-h-[620px] flex-col rounded-[24px] border border-gray-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
    <div className="border-b border-gray-100 p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        <MessageSquare className="h-4 w-4" />
        Agent 对话
      </div>
      <h2 className="text-lg font-bold text-gray-950">Storyboard Agent</h2>
      <div className="mt-3 space-y-1 rounded-2xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
        <div>项目：{projectTitle}</div>
        <div>序列：Sequence {sequenceNumber}{sequence ? ` · ${sequence.name}` : ''}</div>
        <div>镜头：{selectedRow?.cutLabel || '未选择镜头'}</div>
      </div>
    </div>
    <div className="flex-1 space-y-3 overflow-y-auto p-5">
      <div className="rounded-2xl bg-gray-100 px-4 py-3 text-sm leading-relaxed text-gray-600">
        Agent 会读取当前镜头序列、分析镜头字段，并返回可应用的建议。当前版本先保留对话入口和上下文。
      </div>
      {sequence && (
        <div className="rounded-2xl border border-gray-100 px-4 py-3 text-xs leading-relaxed text-gray-500">
          <div className="font-bold text-gray-700">当前序列上下文</div>
          <div className="mt-2">风格：{sequence.style || '未填写'}</div>
          <div>约束：{sequence.constraints || '未填写'}</div>
          <div>镜头数：{sequence.rows.length}</div>
        </div>
      )}
    </div>
    <div className="border-t border-gray-100 p-4">
      <textarea
        className="min-h-[92px] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="和 Agent 讨论当前镜头序列..."
      />
      <button
        className="mt-3 w-full rounded-full bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
        onClick={onSend}
        disabled={!draft.trim()}
      >
        <Send className="h-4 w-4" />
        ?      </button>
    </div>
  </aside>
)
