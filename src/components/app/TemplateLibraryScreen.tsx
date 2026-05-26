import { useCallback, useState } from 'react'
import { Plus } from 'lucide-react'
import { getBuilderTemplateById, getBuilderTemplates } from '@/domain/builder-templates/builder-templates'
import type { BuilderTemplateId } from '@/domain/builder-templates/builder-templates'
import { BuilderModePreviewFrame } from './BuilderModePreviewFrame'
import type { BuilderModePreviewSnapshot } from './builder-preview-contract'

export const TemplateLibraryScreen = ({
  onCreateFromTemplate
}: {
  onCreateFromTemplate: (templateId: BuilderTemplateId, snapshot?: BuilderModePreviewSnapshot) => void
}) => {
  const templates = getBuilderTemplates()
  const [activeTemplateId, setActiveTemplateId] = useState<BuilderTemplateId>(templates[0].id)
  const [previewSnapshots, setPreviewSnapshots] = useState<Partial<Record<BuilderTemplateId, BuilderModePreviewSnapshot>>>({})
  const activeTemplate = getBuilderTemplateById(activeTemplateId)
  const activeTemplateIndex = templates.findIndex(template => template.id === activeTemplateId)
  const activeSnapshot = previewSnapshots[activeTemplateId] || {}
  const handleActiveSnapshotChange = useCallback((snapshot: BuilderModePreviewSnapshot) => {
    setPreviewSnapshots(current => ({
      ...current,
      [activeTemplateId]: snapshot
    }))
  }, [activeTemplateId])

  return (
    <section className="w-full px-6 pt-4" data-template-library-screen>
      <div className="grid w-full gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="sticky top-24 max-h-[calc(100vh-180px)] min-h-[520px] overflow-y-auto rounded-[24px] border border-gray-100 bg-[#f3f1ea] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-950">模板库</h1>
              <p className="mt-1 text-sm text-gray-500">构建模式 {templates.length}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-gray-500">{activeTemplateIndex + 1} / {templates.length}</span>
          </div>

          <div className="space-y-4">
            {templates.map((template, index) => (
              <button
                key={template.id}
                data-builder-template-id={template.id}
                data-builder-template-modules={template.modules.map(module => module.id).join(' ')}
                className={`grid w-full grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-2xl px-3 py-4 text-left transition ${
                  template.id === activeTemplateId ? 'bg-white shadow-sm' : 'hover:bg-white/70'
                }`}
                onClick={() => setActiveTemplateId(template.id)}
              >
                <span className="flex h-9 w-9 justify-self-center rounded-xl bg-white text-gray-700 items-center justify-center">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold text-gray-950">{template.shortTitle}</span>
                  <span className="mt-0.5 block truncate text-xs leading-5 text-gray-500">{template.title}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex justify-end">
            <button
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
              onClick={() => onCreateFromTemplate(activeTemplate.id, activeSnapshot)}
            >
              <Plus className="h-4 w-4" />
              用此模式创建项目
            </button>
          </div>
          <BuilderModePreviewFrame
            template={activeTemplate}
            snapshot={activeSnapshot}
            onSnapshotChange={handleActiveSnapshotChange}
          />
        </div>
      </div>
    </section>
  )
}
