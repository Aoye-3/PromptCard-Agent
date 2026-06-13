import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, WheelEvent } from 'react'
import { Bot, ChevronDown, ChevronLeft, ChevronRight, Copy, Database, Eraser, Home, Link2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { AIChatbotBox } from '@/components/AgentCollaborationPanel'
import { buildThreeStageWorkspaceContext } from '@/utils/agent-workspace'
import type { IPreset } from '@/models/Card.model'
import type {
  IPromptProject,
  IThreeStageForm,
  IThreeStageItem,
  IThreeStageProject,
  IThreeStageSection
} from '@/models/PromptHistory.model'
import type { AgentWorkspaceProposal } from '@/models/Agent.model'
import {
  buildStoryboardInjectionForVideo,
  createStoryboardShotRange,
  getStageDefinition,
  parseStoryboardShotRanges,
  stringifyStoryboardShotRanges,
  valueOf
} from '@/domain/three-stage/three-stage-definitions'
import type { FieldDefinition, StoryboardShotRange } from '@/domain/three-stage/three-stage-definitions'
import {
  addCharacterFormToPage,
  addStoryVideoPairToPage,
  duplicateThreeStagePage,
  getCharacterCopySources,
  getPairCopySources,
  getSelectedThreeStageFormContext,
  getSelectedThreeStagePage,
  normalizeThreeStagePages,
  removeThreeStageItem,
  removeThreeStagePage,
  selectThreeStageForm,
  syncThreeStageLegacyFields,
  updateThreeStageFormSection
} from '@/domain/three-stage/three-stage-pages'

export const MIN_THREE_STAGE_RAIL_ZOOM = 0.72
export const MAX_THREE_STAGE_RAIL_ZOOM = 1.36
const DEFAULT_THREE_STAGE_RAIL_ZOOM = 1
const THREE_STAGE_RAIL_ZOOM_STEP = 0.08

export const getNextThreeStageRailZoom = (currentZoom: number, deltaY: number): number => {
  if (deltaY === 0) return currentZoom
  const direction = deltaY < 0 ? 1 : -1
  const nextZoom = currentZoom + direction * THREE_STAGE_RAIL_ZOOM_STEP
  const clampedZoom = Math.min(MAX_THREE_STAGE_RAIL_ZOOM, Math.max(MIN_THREE_STAGE_RAIL_ZOOM, nextZoom))
  return Number(clampedZoom.toFixed(2))
}

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
  const normalizedThreeStage = useMemo(() => syncThreeStageLegacyFields(threeStage), [threeStage])
  const pages = useMemo(() => normalizeThreeStagePages(normalizedThreeStage), [normalizedThreeStage])
  const currentPage = getSelectedThreeStagePage(normalizedThreeStage)
  const selectedContext = getSelectedThreeStageFormContext(normalizedThreeStage)
  const selectedForm = selectedContext.form
  const pairedStoryboardForm = selectedContext.pairedStoryboardForm
  const selectedStage = getStageDefinition(selectedForm.type).key
  const selectedStageDefinition = getStageDefinition(selectedStage)
  const [presetSearch, setPresetSearch] = useState('')
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())
  const [activeShotRangeByField, setActiveShotRangeByField] = useState<Record<string, string>>({})
  const [rightPanelMode, setRightPanelMode] = useState<'field' | 'agent'>('field')
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [characterSourceId, setCharacterSourceId] = useState('')
  const [pairSourceId, setPairSourceId] = useState('')
  const stageRailRef = useRef<HTMLDivElement>(null)
  const [stageRailScroll, setStageRailScroll] = useState({ left: 0, max: 0 })
  const [stageZoom, setStageZoom] = useState(DEFAULT_THREE_STAGE_RAIL_ZOOM)
  const selectedField = selectedStageDefinition.fields.find(field => field.id === normalizedThreeStage.selectedFieldId && !field.fixedValue) ||
    selectedStageDefinition.fields.find(field => !field.fixedValue) ||
    selectedStageDefinition.fields[0]
  const selectedValue = valueOf(selectedForm.section.fields, selectedField.id)
  const selectedFieldIsFixed = Boolean(selectedField.fixedValue)
  const outputProject = selectedStage === 'videoPrompt' && pairedStoryboardForm
    ? { ...normalizedThreeStage, storyboard: pairedStoryboardForm.section }
    : normalizedThreeStage
  const selectedOutput = selectedStageDefinition.buildOutput(selectedForm.section.fields, outputProject)
  const workspaceContext = buildThreeStageWorkspaceContext({
    activeProject,
    threeStage: normalizedThreeStage,
    selectedOutput
  })
  const characterSources = getCharacterCopySources(normalizedThreeStage)
  const pairSources = getPairCopySources(normalizedThreeStage)

  const filteredCameraPresets = useMemo(() => {
    const keyword = presetSearch.trim().toLowerCase()
    if (!keyword) return cameraPresets
    return cameraPresets.filter(preset =>
      preset.label.toLowerCase().includes(keyword) ||
      preset.content.toLowerCase().includes(keyword)
    )
  }, [cameraPresets, presetSearch])

  const updateStageRailScroll = useCallback(() => {
    const rail = stageRailRef.current
    if (!rail) return
    setStageRailScroll({
      left: rail.scrollLeft,
      max: Math.max(0, rail.scrollWidth - rail.clientWidth)
    })
  }, [])

  useEffect(() => {
    updateStageRailScroll()
  }, [currentPage.id, currentPage.items.length, stageZoom, updateStageRailScroll])

  const stageRailZoomStyle = useMemo(() => ({ zoom: stageZoom } as CSSProperties), [stageZoom])

  const handleStageRailWheel = (event: WheelEvent<HTMLDivElement>): void => {
    if (!event.ctrlKey) return
    event.preventDefault()
    setStageZoom(current => getNextThreeStageRailZoom(current, event.deltaY))
    window.setTimeout(updateStageRailScroll, 0)
  }

  const scrollStageRailBy = (direction: -1 | 1): void => {
    const rail = stageRailRef.current
    if (!rail) return
    rail.scrollBy({ left: direction * Math.max(360, rail.clientWidth * 0.72), behavior: 'smooth' })
    window.setTimeout(updateStageRailScroll, 260)
  }

  const setStageRailScrollLeft = (value: number): void => {
    const rail = stageRailRef.current
    if (!rail) return
    rail.scrollLeft = value
    updateStageRailScroll()
  }

  const fieldKey = (formId: string, fieldId: string): string => `${formId}:${fieldId}`

  const selectFormField = (form: IThreeStageForm, fieldId?: string): void => {
    onChange(selectThreeStageForm(normalizedThreeStage, currentPage.id, form.id, fieldId))
  }

  const updateFormSection = (form: IThreeStageForm, section: IThreeStageSection, fieldId?: string): void => {
    const updated = updateThreeStageFormSection({
      ...normalizedThreeStage,
      selectedPageId: currentPage.id,
      selectedFormId: form.id,
      selectedStage: form.type,
      selectedFieldId: fieldId || normalizedThreeStage.selectedFieldId
    }, form.id, section)
    onChange(selectThreeStageForm(updated, currentPage.id, form.id, fieldId))
  }

  const selectField = (form: IThreeStageForm, fieldId: string): void => {
    updateFormSection(form, {
      ...form.section,
      focusedFieldId: fieldId,
      updatedAt: Date.now()
    }, fieldId)
  }

  const updateField = (form: IThreeStageForm, fieldId: string, value: string): void => {
    updateFormSection(form, {
      ...form.section,
      fields: {
        ...form.section.fields,
        [fieldId]: value
      },
      focusedFieldId: fieldId,
      updatedAt: Date.now()
    }, fieldId)
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
    if (proposal.stageKey !== selectedForm.type) return
    const field = getStageDefinition(selectedForm.type).fields.find(candidate => candidate.id === proposal.fieldId && !candidate.fixedValue)
    if (!field) return
    const currentValue = valueOf(selectedForm.section.fields, field.id)
    const nextValue = proposal.mode === 'append' && currentValue.trim()
      ? `${currentValue}\n${proposal.content}`
      : proposal.content
    updateField(selectedForm, field.id, nextValue)
  }

  const applyPreset = async (preset: IPreset, mode: 'append' | 'replace') => {
    if (selectedField.kind === 'shotRanges') {
      const fieldSelectionKey = fieldKey(selectedForm.id, selectedField.id)
      const ranges = parseStoryboardShotRanges(selectedForm.section.fields, selectedField.id)
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
      updateField(selectedForm, selectedField.id, stringifyStoryboardShotRanges(nextRanges))
      await onIncrementPresetUsage(preset.id)
      return
    }

    const nextValue = mode === 'replace'
      ? preset.content
      : selectedValue
        ? `${selectedValue}\n${preset.content}`
        : preset.content
    updateField(selectedForm, selectedField.id, nextValue)
    await onIncrementPresetUsage(preset.id)
  }

  const updateShotRanges = (form: IThreeStageForm, fieldId: string, ranges: StoryboardShotRange[]): void => {
    updateField(form, fieldId, stringifyStoryboardShotRanges(ranges))
  }

  const selectShotRange = (form: IThreeStageForm, fieldId: string, rangeId: string): void => {
    setActiveShotRangeByField(current => ({
      ...current,
      [fieldKey(form.id, fieldId)]: rangeId
    }))
    selectField(form, fieldId)
  }

  const toggleFieldDrawer = (form: IThreeStageForm, fieldId: string): void => {
    const key = fieldKey(form.id, fieldId)
    setExpandedFields(current => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
    selectField(form, fieldId)
  }

  const duplicateCurrentPage = (): void => {
    onChange(duplicateThreeStagePage(normalizedThreeStage, currentPage.id))
  }

  const createCharacter = (): void => {
    onChange(addCharacterFormToPage(normalizedThreeStage, currentPage.id, characterSourceId || undefined))
    setShowNewMenu(false)
  }

  const createPair = (): void => {
    onChange(addStoryVideoPairToPage(normalizedThreeStage, currentPage.id, pairSourceId || undefined))
    setShowNewMenu(false)
  }

  const removeItem = (item: IThreeStageItem): void => {
    if (currentPage.items.length <= 1) {
      window.alert('每页至少保留一个表单。')
      return
    }
    onChange(removeThreeStageItem(normalizedThreeStage, currentPage.id, item.id))
  }

  const removePage = (): void => {
    if (pages.length <= 1) {
      window.alert('至少保留一页。')
      return
    }
    if (window.confirm('删除当前三段式页面吗？')) {
      onChange(removeThreeStagePage(normalizedThreeStage, currentPage.id))
    }
  }

  return (
    <section className="min-h-[calc(100vh-168px)] bg-[#f7f8fb] px-6 pb-28 pt-7">
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
          <p className="mt-1 text-sm text-gray-500">三段式分页：人物版独立管理，故事版与提示词版固定绑定。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
            onClick={() => copyText(selectedOutput, '当前表单还没有可复制内容。')}
          >
            <Copy className="h-4 w-4" />
            复制当前表单
          </button>
          <button className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800" onClick={onSave}>
            <Database className="h-4 w-4" />
            {previewMode ? '预览不保存' : '保存'}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              page.id === currentPage.id ? 'bg-gray-950 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
            onClick={() => {
              const firstForm = page.items[0]?.kind === 'character' ? page.items[0].form : page.items[0]?.storyboardForm
              if (firstForm) onChange(selectThreeStageForm(normalizedThreeStage, page.id, firstForm.id))
            }}
          >
            Page {index + 1}
          </button>
        ))}
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative min-w-0">
          <div
            ref={stageRailRef}
            className="min-w-0 overflow-x-auto pb-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={updateStageRailScroll}
            onWheel={handleStageRailWheel}
          >
          <div
            className="inline-flex min-w-max items-start gap-4"
            style={stageRailZoomStyle}
            data-three-stage-rail-zoom={stageZoom.toFixed(2)}
          >
          {currentPage.items.map(item => item.kind === 'character' ? (
            <div key={item.id} className="contents">
              <StageFormCard
                form={item.form}
                selectedFormId={selectedForm.id}
                selectedFieldId={selectedField.id}
                pairedStoryboardForm={null}
                expandedFields={expandedFields}
                onSelectForm={selectFormField}
                onToggleField={toggleFieldDrawer}
                onSelectField={selectField}
                onUpdateField={updateField}
                onUpdateShotRanges={updateShotRanges}
                onSelectShotRange={selectShotRange}
                onCopy={copyText}
                onRemove={() => removeItem(item)}
              />
            </div>
          ) : (
            <section key={item.id} className="contents">
              <div className="hidden">
                <div className="inline-flex items-center gap-2 rounded-full bg-gray-950 px-3 py-1.5 text-xs font-bold text-white">
                  <Link2 className="h-3.5 w-3.5" />
                  故事/提示词组 #{item.number}
                </div>
                <button
                  type="button"
                  className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
                  onClick={() => removeItem(item)}
                  title="删除绑定组"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="contents">
                <StageFormCard
                  form={item.storyboardForm}
                  selectedFormId={selectedForm.id}
                  selectedFieldId={selectedField.id}
                  pairedStoryboardForm={item.storyboardForm}
                  expandedFields={expandedFields}
                  onSelectForm={selectFormField}
                  onToggleField={toggleFieldDrawer}
                  onSelectField={selectField}
                  onUpdateField={updateField}
                  onUpdateShotRanges={updateShotRanges}
                  onSelectShotRange={selectShotRange}
                  onCopy={copyText}
                  onRemove={() => removeItem(item)}
                />
                <StageFormCard
                  form={item.videoPromptForm}
                  selectedFormId={selectedForm.id}
                  selectedFieldId={selectedField.id}
                  pairedStoryboardForm={item.storyboardForm}
                  expandedFields={expandedFields}
                  onSelectForm={selectFormField}
                  onToggleField={toggleFieldDrawer}
                  onSelectField={selectField}
                  onUpdateField={updateField}
                  onUpdateShotRanges={updateShotRanges}
                  onSelectShotRange={selectShotRange}
                  onCopy={copyText}
                  onRemove={() => removeItem(item)}
                />
              </div>
            </section>
          ))}
          {true && (
            <InlineCreateCard
              title="新建人物版"
              description="创建独立编号的人物版，可从已有人物版复制。"
              onClick={createCharacter}
            />
          )}
          {true && (
            <InlineCreateCard
              title="新建故事+提示词组"
              description="故事版和提示词版会成对创建，并保持固定注入绑定。"
              onClick={createPair}
            />
          )}
          {false && (
            <InlineCreateCard
              title="新建人物版"
              description="创建独立编号的人物版，可从已有人物版复制。"
              onClick={createCharacter}
            />
          )}
          </div>
          </div>
          <FloatingHorizontalScroll
            left={stageRailScroll.left}
            max={stageRailScroll.max}
            onScrollLeft={setStageRailScrollLeft}
            onStep={scrollStageRailBy}
          />
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
            <p className="mt-1 text-sm text-gray-500">{selectedForm.title}</p>
          </div>

          {!previewMode && rightPanelMode === 'agent' ? (
            <AIChatbotBox
              title="Three-stage Agent"
              mode="three-stage-workspace"
              sessionKey={`workspace:three-stage:${activeProject.id}:${selectedForm.id}`}
              workspaceContext={workspaceContext}
              onApplyWorkspaceProposal={handleApplyAgentProposal}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-gray-900">当前表单完整 Prompt</span>
                <textarea
                  className={`w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100 ${
                    selectedField.presetType === 'camera' ? 'min-h-[180px]' : 'min-h-[320px]'
                  }`}
                  value={selectedOutput}
                  placeholder={`${selectedForm.title} 完整 Prompt 会显示在这里。`}
                  readOnly
                />
              </label>

              <div className="mt-3 flex gap-2">
                <button
                  className="flex-1 rounded-full bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                  onClick={() => copyText(selectedOutput, `${selectedForm.title}还没有可复制内容。`)}
                >
                  <Copy className="h-4 w-4" />
                  复制完整 Prompt
                </button>
                <button
                  className="rounded-full bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
                  onClick={() => updateField(selectedForm, selectedField.id, '')}
                  disabled={selectedFieldIsFixed}
                >
                  <Eraser className="h-4 w-4" />
                  清空
                </button>
              </div>

              {selectedField.presetType === 'camera' && !selectedFieldIsFixed && (
                <PresetPicker
                  presets={filteredCameraPresets}
                  search={presetSearch}
                  onSearch={setPresetSearch}
                  onApply={applyPreset}
                />
              )}
            </div>
          )}
        </aside>
      </div>

      <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-3 py-2 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur">
        {pages.map((page, index) => (
          <button
            key={page.id}
            className={`h-9 min-w-9 rounded-full px-3 text-sm font-bold transition ${
              page.id === currentPage.id ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => {
              const firstForm = page.items[0]?.kind === 'character' ? page.items[0].form : page.items[0]?.storyboardForm
              if (firstForm) onChange(selectThreeStageForm(normalizedThreeStage, page.id, firstForm.id))
            }}
          >
            {index + 1}
          </button>
        ))}
        <button className="h-9 w-9 rounded-full bg-amber-100 text-amber-700 transition hover:bg-amber-200" onClick={duplicateCurrentPage} title="复制当前页">
          <Plus className="h-4 w-4" />
        </button>
        <button className="h-9 w-9 rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-200" onClick={() => setShowNewMenu(value => !value)} title="当前页菜单">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {showNewMenu && (
          <div className="absolute bottom-14 right-0 w-80 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-2xl">
            <div className="mb-3 text-sm font-bold text-gray-950">当前页新建</div>
            <label className="mb-3 block text-xs font-bold text-gray-500">
              人物版复制来源
              <select className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" value={characterSourceId} onChange={(event) => setCharacterSourceId(event.target.value)}>
                <option value="">最近的人物版</option>
                {characterSources.map(form => <option key={form.id} value={form.id}>{form.title}</option>)}
              </select>
            </label>
            <button className="mb-3 w-full rounded-full bg-gray-950 px-4 py-2 text-sm font-bold text-white" onClick={createCharacter}>新建人物版</button>
            <label className="mb-3 block text-xs font-bold text-gray-500">
              故事+提示词组复制来源
              <select className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900" value={pairSourceId} onChange={(event) => setPairSourceId(event.target.value)}>
                <option value="">最近的故事+提示词组</option>
                {pairSources.map(pair => <option key={pair.pairId} value={pair.pairId}>故事/提示词组 #{pair.number}</option>)}
              </select>
            </label>
            <button className="mb-3 w-full rounded-full bg-gray-950 px-4 py-2 text-sm font-bold text-white" onClick={createPair}>新建故事+提示词组</button>
            <button className="w-full rounded-full bg-red-50 px-4 py-2 text-sm font-bold text-red-600" onClick={removePage}>删除当前页</button>
          </div>
        )}
      </div>
    </section>
  )
}

export default ThreeStageBuilderScreen

const InlineCreateCard = ({
  title,
  description,
  onClick
}: {
  title: string
  description: string
  onClick: () => void
}) => (
  <button
    type="button"
    className="flex min-h-[260px] w-[360px] max-w-[calc(100vw-48px)] flex-none flex-col items-start justify-center rounded-[24px] border border-dashed border-gray-300 bg-white/65 p-6 text-left transition hover:border-gray-950 hover:bg-white hover:shadow-[0_18px_45px_rgba(15,23,42,0.06)]"
    onClick={onClick}
  >
    <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gray-950 text-white">
      <Plus className="h-5 w-5" />
    </span>
    <span className="text-lg font-black text-gray-950">{title}</span>
    <span className="mt-2 text-sm leading-6 text-gray-500">{description}</span>
  </button>
)

const FloatingHorizontalScroll = ({
  left,
  max,
  onScrollLeft,
  onStep
}: {
  left: number
  max: number
  onScrollLeft: (value: number) => void
  onStep: (direction: -1 | 1) => void
}) => {
  if (max <= 4) return null
  const value = Math.min(max, Math.max(0, left))

  return (
    <div className="pointer-events-none sticky bottom-28 z-30 -mt-16 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-full border border-gray-200 bg-white/95 px-3 py-2 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur">
        <button
          type="button"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-950 hover:text-white disabled:opacity-40"
          disabled={value <= 0}
          onClick={() => onStep(-1)}
          title="向左滚动"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-gray-950"
          onChange={(event) => onScrollLeft(Number(event.target.value))}
          aria-label="三段式横向滚动"
        />
        <button
          type="button"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gray-100 text-gray-700 transition hover:bg-gray-950 hover:text-white disabled:opacity-40"
          disabled={value >= max}
          onClick={() => onStep(1)}
          title="向右滚动"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

const StageFormCard = ({
  form,
  selectedFormId,
  selectedFieldId,
  pairedStoryboardForm,
  expandedFields,
  onSelectForm,
  onToggleField,
  onSelectField,
  onUpdateField,
  onUpdateShotRanges,
  onSelectShotRange,
  onCopy,
  onRemove
}: {
  form: IThreeStageForm
  selectedFormId: string
  selectedFieldId: string
  pairedStoryboardForm: IThreeStageForm | null
  expandedFields: Set<string>
  onSelectForm: (form: IThreeStageForm, fieldId?: string) => void
  onToggleField: (form: IThreeStageForm, fieldId: string) => void
  onSelectField: (form: IThreeStageForm, fieldId: string) => void
  onUpdateField: (form: IThreeStageForm, fieldId: string, value: string) => void
  onUpdateShotRanges: (form: IThreeStageForm, fieldId: string, ranges: StoryboardShotRange[]) => void
  onSelectShotRange: (form: IThreeStageForm, fieldId: string, rangeId: string) => void
  onCopy: (text: string, emptyMessage?: string) => void
  onRemove: () => void
}) => {
  const stage = getStageDefinition(form.type)
  const outputProject = form.type === 'videoPrompt' && pairedStoryboardForm
    ? ({
        character: pairedStoryboardForm.section,
        storyboard: pairedStoryboardForm.section,
        videoPrompt: form.section,
        selectedStage: form.type,
        selectedFieldId: form.section.focusedFieldId || '',
        meta: {}
      } as IThreeStageProject)
    : undefined
  const output = stage.buildOutput(form.section.fields, outputProject)
  const injectedStoryboardText = form.type === 'videoPrompt' && pairedStoryboardForm
    ? buildStoryboardInjectionForVideo(pairedStoryboardForm.section.fields)
    : ''

  return (
    <section
      className={`flex min-h-[680px] w-[520px] max-w-[calc(100vw-48px)] flex-none flex-col rounded-[24px] border bg-white shadow-[0_18px_45px_rgba(15,23,42,0.04)] ${
        selectedFormId === form.id ? 'border-gray-950' : 'border-gray-200'
      }`}
      onClick={() => onSelectForm(form)}
    >
      <div className="border-b border-gray-100 p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Three-stage</span>
            {form.type !== 'character' && form.type !== 'object' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-950 px-2 py-0.5 text-[11px] font-bold text-white">
                <Link2 className="h-3 w-3" />
                绑定组 #{form.number}
              </span>
            )}
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
            title={form.type === 'character' ? '删除人物版' : form.type === 'object' ? '删除物品版' : '删除绑定组'}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <h2 className="text-xl font-bold text-gray-950">{form.title}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">{stage.description}</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {form.type === 'videoPrompt' && (
          <LockedTextBlock
            text={`阶段2注入内容：\n${injectedStoryboardText || '等待同组故事版填写主题与故事节奏。'}`}
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
              form={form}
              field={field}
              fields={form.section.fields}
              active={selectedFormId === form.id && selectedFieldId === field.id}
              expanded={expandedFields.has(`${form.id}:${field.id}`)}
              onToggle={() => onToggleField(form, field.id)}
              onFocus={() => onSelectField(form, field.id)}
              onUpdateField={onUpdateField}
              onUpdateShotRanges={onUpdateShotRanges}
              onSelectShotRange={onSelectShotRange}
            />
          )
        })}
      </div>
      <div className="border-t border-gray-100 p-4">
        <button
          className="w-full rounded-full bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
          onClick={(event) => {
            event.stopPropagation()
            onCopy(output, `${form.title}还没有可复制内容。`)
          }}
        >
          <Copy className="h-4 w-4" />
          复制{form.title}
        </button>
      </div>
    </section>
  )
}

const PresetPicker = ({
  presets,
  search,
  onSearch,
  onApply
}: {
  presets: IPreset[]
  search: string
  onSearch: (value: string) => void
  onApply: (preset: IPreset, mode: 'append' | 'replace') => void
}) => (
  <div className="mt-6 flex min-h-[260px] flex-1 flex-col">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-sm font-bold text-gray-900">Prompt 库镜头选项</h3>
      <span className="text-xs text-gray-400">{presets.length} 条</span>
    </div>
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="搜索镜头、运镜、构图..."
      />
    </label>
    <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
      {presets.length > 0 ? presets.map(preset => (
        <div key={preset.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
          <div className="text-sm font-bold text-gray-950">{preset.label}</div>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-gray-500">{preset.content}</p>
          <div className="mt-3 flex gap-2">
            <button className="flex-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100" onClick={() => onApply(preset, 'append')}>
              追加
            </button>
            <button className="flex-1 rounded-full bg-gray-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800" onClick={() => onApply(preset, 'replace')}>
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
)

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
  form,
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
  form: IThreeStageForm
  field: FieldDefinition
  fields: Record<string, string>
  active: boolean
  expanded: boolean
  onToggle: () => void
  onFocus: () => void
  onUpdateField: (form: IThreeStageForm, fieldId: string, value: string) => void
  onUpdateShotRanges: (form: IThreeStageForm, fieldId: string, ranges: StoryboardShotRange[]) => void
  onSelectShotRange: (form: IThreeStageForm, fieldId: string, rangeId: string) => void
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
        onRangeFocus={(rangeId) => onSelectShotRange(form, field.id, rangeId)}
        onChange={(ranges) => onUpdateShotRanges(form, field.id, ranges)}
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
        onChange={(value) => onUpdateField(form, field.id, value)}
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
      <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left" onClick={onToggle}>
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
            onChange={(event) => onUpdateField(form, field.id, event.target.value)}
          />
        </div>
      )}
    </div>
  )
}

const FixedStageFieldBlock = ({ field }: { field: FieldDefinition }) => (
  <div
    className="rounded-xl border border-transparent bg-[#fbfaf6] px-3 py-2 text-sm font-semibold leading-7 text-gray-800"
    style={{
      backgroundImage: 'radial-gradient(circle, rgba(17,24,39,0.12) 1px, transparent 1px)',
      backgroundSize: '14px 14px'
    }}
  >
    <pre className="whitespace-pre-wrap font-sans">【{field.label}】{field.fixedValue}</pre>
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
    <div className={`rounded-xl border px-3 py-3 transition ${active ? 'border-gray-950 bg-gray-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
      <div className="mb-3 text-sm font-bold text-gray-900">【{field.label}】</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-semibold transition ${enabled ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
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
          className={`rounded-full px-3 py-2 text-sm font-semibold transition ${!enabled ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
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
    <div className={`rounded-2xl border p-3 transition ${active ? 'border-gray-950 bg-gray-50 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'}`} onFocus={onFocus} onClick={onFocus}>
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
                <select className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-sm font-semibold text-gray-900" value={range.start} onChange={(event) => updateRange(range.id, { start: Number(event.target.value) })}>
                  {shotNumberOptions.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
                <span className="text-sm font-bold text-gray-500">-</span>
                <select className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-sm font-semibold text-gray-900" value={range.end} onChange={(event) => updateRange(range.id, { end: Number(event.target.value) })}>
                  {shotNumberOptions.map(option => <option key={option} value={option}>{option}</option>)}
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
