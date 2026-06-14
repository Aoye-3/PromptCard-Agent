import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, PointerEvent, WheelEvent } from 'react'
import { Bot, ChevronDown, ChevronLeft, ChevronRight, Copy, Database, GripVertical, Home, Lock, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Settings, Trash2, Unlock } from 'lucide-react'
import { AIChatbotBox } from '@/components/AgentCollaborationPanel'
import { buildThreeStageWorkspaceContext } from '@/utils/agent-workspace'
import type { IPreset } from '@/models/Card.model'
import type {
  IPromptProject,
  IThreeStageForm,
  IThreeStageFormItem,
  IThreeStageProject,
  IThreeStageSection,
  ThreeStageKey
} from '@/models/PromptHistory.model'
import type { AgentWorkspaceProposal } from '@/models/Agent.model'
import {
  buildThreeStageFormOutput,
  createStoryboardShotRange,
  editableThreeStageTemplateKeys,
  getFormFixedContentOverrides,
  getFormTemplateFixedContent,
  getStageDefinition,
  getStageFixedContent,
  getTemplateFixedContentForStage,
  normalizeThreeStageTemplateSettings,
  parseStoryboardShotRanges,
  shotNumbersForRange,
  stringifyStoryboardShotRanges,
  valueOf
} from '@/domain/three-stage/three-stage-definitions'
import type { EditableThreeStageTemplateKey, FieldDefinition, FixedContentDefaults, StoryboardShotRange, ThreeStageTemplateSettings } from '@/domain/three-stage/three-stage-definitions'
import {
  addThreeStageFormToPage,
  duplicateThreeStageForm,
  duplicateThreeStagePage,
  getSelectedThreeStageFormContext,
  getSelectedThreeStagePage,
  normalizeThreeStagePages,
  renameThreeStageForm,
  removeThreeStageItem,
  removeThreeStagePage,
  reorderThreeStageItem,
  selectThreeStageForm,
  syncThreeStageLegacyFields,
  updateThreeStageFormFixedContent,
  updateThreeStageFormSection
} from '@/domain/three-stage/three-stage-pages'

export const MIN_THREE_STAGE_RAIL_ZOOM = 0.45
export const MAX_THREE_STAGE_RAIL_ZOOM = 2
const DEFAULT_THREE_STAGE_RAIL_ZOOM = 1
const THREE_STAGE_RAIL_ZOOM_STEP = 0.1
type ActiveShotTarget = { rangeId: string; shotNumber?: number }

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
  threeStageTemplateSettings?: ThreeStageTemplateSettings
  onThreeStageTemplateSettingsChange?: (settings: ThreeStageTemplateSettings) => void
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
  threeStageTemplateSettings,
  onThreeStageTemplateSettingsChange,
  previewMode = false
}: ThreeStageBuilderScreenProps) => {
  const normalizedThreeStage = useMemo(() => syncThreeStageLegacyFields(threeStage), [threeStage])
  const pages = useMemo(() => normalizeThreeStagePages(normalizedThreeStage), [normalizedThreeStage])
  const currentPage = getSelectedThreeStagePage(normalizedThreeStage)
  const selectedContext = getSelectedThreeStageFormContext(normalizedThreeStage)
  const selectedForm = selectedContext.form
  const selectedStage = getStageDefinition(selectedForm.type).key
  const selectedStageDefinition = getStageDefinition(selectedStage)
  const normalizedTemplateSettings = useMemo(
    () => normalizeThreeStageTemplateSettings(threeStageTemplateSettings),
    [threeStageTemplateSettings]
  )
  const [presetSearch, setPresetSearch] = useState('')
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())
  const [activeShotRangeByField, setActiveShotRangeByField] = useState<Record<string, ActiveShotTarget>>({})
  const [rightPanelMode, setRightPanelMode] = useState<'field' | 'agent'>('field')
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [showTemplateSettings, setShowTemplateSettings] = useState(false)
  const [characterSourceId, setCharacterSourceId] = useState('')
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const stageRailRef = useRef<HTMLDivElement>(null)
  const spacePressedRef = useRef(false)
  const panStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    scrollLeft: number
    scrollTop: number
  } | null>(null)
  const [stageRailScroll, setStageRailScroll] = useState({ left: 0, max: 0 })
  const [stageZoom, setStageZoom] = useState(DEFAULT_THREE_STAGE_RAIL_ZOOM)
  const [spacePanningEnabled, setSpacePanningEnabled] = useState(false)
  const [stageRailPanning, setStageRailPanning] = useState(false)
  const selectedField = selectedStageDefinition.fields.find(field => field.id === normalizedThreeStage.selectedFieldId && !field.fixedValue) ||
    selectedStageDefinition.fields.find(field => !field.fixedValue) ||
    selectedStageDefinition.fields[0]
  const selectedValue = valueOf(selectedForm.section.fields, selectedField.id)
  const selectedFieldIsFixed = Boolean(selectedField.fixedValue)
  const selectedOutput = buildThreeStageFormOutput(selectedForm, normalizedThreeStage)
  const workspaceContext = buildThreeStageWorkspaceContext({
    activeProject,
    threeStage: normalizedThreeStage,
    selectedOutput
  })
  const characterSources = getFormsByType(normalizedThreeStage, 'character')

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

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.repeat || isEditableTarget(event.target)) return
      event.preventDefault()
      spacePressedRef.current = true
      setSpacePanningEnabled(true)
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return
      spacePressedRef.current = false
      panStateRef.current = null
      setSpacePanningEnabled(false)
      setStageRailPanning(false)
    }

    const onWindowBlur = (): void => {
      spacePressedRef.current = false
      panStateRef.current = null
      setSpacePanningEnabled(false)
      setStageRailPanning(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [])

  const handleStageRailWheel = (event: WheelEvent<HTMLDivElement>): void => {
    const rail = stageRailRef.current
    if (!rail) return
    if (!event.ctrlKey) {
      event.preventDefault()
      rail.scrollLeft += event.deltaX
      rail.scrollTop += event.deltaY
      updateStageRailScroll()
      return
    }
    event.preventDefault()
    setStageZoom(current => getNextThreeStageRailZoom(current, event.deltaY))
    window.setTimeout(updateStageRailScroll, 0)
  }

  const startStageRailPan = (event: PointerEvent<HTMLDivElement>): void => {
    const rail = stageRailRef.current
    if (!rail || !spacePressedRef.current || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    rail.setPointerCapture(event.pointerId)
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: rail.scrollLeft,
      scrollTop: rail.scrollTop
    }
    setStageRailPanning(true)
  }

  const moveStageRailPan = (event: PointerEvent<HTMLDivElement>): void => {
    const rail = stageRailRef.current
    const pan = panStateRef.current
    if (!rail || !pan || pan.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    rail.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX)
    rail.scrollTop = pan.scrollTop - (event.clientY - pan.startY)
    updateStageRailScroll()
  }

  const endStageRailPan = (event: PointerEvent<HTMLDivElement>): void => {
    const rail = stageRailRef.current
    const pan = panStateRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    if (rail?.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId)
    panStateRef.current = null
    setStageRailPanning(false)
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

  const updateFixedContent = (
    form: IThreeStageForm,
    contentId: string,
    update: { value?: string; unlocked?: boolean } | null
  ): void => {
    const updated = updateThreeStageFormFixedContent(normalizedThreeStage, form.id, contentId, update)
    onChange(selectThreeStageForm(updated, currentPage.id, form.id))
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
      const activeTarget = activeShotRangeByField[fieldSelectionKey]
      const activeRangeId = activeTarget?.rangeId || ranges[0]?.id
      const nextRanges = ranges.map(range => {
        if (range.id !== activeRangeId) return range
        if (selectedForm.type === 'videoPrompt' && selectedField.id === 'shotKeywords') {
          const targetShotNumber = activeTarget?.shotNumber || shotNumbersForRange(range)[0]
          const currentShotContent = range.shots?.[targetShotNumber] || ''
          const nextShotContent = mode === 'replace'
            ? preset.content
            : currentShotContent.trim()
              ? `${currentShotContent}\n${preset.content}`
              : preset.content
          return {
            ...range,
            shots: {
              ...(range.shots || {}),
              [targetShotNumber]: nextShotContent
            }
          }
        }
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

  const selectShotRange = (form: IThreeStageForm, fieldId: string, rangeId: string, shotNumber?: number): void => {
    setActiveShotRangeByField(current => ({
      ...current,
      [fieldKey(form.id, fieldId)]: { rangeId, ...(shotNumber ? { shotNumber } : {}) }
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
    onChange(addThreeStageFormToPage(normalizedThreeStage, currentPage.id, 'character', characterSourceId || undefined, normalizedTemplateSettings))
    setShowNewMenu(false)
  }

  const createStoryboard = (): void => {
    onChange(addThreeStageFormToPage(normalizedThreeStage, currentPage.id, 'storyboard', undefined, normalizedTemplateSettings))
    setShowNewMenu(false)
  }

  const createPrompt = (): void => {
    onChange(addThreeStageFormToPage(normalizedThreeStage, currentPage.id, 'videoPrompt', undefined, normalizedTemplateSettings))
    setShowNewMenu(false)
  }

  const duplicateForm = (form: IThreeStageForm): void => {
    onChange(duplicateThreeStageForm(normalizedThreeStage, currentPage.id, form.id))
  }

  const renameForm = (form: IThreeStageForm): void => {
    const nextTitle = window.prompt('重命名版本', form.title)?.trim()
    if (nextTitle) onChange(renameThreeStageForm(normalizedThreeStage, form.id, nextTitle))
  }

  const moveItemTo = (itemId: string, targetIndex: number): void => {
    if (!draggedItemId || draggedItemId === itemId) return
    onChange(reorderThreeStageItem(normalizedThreeStage, currentPage.id, draggedItemId, targetIndex))
    setDraggedItemId(null)
  }

  const removeItem = (item: IThreeStageFormItem): void => {
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
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#f7f8fb] px-6 pt-7">
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
          <p className="mt-1 text-sm text-gray-500">三段式分页：人物版、故事版与提示词版都作为独立版本管理。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {onThreeStageTemplateSettingsChange && (
            <button
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
              onClick={() => setShowTemplateSettings(true)}
            >
              <Settings className="h-4 w-4" />
              模板设置
            </button>
          )}
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
              const firstForm = getFirstFormFromItem(page.items[0])
              if (firstForm) onChange(selectThreeStageForm(normalizedThreeStage, page.id, firstForm.id))
            }}
          >
            Page {index + 1}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 pr-[500px]">
        <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
          <div
            ref={stageRailRef}
            className={`h-full min-h-0 min-w-0 overscroll-contain overflow-auto pb-40 pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              stageRailPanning ? 'cursor-grabbing select-none' : spacePanningEnabled ? 'cursor-grab' : ''
            }`}
            onScroll={updateStageRailScroll}
            onWheel={handleStageRailWheel}
            onPointerDownCapture={startStageRailPan}
            onPointerMoveCapture={moveStageRailPan}
            onPointerUpCapture={endStageRailPan}
            onPointerCancelCapture={endStageRailPan}
          >
          <div
            className="inline-flex min-w-max items-start gap-4"
            style={stageRailZoomStyle}
            data-three-stage-rail-zoom={stageZoom.toFixed(2)}
          >
          {currentPage.items.map((item, itemIndex) => (
            <div key={item.id} className="contents">
              <IndependentStageFormCard
                form={item.form}
                itemId={item.id}
                itemIndex={itemIndex}
                selectedFormId={selectedForm.id}
                selectedFieldId={selectedField.id}
                expandedFields={expandedFields}
                activeShotRangeByField={activeShotRangeByField}
                onSelectForm={selectFormField}
                onToggleField={toggleFieldDrawer}
                onSelectField={selectField}
                onUpdateField={updateField}
                onUpdateFixedContent={updateFixedContent}
                onUpdateShotRanges={updateShotRanges}
                onSelectShotRange={selectShotRange}
                onCopy={copyText}
                onDuplicate={() => duplicateForm(item.form)}
                onRename={() => renameForm(item.form)}
                onRemove={() => removeItem(item)}
                draggable={!spacePanningEnabled && !stageRailPanning}
                onDragStart={() => {
                  if (spacePressedRef.current) return
                  setDraggedItemId(item.id)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveItemTo(item.id, itemIndex)}
                onDragEnd={() => setDraggedItemId(null)}
              />
            </div>
          ))}
          <div className="flex w-[360px] max-w-[calc(100vw-48px)] flex-none flex-col gap-4">
            <InlineCreateCard
              title="新建人物版"
              description="创建独立编号的人物版，可从已有人物版复制。"
              variant="character"
              onClick={createCharacter}
            />
            <InlineCreateCard
              title="新建故事版"
              description="创建独立故事版，可单独复制、重命名和拖动排序。"
              variant="storyboard"
              onClick={createStoryboard}
            />
            <InlineCreateCard
              title="新建提示词版"
              description="创建独立提示词版，可单独复制、重命名和拖动排序。"
              variant="videoPrompt"
              onClick={createPrompt}
            />
          </div>
          </div>
          </div>
          <FloatingHorizontalScroll
            left={stageRailScroll.left}
            max={stageRailScroll.max}
            onScrollLeft={setStageRailScrollLeft}
            onStep={scrollStageRailBy}
          />
        </div>

      </div>

      <aside className="absolute bottom-0 right-6 top-[118px] z-20 flex w-[480px] min-h-0 flex-col rounded-[18px] border border-gray-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-gray-50 p-1">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-black transition ${rightPanelMode === 'field' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              onClick={() => setRightPanelMode('field')}
            >
              字段编辑
            </button>
            {!previewMode && (
              <button
                type="button"
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-black transition ${rightPanelMode === 'agent' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                onClick={() => setRightPanelMode('agent')}
              >
                <Bot className="h-4 w-4" />
                Agent
              </button>
            )}
          </div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">字段编辑器</div>
          <h2 className="text-base font-bold leading-6 text-gray-950">{selectedField.label}</h2>
          <p className="text-xs text-gray-500">{selectedForm.title}</p>
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
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
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

      <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-3 py-2 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur">
        {pages.map((page, index) => (
          <button
            key={page.id}
            className={`h-9 min-w-9 rounded-full px-3 text-sm font-bold transition ${
              page.id === currentPage.id ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => {
              const firstForm = getFirstFormFromItem(page.items[0])
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
            <button className="mb-3 w-full rounded-full bg-gray-950 px-4 py-2 text-sm font-bold text-white" onClick={createStoryboard}>新建故事版</button>
            <button className="mb-3 w-full rounded-full bg-gray-950 px-4 py-2 text-sm font-bold text-white" onClick={createPrompt}>新建提示词版</button>
            <button className="w-full rounded-full bg-red-50 px-4 py-2 text-sm font-bold text-red-600" onClick={removePage}>删除当前页</button>
          </div>
        )}
      </div>
      {showTemplateSettings && onThreeStageTemplateSettingsChange && (
        <ThreeStageTemplateSettingsDialog
          settings={normalizedTemplateSettings}
          onClose={() => setShowTemplateSettings(false)}
          onSave={(settings) => {
            onThreeStageTemplateSettingsChange(settings)
            setShowTemplateSettings(false)
          }}
        />
      )}
    </section>
  )
}

export default ThreeStageBuilderScreen

const InlineCreateCard = ({
  title,
  description,
  variant,
  onClick
}: {
  title: string
  description: string
  variant?: 'character' | 'storyboard' | 'videoPrompt'
  onClick: () => void
}) => {
  const display = variant ? createCardCopyByVariant[variant] : { title, description }
  return (
    <button
      type="button"
      className="flex min-h-[210px] w-full flex-col items-start justify-center rounded-[24px] border border-dashed border-gray-300 bg-white/65 p-6 text-left transition hover:border-gray-950 hover:bg-white hover:shadow-[0_18px_45px_rgba(15,23,42,0.06)]"
      onClick={onClick}
    >
      <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gray-950 text-white">
        <Plus className="h-5 w-5" />
      </span>
      <span className="text-lg font-black text-gray-950">{display.title}</span>
      <span className="mt-2 text-sm leading-6 text-gray-500">{display.description}</span>
    </button>
  )
}

const createCardCopyByVariant: Record<'character' | 'storyboard' | 'videoPrompt', { title: string; description: string }> = {
  character: { title: '新建人物版', description: '创建独立人物版，可从已有版本复制基础内容。' },
  storyboard: { title: '新建故事版', description: '创建独立故事版，可单独复制、重命名和拖动排序。' },
  videoPrompt: { title: '新建提示词版', description: '创建独立提示词版，可单独复制、重命名和拖动排序。' }
}

const ThreeStageTemplateSettingsDialog = ({
  settings,
  onClose,
  onSave
}: {
  settings: ThreeStageTemplateSettings
  onClose: () => void
  onSave: (settings: ThreeStageTemplateSettings) => void
}) => {
  const [draft, setDraft] = useState<Record<EditableThreeStageTemplateKey, FixedContentDefaults>>(() => buildTemplateDraft(settings))

  useEffect(() => {
    setDraft(buildTemplateDraft(settings))
  }, [settings])

  const updateValue = (stage: EditableThreeStageTemplateKey, contentId: string, value: string): void => {
    setDraft(current => ({
      ...current,
      [stage]: {
        ...current[stage],
        [contentId]: value
      }
    }))
  }

  const resetStage = (stage: EditableThreeStageTemplateKey): void => {
    setDraft(current => ({ ...current, [stage]: getStageFixedContent(stage) }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <div>
            <h2 className="text-xl font-black text-gray-950">三段式模板设置</h2>
            <p className="mt-1 text-sm text-gray-500">保存后只影响后续新建的三段式版本，不会改写已有节点。</p>
          </div>
          <button type="button" className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900" onClick={onClose}>
            <Trash2 className="h-4 w-4 rotate-45" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 lg:grid-cols-3">
            {editableThreeStageTemplateKeys.map(stage => (
              <section key={stage} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-gray-950">{stageTemplateTitle(stage)}</h3>
                  <button type="button" className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-600 transition hover:text-gray-950" onClick={() => resetStage(stage)}>
                    恢复默认
                  </button>
                </div>
                <div className="space-y-3">
                  {Object.entries(getStageFixedContent(stage)).map(([contentId]) => (
                    <label key={contentId} className="block">
                      <span className="mb-1 block text-xs font-bold text-gray-500">{fixedContentLabel(stage, contentId)}</span>
                      <textarea
                        className="min-h-[92px] w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-100"
                        value={draft[stage][contentId] ?? ''}
                        onChange={(event) => updateValue(stage, contentId, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 p-5">
          <button type="button" className="rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-200" onClick={onClose}>取消</button>
          <button type="button" className="rounded-full bg-gray-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-gray-800" onClick={() => onSave(compactTemplateSettings(draft))}>保存模板</button>
        </div>
      </div>
    </div>
  )
}

const buildTemplateDraft = (settings: ThreeStageTemplateSettings): Record<EditableThreeStageTemplateKey, FixedContentDefaults> =>
  Object.fromEntries(editableThreeStageTemplateKeys.map(stage => {
    const builtIn = getStageFixedContent(stage)
    const custom = getTemplateFixedContentForStage(stage, settings)
    return [stage, { ...builtIn, ...custom }]
  })) as Record<EditableThreeStageTemplateKey, FixedContentDefaults>

const compactTemplateSettings = (
  draft: Record<EditableThreeStageTemplateKey, FixedContentDefaults>
): ThreeStageTemplateSettings =>
  normalizeThreeStageTemplateSettings(Object.fromEntries(editableThreeStageTemplateKeys.map(stage => {
    const builtIn = getStageFixedContent(stage)
    const changed = Object.fromEntries(Object.entries(draft[stage]).filter(([contentId, value]) => value !== builtIn[contentId]))
    return [stage, changed]
  })))

const stageTemplateTitle = (stage: EditableThreeStageTemplateKey): string => {
  if (stage === 'character') return '人物版模板'
  if (stage === 'storyboard') return '故事版模板'
  return '提示词版模板'
}

const fixedContentLabel = (stage: EditableThreeStageTemplateKey, contentId: string): string =>
  getStageDefinition(stage).fields.find(field => field.id === contentId)?.label || contentId

const getFirstFormFromItem = (item?: IThreeStageFormItem): IThreeStageForm | undefined => {
  if (!item) return undefined
  return item.form
}

const getFormsByType = (threeStage: IThreeStageProject, type: ThreeStageKey): IThreeStageForm[] =>
  normalizeThreeStagePages(threeStage).flatMap(page =>
    page.items.map(item => item.form)
  ).filter(form => form.type === type)

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
    <div className="pointer-events-none absolute bottom-32 left-0 right-0 z-30 flex justify-center px-4">
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

const IndependentStageFormCard = ({
  form,
  itemId,
  itemIndex,
  selectedFormId,
  selectedFieldId,
  expandedFields,
  activeShotRangeByField,
  onSelectForm,
  onToggleField,
  onSelectField,
  onUpdateField,
  onUpdateFixedContent,
  onUpdateShotRanges,
  onSelectShotRange,
  onCopy,
  onDuplicate,
  onRename,
  onRemove,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: {
  form: IThreeStageForm
  itemId: string
  itemIndex: number
  selectedFormId: string
  selectedFieldId: string
  expandedFields: Set<string>
  activeShotRangeByField: Record<string, ActiveShotTarget>
  onSelectForm: (form: IThreeStageForm, fieldId?: string) => void
  onToggleField: (form: IThreeStageForm, fieldId: string) => void
  onSelectField: (form: IThreeStageForm, fieldId: string) => void
  onUpdateField: (form: IThreeStageForm, fieldId: string, value: string) => void
  onUpdateFixedContent: (form: IThreeStageForm, contentId: string, update: { value?: string; unlocked?: boolean } | null) => void
  onUpdateShotRanges: (form: IThreeStageForm, fieldId: string, ranges: StoryboardShotRange[]) => void
  onSelectShotRange: (form: IThreeStageForm, fieldId: string, rangeId: string, shotNumber?: number) => void
  onCopy: (text: string, emptyMessage?: string) => void
  onDuplicate: () => void
  onRename: () => void
  onRemove: () => void
  draggable: boolean
  onDragStart: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: () => void
  onDragEnd: () => void
}) => {
  const stage = getStageDefinition(form.type)
  const output = buildThreeStageFormOutput(form)

  return (
    <section
      className={`flex min-h-[680px] w-[520px] max-w-[calc(100vw-48px)] flex-none flex-col rounded-[24px] border bg-white shadow-[0_18px_45px_rgba(15,23,42,0.04)] ${
        selectedFormId === form.id ? 'border-gray-950' : 'border-gray-200'
      }`}
      draggable={false}
      data-item-id={itemId}
      data-item-index={itemIndex}
      onClick={() => onSelectForm(form)}
      onDragOver={onDragOver}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
    >
      <div className="border-b border-gray-100 p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              role="button"
              tabIndex={0}
              draggable={draggable}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-300 transition hover:bg-gray-100 hover:text-gray-500 ${
                draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-40'
              }`}
              title="拖动排序"
              onClick={(event) => event.stopPropagation()}
              onDragStart={(event) => {
                event.stopPropagation()
                if (!draggable) {
                  event.preventDefault()
                  return
                }
                onDragStart()
              }}
              onDragEnd={(event) => {
                event.stopPropagation()
                onDragEnd()
              }}
            >
              <GripVertical className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Three-stage</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900" title="复制版本" onClick={(event) => { event.stopPropagation(); onDuplicate() }}>
              <Copy className="h-4 w-4" />
            </button>
            <button type="button" className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900" title="重命名版本" onClick={(event) => { event.stopPropagation(); onRename() }}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500" title="删除版本" onClick={(event) => { event.stopPropagation(); onRemove() }}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-950">{form.title}</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">{stage.description}</p>
      </div>
      <div className="space-y-3 p-4">
        {(stage.layout || stage.fields.map(field => ({ type: 'field' as const, fieldId: field.id }))).map(item => {
          if (item.type === 'locked') {
            return (
              <EditableLockedTextBlock
                key={item.id}
                form={form}
                contentId={item.id}
                label="锁定字段"
                defaultText={item.text}
                onUpdateFixedContent={onUpdateFixedContent}
              />
            )
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
              activeShotTarget={activeShotRangeByField[`${form.id}:${field.id}`]}
              onUpdateField={onUpdateField}
              onUpdateFixedContent={onUpdateFixedContent}
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
}) => {
  const [previewPreset, setPreviewPreset] = useState<IPreset | null>(null)

  return (
  <div className="flex min-h-[260px] flex-1 flex-col">
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-sm font-bold text-gray-900">Prompt 库镜头选项</h3>
      <span className="text-xs text-gray-400">{presets.length} 条</span>
    </div>
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        className="w-full rounded-xl border border-gray-200 bg-gray-50 py-1.5 pl-9 pr-3 text-sm text-gray-900 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="搜索镜头、运镜、构图..."
      />
    </label>
    <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
      {presets.length > 0 ? presets.map(preset => (
        <div key={preset.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <div className="text-sm font-bold text-gray-950">{preset.label}</div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{preset.content}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100" onClick={() => setPreviewPreset(preset)}>
              预览
            </button>
            <button className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100" onClick={() => onApply(preset, 'append')}>
              追加
            </button>
            <button className="rounded-full bg-gray-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800" onClick={() => onApply(preset, 'replace')}>
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
    {previewPreset && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/25 px-4" onClick={() => setPreviewPreset(null)}>
        <div className="max-h-[78vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-gray-400">{previewPreset.category}</div>
              <h3 className="mt-1 text-lg font-black text-gray-950">{previewPreset.label}</h3>
            </div>
            <button type="button" className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-bold text-gray-600 hover:bg-gray-200" onClick={() => setPreviewPreset(null)}>
              关闭
            </button>
          </div>
          <div className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm leading-7 text-gray-800">{previewPreset.content}</div>
          <div className="mt-4">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">Meta</div>
            <pre className="max-h-44 overflow-auto rounded-xl bg-gray-950 p-3 text-xs leading-5 text-white">{JSON.stringify(previewPreset.meta || {}, null, 2)}</pre>
          </div>
        </div>
      </div>
    )}
  </div>
  )
}

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

const EditableLockedTextBlock = ({
  form,
  contentId,
  label,
  defaultText,
  onUpdateFixedContent
}: {
  form: IThreeStageForm
  contentId: string
  label: string
  defaultText: string
  onUpdateFixedContent?: (form: IThreeStageForm, contentId: string, update: { value?: string; unlocked?: boolean } | null) => void
}) => {
  const override = getFormFixedContentOverrides(form)[contentId]
  const template = getFormTemplateFixedContent(form)
  const builtIn = getStageFixedContent(form.type)[contentId] ?? defaultText
  const value = override?.value ?? template[contentId] ?? builtIn
  const unlocked = Boolean(override?.unlocked)

  if (!onUpdateFixedContent) return <LockedTextBlock text={`${label}\n${value}`} />

  const unlock = () => onUpdateFixedContent(form, contentId, { value, unlocked: true })
  const relock = () => onUpdateFixedContent(form, contentId, { value, unlocked: false })
  const stopCardInteraction = (event: { stopPropagation: () => void }): void => {
    event.stopPropagation()
  }

  return (
    <div
      className="rounded-xl border border-transparent bg-[#fbfaf6] px-3 py-2 text-sm font-semibold leading-7 text-gray-800"
      draggable={false}
      onClick={stopCardInteraction}
      onMouseDown={stopCardInteraction}
      onPointerDown={stopCardInteraction}
      onDragStart={stopCardInteraction}
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(17,24,39,0.12) 1px, transparent 1px)',
        backgroundSize: '14px 14px'
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-black text-gray-900">{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            draggable={false}
            className="rounded-full bg-white/80 p-1.5 text-gray-500 transition hover:text-gray-950"
            title={unlocked ? '锁定字段' : '解锁编辑'}
            onClick={(event) => {
              event.stopPropagation()
              if (unlocked) {
                relock()
              } else {
                unlock()
              }
            }}
          >
            {unlocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            draggable={false}
            className="rounded-full bg-white/80 p-1.5 text-gray-500 transition hover:text-gray-950"
            title="恢复此节点模板快照"
            onClick={(event) => {
              event.stopPropagation()
              onUpdateFixedContent(form, contentId, null)
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {unlocked ? (
        <textarea
          className="min-h-[88px] w-full resize-y rounded-xl border border-gray-200 bg-white/90 px-3 py-2 text-sm leading-relaxed text-gray-900 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-100"
          draggable={false}
          value={value}
          onClick={stopCardInteraction}
          onMouseDown={stopCardInteraction}
          onPointerDown={stopCardInteraction}
          onDragStart={stopCardInteraction}
          onFocus={stopCardInteraction}
          onChange={(event) => onUpdateFixedContent(form, contentId, { value: event.target.value, unlocked: true })}
        />
      ) : (
        <pre className="whitespace-pre-wrap font-sans">{value}</pre>
      )}
    </div>
  )
}

const StageFieldEditor = ({
  form,
  field,
  fields,
  active,
  expanded,
  onToggle,
  onFocus,
  activeShotTarget,
  onUpdateField,
  onUpdateFixedContent,
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
  activeShotTarget?: ActiveShotTarget
  onUpdateField: (form: IThreeStageForm, fieldId: string, value: string) => void
  onUpdateFixedContent?: (form: IThreeStageForm, contentId: string, update: { value?: string; unlocked?: boolean } | null) => void
  onUpdateShotRanges: (form: IThreeStageForm, fieldId: string, ranges: StoryboardShotRange[]) => void
  onSelectShotRange: (form: IThreeStageForm, fieldId: string, rangeId: string, shotNumber?: number) => void
}) => {
  if (field.fixedValue) {
    if (!onUpdateFixedContent) return <FixedStageFieldBlock field={field} />
    return (
      <EditableLockedTextBlock
        form={form}
        contentId={field.id}
        label={field.label}
        defaultText={field.fixedValue}
        onUpdateFixedContent={onUpdateFixedContent}
      />
    )
  }

  if (field.kind === 'shotRanges') {
    return (
      <ShotRangeEditor
        active={active}
        ranges={parseStoryboardShotRanges(fields, field.id)}
        placeholder={field.placeholder}
        libraryEnabled={field.presetType === 'camera'}
        slotMode={form.type === 'videoPrompt' && field.id === 'shotKeywords'}
        activeTarget={activeShotTarget}
        onFocus={onFocus}
        onRangeFocus={(rangeId, shotNumber) => onSelectShotRange(form, field.id, rangeId, shotNumber)}
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

const ShotRangeTextarea = ({
  value,
  placeholder,
  minHeight = 220,
  rows = 8,
  active = false,
  onFocus,
  onChange
}: {
  value: string
  placeholder: string
  minHeight?: number
  rows?: number
  active?: boolean
  onFocus: () => void
  onChange: (value: string) => void
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`
  }, [minHeight, value])

  return (
    <textarea
      ref={textareaRef}
      rows={rows}
      className={`w-full resize-none overflow-hidden rounded-xl border px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 ${
        active
          ? 'border-gray-950 bg-white shadow-[0_0_0_3px_rgba(17,24,39,0.08)] focus:border-gray-950 focus:ring-gray-200'
          : 'border-gray-200 bg-gray-50 focus:border-gray-300 focus:ring-gray-100'
      }`}
      style={{ minHeight }}
      value={value}
      placeholder={placeholder}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

const ShotRangeEditor = ({
  active,
  ranges,
  placeholder,
  libraryEnabled = false,
  slotMode = false,
  activeTarget,
  onFocus,
  onRangeFocus,
  onChange
}: {
  active: boolean
  ranges: StoryboardShotRange[]
  placeholder: string
  libraryEnabled?: boolean
  slotMode?: boolean
  activeTarget?: ActiveShotTarget
  onFocus: () => void
  onRangeFocus?: (rangeId: string, shotNumber?: number) => void
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
        {ranges.map(range => {
          const rangeActive = activeTarget?.rangeId === range.id
          return (
          <div key={range.id} className={`rounded-2xl border bg-white p-3 transition ${
            rangeActive ? 'border-gray-950 shadow-[0_0_0_3px_rgba(17,24,39,0.06)]' : 'border-gray-200'
          }`}>
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
            {slotMode ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800">
                  时间：X-XS。
                </div>
                {shotNumbersForRange(range).map(shotNumber => (
                  <div key={`${range.id}-${shotNumber}`} className={`rounded-xl border p-3 transition ${
                    activeTarget?.rangeId === range.id && activeTarget?.shotNumber === shotNumber
                      ? 'border-gray-950 bg-white shadow-[0_0_0_3px_rgba(17,24,39,0.08)]'
                      : 'border-gray-100 bg-gray-50'
                  }`}>
                    <div className="mb-2 text-sm font-black text-gray-950">镜头{shotNumber}@</div>
                    <ShotRangeTextarea
                      value={range.shots?.[shotNumber] || ''}
                      placeholder={`${placeholder}（镜头${shotNumber}）`}
                      minHeight={120}
                      rows={4}
                      active={activeTarget?.rangeId === range.id && activeTarget?.shotNumber === shotNumber}
                      onFocus={() => {
                        onRangeFocus?.(range.id, shotNumber)
                        onFocus()
                      }}
                      onChange={(value) => updateRange(range.id, {
                        shots: {
                          ...(range.shots || {}),
                          [shotNumber]: value
                        }
                      })}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <ShotRangeTextarea
                value={range.content}
                placeholder={placeholder}
                active={rangeActive}
                onFocus={() => {
                  onRangeFocus?.(range.id)
                  onFocus()
                }}
                onChange={(value) => updateRange(range.id, { content: value })}
              />
            )}
          </div>
        )})}
      </div>
    </div>
  )
}
