import { useMemo, useState } from 'react'
import { Copy, Database, Eraser, Home, Search } from 'lucide-react'
import type { IPreset } from '@/models/Card.model'
import type { IPromptProject, IThreeStageProject, IThreeStageSection, ThreeStageKey } from '@/models/PromptHistory.model'
import { getStageDefinition, stageDefinitions, valueOf } from '@/domain/three-stage/three-stage-definitions'

const getSection = (threeStage: IThreeStageProject, stage: ThreeStageKey): IThreeStageSection => threeStage[stage]

interface ThreeStageBuilderScreenProps {
  activeProject: IPromptProject
  threeStage: IThreeStageProject
  cameraPresets: IPreset[]
  onBack: () => void
  onSave: () => void
  onChange: (threeStage: IThreeStageProject) => void
  onIncrementPresetUsage: (id: string) => Promise<void>
}

const ThreeStageBuilderScreen = ({
  activeProject,
  threeStage,
  cameraPresets,
  onBack,
  onSave,
  onChange,
  onIncrementPresetUsage
}: ThreeStageBuilderScreenProps) => {
  const [presetSearch, setPresetSearch] = useState('')
  const selectedStage = getStageDefinition(threeStage.selectedStage).key
  const selectedStageDefinition = getStageDefinition(selectedStage)
  const selectedField = selectedStageDefinition.fields.find(field => field.id === threeStage.selectedFieldId) || selectedStageDefinition.fields[0]
  const selectedValue = valueOf(getSection(threeStage, selectedStage).fields, selectedField.id)
  const selectedOutput = selectedStageDefinition.buildOutput(getSection(threeStage, selectedStage).fields)

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

  const applyPreset = async (preset: IPreset, mode: 'append' | 'replace') => {
    const nextValue = mode === 'replace'
      ? preset.content
      : selectedValue
        ? `${selectedValue}\n${preset.content}`
        : preset.content
    updateField(selectedStage, selectedField.id, nextValue)
    await onIncrementPresetUsage(preset.id)
  }

  return (
    <section className="min-h-[calc(100vh-168px)] bg-[#f7f8fb] px-6 pb-10 pt-7">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <button className="mb-3 text-sm font-semibold text-gray-500 transition hover:text-gray-950" onClick={onBack}>
            <Home className="h-4 w-4" />
            项目
          </button>
          <h1 className="text-3xl font-bold">{activeProject.title}</h1>
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
            保存
          </button>
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          {stageDefinitions.map(stage => {
            const section = getSection(threeStage, stage.key)
            const output = stage.buildOutput(section.fields)
            return (
              <section key={stage.key} className="flex min-h-[760px] flex-col rounded-[24px] border border-gray-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
                <div className="border-b border-gray-100 p-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Three-stage</div>
                  <h2 className="text-xl font-bold text-gray-950">{stage.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">{stage.description}</p>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {stage.fields.map(field => (
                    <label
                      key={field.id}
                      className={`block rounded-2xl border p-3 transition ${
                        selectedStage === stage.key && selectedField.id === field.id
                          ? 'border-gray-950 bg-gray-50 shadow-sm'
                          : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                      onFocus={() => selectField(stage.key, field.id)}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-gray-900">{field.label}</span>
                        {field.presetType === 'camera' && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">镜头库</span>
                        )}
                      </div>
                      <textarea
                        className="min-h-[72px] w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100"
                        rows={field.rows || 3}
                        value={section.fields[field.id] || ''}
                        placeholder={field.placeholder}
                        onFocus={() => selectField(stage.key, field.id)}
                        onChange={(event) => updateField(stage.key, field.id, event.target.value)}
                      />
                    </label>
                  ))}
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
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">字段编辑器</div>
            <h2 className="text-lg font-bold text-gray-950">{selectedField.label}</h2>
            <p className="mt-1 text-sm text-gray-500">{selectedStageDefinition.title}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-900">当前字段内容</span>
              <textarea
                className="min-h-[180px] w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-100"
                value={selectedValue}
                placeholder={selectedField.placeholder}
                onChange={(event) => updateField(selectedStage, selectedField.id, event.target.value)}
              />
            </label>

            <div className="mt-3 flex gap-2">
              <button
                className="flex-1 rounded-full bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                onClick={() => copyText(selectedValue, '当前字段为空。')}
              >
                <Copy className="h-4 w-4" />
                复制字段
              </button>
              <button
                className="rounded-full bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
                onClick={() => updateField(selectedStage, selectedField.id, '')}
              >
                <Eraser className="h-4 w-4" />
                清空
              </button>
            </div>

            {selectedField.presetType === 'camera' && (
              <div className="mt-6">
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
                <div className="mt-3 max-h-[44vh] space-y-2 overflow-y-auto pr-1">
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
        </aside>
      </div>
    </section>
  )
}

export default ThreeStageBuilderScreen
