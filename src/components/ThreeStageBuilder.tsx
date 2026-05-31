import { useMemo, useState } from 'react'
import { Bot, ChevronDown, Copy, Database, Eraser, Home, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { AIChatbotBox } from '@/components/AgentCollaborationPanel'
import { buildThreeStageWorkspaceContext } from '@/utils/agent-workspace'
import type { IPreset } from '@/models/Card.model'
import type { IPromptProject, IThreeStageProject, IThreeStageSection, ThreeStageKey } from '@/models/PromptHistory.model'
import type { AgentWorkspaceProposal } from '@/models/Agent.model'
import {
  buildStoryboardInjectionForVideo,
  createStoryboardShotRange,
  getStageDefinition,
  parseStoryboardShotRanges,
  stageDefinitions,
  stringifyStoryboardShotRanges,
  valueOf
} from '@/domain/three-stage/three-stage-definitions'
import type { FieldDefinition, StoryboardShotRange } from '@/domain/three-stage/three-stage-definitions'

const getSection = (threeStage: IThreeStageProject, stage: ThreeStageKey): IThreeStageSection => threeStage[stage]

interface ThreeStageBuilderScreenProps {
  activeProject: IPromptProject
  threeStage: IThreeStageProject
  cameraPresets: IPreset[]
  onBack: () => void
  onRenameProject?: () => void
  onSave: () => void
  onChange: (threeStage: IThreeStageProject) => void
  onIncrementPresetUsage: (id: string) => Promise<void>
  previewMode?: boolean
}

const ThreeStageBuilderScreen = ({
  activeProject,
  threeStage,
  cameraPresets,
  onBack,
  onRenameProject,
  onSave,
  onChange,
  onIncrementPresetUsage,
  previewMode = false
}: ThreeStageBuilderScreenProps) => {
  const [presetSearch, setPresetSearch] = useState('')
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())
  const [activeShotRangeByField, setActiveShotRangeByField] = useState<Record<string, string>>({})
  const [rightPanelMode, setRightPanelMode] = useState<'field' | 'agent'>('field')
  const selectedStage = getStageDefinition(threeStage.selectedStage).key
  const selectedStageDefinition = getStageDefinition(selectedStage)
  const selectedField = selectedStageDefinition.fields.find(field => field.id === threeStage.selectedFieldId && !field.fixedValue) ||
    selectedStageDefinition.fields.find(field => !field.fixedValue) ||
    selectedStageDefinition.fields[0]
  const selectedValue = valueOf(getSection(threeStage, selectedStage).fields, selectedField.id)
  const selectedFieldIsFixed = Boolean(selectedField.fixedValue)
  const selectedOutput = selectedStageDefinition.buildOutput(getSection(threeStage, selectedStage).fields, threeStage)
  const workspaceContext = buildThreeStageWorkspaceContext({
    activeProject,
    threeStage,
    selectedOutput
  })

  const filteredCameraPresets = useMemo(() => {
    const keyword = presetSearch.trim().toLowerCase()
    if (!keyword) return cameraPresets
    return cameraPresets.filter(preset =>
      preset.label.toLowerCase().includes(keyword) ||
      preset.content.toLowerCase().includes(keyword)
    )
  }, [cameraPresets, presetSearch])

  const updateSection = (stage: ThreeStageKey, section: IThreeStageSection): void => {
    onChange({
      ...threeStage,
      [stage]: section
    })
  }

  const selectField = (stage: ThreeStageKey, fieldId: string): void => {
    const section = getSection(threeStage, stage)
    onChange({
      ...threeStage,
      [stage]: {
        ...section,
        focusedFieldId: fieldId,
        updatedAt: Date.now()
      },
      selectedStage: stage,
      selectedFieldId: fieldId
    })
  }

  const updateField = (stage: ThreeStageKey, fieldId: string, value: string): void => {
    const section = getSection(threeStage, stage)
    updateSection(stage, {
      ...section,
      fields: {
        ...section.fields,
        [fieldId]: value
      },
      focusedFieldId: fieldId,
      updatedAt: Date.now()
    })
  }

  const copyText = async (text: string, emptyMessage = '暂无可复制内容。') => {
    if (!text.trim()) {
      window.alert(emptyMessage)
      return
    }
    await navigator.clipboard.writeText(text)
    window.alert('已复制到剪贴板。')
  }

  const handleApplyAgentProposal = (proposal: AgentWorkspaceProposal): void => {
    if (proposal.kind !== 'three_stage_field_update') return
    const stage = stageDefinitions.find(definition => definition.key === proposal.stageKey)?.key
    if (!stage) return
    const field = getStageDefinition(stage).fields.find(candidate => candidate.id === proposal.fieldId && !candidate.fixedValue)
    if (!field) return
    const currentValue = valueOf(getSection(threeStage, stage).fields, field.id)
    const nextValue = proposal.mode === 'append' && currentValue.trim()
      ? `${currentValue}\n${proposal.content}`
      : proposal.content
    updateField(stage, field.id, nextValue)
  }

  const applyPreset = async (preset: IPreset, mode: 'append' | 'replace') => {
    if (selectedField.kind === 'shotRanges') {
      const fieldSelectionKey = fieldKey(selectedStage, selectedField.id)
      const ranges = parseStoryboardShotRanges(getSection(threeStage, selectedStage).fields, selectedField.id)
      const activeRangeId = activeShotRangeByField[fieldSelectionKey] || ranges[0]?.id
      const nextRanges = ranges.map(range => {
        if (range.id !== activeRangeId) return range
        const nextContent = mode === 'replace'
          ? preset.content
          : range.content.trim()
            ? `${range.content}\n${preset.content}`
            : preset.content
        return { ...range, content: nextContent }
      })
      updateField(selectedStage, selectedField.id, stringifyStoryboardShotRanges(nextRanges))
      await onIncrementPresetUsage(preset.id)
      return
    }

    const nextValue = mode === 'replace'
      ? preset.content
      : selectedValue
        ? `${selectedValue}\n${preset.content}`
        : preset.content
    updateField(selectedStage, selectedField.id, nextValue)
    await onIncrementPresetUsage(preset.id)
  }

  const updateStoryboardShotRanges = (stage: ThreeStageKey, fieldId: string, ranges: StoryboardShotRange[]): void => {
    updateField(stage, fieldId, stringifyStoryboardShotRanges(ranges))
  }

  const selectShotRange = (stage: ThreeStageKey, fieldId: string, rangeId: string): void => {
    setActiveShotRangeByField(current => ({
      ...current,
      [fieldKey(stage, fieldId)]: rangeId
    }))
    selectField(stage, fieldId)
  }

  const fieldKey = (stage: ThreeStageKey, fieldId: string): string => `${stage}:${fieldId}`

  const toggleFieldDrawer = (stage: ThreeStageKey, fieldId: string): void => {
    const key = fieldKey(stage, fieldId)
    setExpandedFields(current => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
    selectField(stage, fieldId)
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
          <p className="mt-1 text-sm text-gray-500">三段式构建：人物版、故事版、视频生成提示词分别输出。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
            onClick={() => copyText(selectedOutput, '当前阶段还没有填写任何结构化内容。')}
          >
            <Copy className="h-4 w-4" />
            复制当前阶段
          </button>
          <button className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800" onClick={onSave}>
            <Database className="h-4 w-4" />
            {previewMode ? '预览不保存' : '保存'}
          </button>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          {stageDefinitions.map(stage => {
            const section = getSection(threeStage, stage.key)
            const output = stage.buildOutput(section.fields, threeStage)
            const injectedStoryboardText = stage.key === 'videoPrompt'
              ? buildStoryboardInjectionForVideo(threeStage.storyboard.fields)
              : ''
            return (
              <section key={stage.key} className="flex min-h-[760px] flex-col rounded-[24px] border border-gray-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
                <div className="border-b border-gray-100 p-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Three-stage</div>
                  <h2 className="text-xl font-bold text-gray-950">{stage.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">{stage.description}</p>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {stage.key === 'videoPrompt' && (
                    <LockedTextBlock
                      text={`阶段2注入内容：\n${injectedStoryboardText || '等待阶段2填写主题与故事节奏。'}`}
                    />
                  )}
                  {(stage.layout || stage.fields.map(field => ({ type: 'field' as const, fieldId: field.id }))).map(item => {
                    if (item.type === 'locked') {
                      return <LockedTextBlock key={item.id} text={item.text} />
                    }
                    const field = stage.fields.find(candidate => candidate.id === item.fieldId)
                    if (!field) return null
                    return (
                      <StageFieldEditor
                        key={field.id}
                        stage={stage.key}
                        field={field}
                        fields={section.fields}
                        active={selectedStage === stage.key && selectedField.id === field.id}
                        expanded={expandedFields.has(fieldKey(stage.key, field.id))}
                        onToggle={() => toggleFieldDrawer(stage.key, field.id)}
                        onFocus={() => selectField(stage.key, field.id)}
                        onUpdateField={updateField}
                        onUpdateShotRanges={updateStoryboardShotRanges}
                        onSelectShotRange={selectShotRange}
                      />
                    )
                  })}
                </div>
                <div className="border-t border-gray-100 p-4">
                  <button
                    className="w-full rounded-full bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
                    onClick={() => copyText(output, `${stage.title}还没有填写任何结构化内容。`)}
                  >
                    <Copy className="h-4 w-4" />
                    复制{stage.title}
                  </button>
                </div>
              </section>
            )
          })}
        </div>

        <aside className="sticky top-24 flex h-[calc(100vh-136px)] min-h-[680px] flex-col rounded-[24px] border border-gray-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
          <div className="border-b border-gray-100 p-5">
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-gray-50 p-1">
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-sm font-black transition ${rightPanelMode === 'field' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                onClick={() => setRightPanelMode('field')}
              >
                字段编辑
              </button>
              {!previewMode && (
                <button
                  type="button"
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-black transition ${rightPanelMode === 'agent' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  onClick={() => setRightPanelMode('agent')}
                >
                  <Bot className="h-4 w-4" />
                  Agent
                </button>
              )}
            </div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">字段编辑器</div>
            <h2 className="text-lg font-bold text-gray-950">{selectedField.label}</h2>
            <p className="mt-1 text-sm text-gray-500">{selectedStageDefinition.title}</p>
          </div>

          {!previewMode && rightPanelMode === 'agent' ? (
            <AIChatbotBox
              title="Three-stage Agent"
              mode="three-stage-workspace"
              sessionKey={`workspace:three-stage:${activeProject.id}`}
              workspaceContext={workspaceContext}
              onApplyWorkspaceProposal={handleApplyAgentProposal}
            />
          ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-900">当前阶段完整 Prompt</span>
              <textarea
                className={`w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 ${
                  selectedField.presetType === 'camera' ? 'min-h-[180px]' : 'min-h-[320px]'
                }`}
                value={selectedOutput}
                placeholder={`${selectedStageDefinition.title} 完整 Prompt 会显示在这里。`}
                readOnly
              />
            </label>

            <div className="mt-3 flex gap-2">
              <button
                className="flex-1 rounded-full bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                onClick={() => copyText(selectedOutput, `${selectedStageDefinition.title}还没有填写任何结构化内容。`)}
              >
                <Copy className="h-4 w-4" />
                复制完整 Prompt
              </button>
              <button
                className="rounded-full bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
                onClick={() => updateField(selectedStage, selectedField.id, '')}
                disabled={selectedFieldIsFixed}
              >
                <Eraser className="h-4 w-4" />
                清空
              </button>
            </div>

            {selectedField.presetType === 'camera' && !selectedFieldIsFixed && (
              <div className="mt-6 flex min-h-[260px] flex-1 flex-col">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-gray-900">Prompt 库镜头选项</h3>
                  <span className="text-xs text-gray-400">{filteredCameraPresets.length} 条</span>
                </div>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100"
                    value={presetSearch}
                    onChange={(event) => setPresetSearch(event.target.value)}
                    placeholder="搜索镜头、运镜、构图..."
                  />
                </label>
                <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {filteredCameraPresets.length > 0 ? filteredCameraPresets.map(preset => (
                    <div key={preset.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                      <div className="text-sm font-bold text-gray-950">{preset.label}</div>
                      <p className="mt-1 line-clamp-3 text-xs leading-5 text-gray-500">{preset.content}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="flex-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          onClick={() => applyPreset(preset, 'append')}
                        >
                          追加
                        </button>
                        <button
                          className="flex-1 rounded-full bg-gray-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
                          onClick={() => applyPreset(preset, 'replace')}
                        >
                          替换
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                      没有匹配的镜头选项
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          )}
        </aside>
      </div>
    </section>
  )
}

export default ThreeStageBuilderScreen

const shotNumberOptions = Array.from({ length: 12 }, (_, index) => index + 1)

const LockedTextBlock = ({ text }: { text: string }) => (
  <div
    className="rounded-xl border border-transparent bg-[#fbfaf6] px-3 py-2 text-sm font-semibold leading-7 text-gray-800"
    style={{
      backgroundImage: 'radial-gradient(circle, rgba(17,24,39,0.12) 1px, transparent 1px)',
      backgroundSize: '14px 14px'
    }}
  >
    <pre className="whitespace-pre-wrap font-sans">{text}</pre>
  </div>
)

const StageFieldEditor = ({
  stage,
  field,
  fields,
  active,
  expanded,
  onToggle,
  onFocus,
  onUpdateField,
  onUpdateShotRanges,
  onSelectShotRange
}: {
  stage: ThreeStageKey
  field: FieldDefinition
  fields: Record<string, string>
  active: boolean
  expanded: boolean
  onToggle: () => void
  onFocus: () => void
  onUpdateField: (stage: ThreeStageKey, fieldId: string, value: string) => void
  onUpdateShotRanges: (stage: ThreeStageKey, fieldId: string, ranges: StoryboardShotRange[]) => void
  onSelectShotRange: (stage: ThreeStageKey, fieldId: string, rangeId: string) => void
}) => {
  if (field.fixedValue) {
    return <FixedStageFieldBlock field={field} />
  }

  if (field.kind === 'shotRanges') {
    return (
      <ShotRangeEditor
        active={active}
        ranges={parseStoryboardShotRanges(fields, field.id)}
        placeholder={field.placeholder}
        libraryEnabled={field.presetType === 'camera'}
        onFocus={onFocus}
        onRangeFocus={(rangeId) => onSelectShotRange(stage, field.id, rangeId)}
        onChange={(ranges) => onUpdateShotRanges(stage, field.id, ranges)}
      />
    )
  }

  if (field.kind === 'toggle') {
    return (
      <ToggleFieldEditor
        field={field}
        value={fields[field.id]}
        active={active}
        onFocus={onFocus}
        onChange={(value) => onUpdateField(stage, field.id, value)}
      />
    )
  }

  const fieldValue = field.fixedValue || fields[field.id] || ''

  return (
    <div
      className={`rounded-xl border transition ${
        active ? 'border-gray-950 bg-gray-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        onClick={onToggle}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">【{field.label}】</span>
            {field.presetType === 'camera' && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">镜头库</span>
            )}
          </span>
          {!expanded && (
            <span className="mt-1 block truncate text-xs leading-5 text-gray-400">
              {fieldValue.trim() || field.placeholder}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2">
          <textarea
            className="min-h-[86px] w-full resize-y rounded-xl border border-gray-200 bg-[#f4f2ec] px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 disabled:cursor-default disabled:text-gray-500"
            rows={field.rows || 3}
            value={fieldValue}
            placeholder={field.placeholder}
            disabled={Boolean(field.fixedValue)}
            onFocus={onFocus}
            onChange={(event) => onUpdateField(stage, field.id, event.target.value)}
          />
        </div>
      )}
    </div>
  )
}

const FixedStageFieldBlock = ({
  field
}: {
  field: FieldDefinition
}) => (
  <div
    className="rounded-xl border border-transparent bg-[#fbfaf6] px-3 py-2 text-sm font-semibold leading-7 text-gray-800"
    style={{
      backgroundImage: 'radial-gradient(circle, rgba(17,24,39,0.12) 1px, transparent 1px)',
      backgroundSize: '14px 14px'
    }}
  >
    <pre className="whitespace-pre-wrap font-sans">【{field.label}】 {field.fixedValue}</pre>
  </div>
)

const ToggleFieldEditor = ({
  field,
  value,
  active,
  onFocus,
  onChange
}: {
  field: FieldDefinition
  value?: string
  active: boolean
  onFocus: () => void
  onChange: (value: string) => void
}) => {
  const enabled = value ? value !== 'false' : field.toggleDefault ?? true
  const onLabel = field.toggleLabels?.on || '需要'
  const offLabel = field.toggleLabels?.off || '不需要'

  return (
    <div
      className={`rounded-xl border px-3 py-3 transition ${
        active ? 'border-gray-950 bg-gray-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'
      }`}
    >
      <div className="mb-3 text-sm font-bold text-gray-900">【{field.label}】</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
            enabled ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          onClick={(event) => {
            event.stopPropagation()
            onFocus()
            onChange('true')
          }}
        >
          {onLabel}
        </button>
        <button
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
            !enabled ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          onClick={(event) => {
            event.stopPropagation()
            onFocus()
            onChange('false')
          }}
        >
          {offLabel}
        </button>
      </div>
    </div>
  )
}

const ShotRangeEditor = ({
  active,
  ranges,
  placeholder,
  libraryEnabled = false,
  onFocus,
  onRangeFocus,
  onChange
}: {
  active: boolean
  ranges: StoryboardShotRange[]
  placeholder: string
  libraryEnabled?: boolean
  onFocus: () => void
  onRangeFocus?: (rangeId: string) => void
  onChange: (ranges: StoryboardShotRange[]) => void
}) => {
  const updateRange = (id: string, updates: Partial<StoryboardShotRange>) => {
    onChange(ranges.map(range => range.id === id ? { ...range, ...updates } : range))
  }

  const addRange = () => {
    onChange([...ranges, createStoryboardShotRange(Date.now())])
  }

  const removeRange = (id: string) => {
    if (ranges.length <= 1) return
    onChange(ranges.filter(range => range.id !== id))
  }

  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        active ? 'border-gray-950 bg-gray-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'
      }`}
      onFocus={onFocus}
      onClick={onFocus}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-gray-900">镜头格</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full bg-gray-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800"
          onClick={(event) => {
            event.stopPropagation()
            addRange()
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          新增字段
        </button>
      </div>
      <div className="space-y-3">
        {ranges.map(range => (
          <div key={range.id} className="rounded-2xl border border-gray-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-950">镜头格</span>
                {libraryEnabled && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">镜头库</span>
                )}
                <select
                  className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-sm font-semibold text-gray-900"
                  value={range.start}
                  onChange={(event) => updateRange(range.id, { start: Number(event.target.value) })}
                >
                  {shotNumberOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <span className="text-sm font-bold text-gray-500">-</span>
                <select
                  className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-sm font-semibold text-gray-900"
                  value={range.end}
                  onChange={(event) => updateRange(range.id, { end: Number(event.target.value) })}
                >
                  {shotNumberOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="rounded-full p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                disabled={ranges.length <= 1}
                onClick={(event) => {
                  event.stopPropagation()
                  removeRange(range.id)
                }}
                title="删除镜头格"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              className="min-h-[86px] w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100"
              value={range.content}
              placeholder={placeholder}
              onFocus={() => {
                onRangeFocus?.(range.id)
                onFocus()
              }}
              onChange={(event) => updateRange(range.id, { content: event.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
