import { ArrowRight, Film, FolderPlus, Grid2X2, Trash2 } from 'lucide-react'
import { getBuilderTemplates } from '@/domain/builder-templates/builder-templates'
import type { BuilderTemplate, BuilderTemplateId } from '@/domain/builder-templates/builder-templates'
import { getCardDefaultTitle } from '@/utils/promptParser'
import type { CardType } from '@/models/Card.model'
import type { IPromptHistory } from '@/models/PromptHistory.model'

export const HistoryModal = ({
  histories,
  onClose,
  onRestore,
  onDelete,
  onClear
}: {
  histories: IPromptHistory[]
  onClose: () => void
  onRestore: (history: IPromptHistory) => void
  onDelete: (historyId: string) => void
  onClear: () => void
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
    <div className="max-h-[80vh] w-[760px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">生成历史</h3>
          <p className="mt-1 text-sm text-gray-500">自动保存会记录 Prompt 快照，可恢复到任意历史版本。</p>
        </div>
        <div className="flex items-center gap-2">
          {histories.length > 0 && (
            <button
              className="rounded-full bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
              onClick={onClear}
            >
              <Trash2 className="h-4 w-4" />
              Clear all
            </button>
          )}
          <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={onClose}>x</button>
        </div>
      </div>
      {histories.length > 0 ? (
        <div className="space-y-3">
          {histories.map(history => (
            <div key={history.id} className="rounded-2xl border border-gray-100 p-4 transition hover:border-gray-300">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{history.title || 'Prompt History'}</div>
                  <div className="mt-1 text-xs text-gray-500">{new Date(history.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="rounded-full bg-black px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:bg-gray-300"
                    disabled={!history.pages?.length}
                    onClick={() => onRestore(history)}
                  >
                    恢复
                  </button>
                  <button
                    className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-100"
                    onClick={() => onDelete(history.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-gray-600">{history.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-12 text-center text-gray-500">暂无历史。填写 Prompt 后会自动保存。</div>
      )}
    </div>
  </div>
)

export const AddCardModal = ({
  cardTypes,
  onClose,
  onAddCard
}: {
  cardTypes: readonly { type: CardType; label: string; color: string }[]
  onClose: () => void
  onAddCard: (type: CardType) => void
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
    <div className="max-h-[80vh] w-[600px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-semibold text-gray-900">选择卡片类型</h3>
        <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={onClose}>x</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {cardTypes.map(item => (
          <button
            key={item.type}
            className="flex items-center gap-3 rounded-2xl border border-gray-100 p-4 text-left transition hover:border-gray-300 hover:bg-gray-50"
            onClick={() => onAddCard(item.type)}
          >
            <span className={`${item.color} rounded-full px-3 py-1 text-sm font-medium`}>{item.label}</span>
            <span className="text-sm text-gray-600">{getCardDefaultTitle(item.type)}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
)

export const RenameProjectModal = ({
  title,
  onTitleChange,
  onClose,
  onConfirm
}: {
  title: string
  onTitleChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
    <form
      className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl"
      onClick={event => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        onConfirm()
      }}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-950">重命名项目</h3>
          <p className="mt-1 text-sm text-gray-500">项目名称会显示在项目卡片和编辑页顶部。</p>
        </div>
        <button type="button" className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={onClose}>
          x
        </button>
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-gray-700">项目名称</span>
        <input
          autoFocus
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-base font-semibold text-gray-950 outline-none focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100"
        />
      </label>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="rounded-full bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300" disabled={!title.trim()}>
          保存
        </button>
      </div>
    </form>
  </div>
)

export const CreateProjectModal = ({
  onClose,
  onCreateFromTemplate
}: {
  onClose: () => void
  onCreateFromTemplate: (templateId: BuilderTemplateId) => void
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
    <div className="max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-950">选择项目构建模式</h3>
          <p className="mt-2 text-sm text-gray-500">项目创建依赖模板库里的模块化构建方式，创建后会进入对应编辑器。</p>
        </div>
        <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={onClose}>x</button>
      </div>
      <div className="space-y-3">
        {getBuilderTemplates().map(template => (
          <BuilderTemplateCard key={template.id} template={template} onCreate={onCreateFromTemplate} />
        ))}
      </div>
    </div>
  </div>
)

const BuilderTemplateCard = ({
  template,
  onCreate
}: {
  template: BuilderTemplate
  onCreate: (templateId: BuilderTemplateId) => void
}) => (
  <button
    data-builder-template-id={template.id}
    data-builder-template-modules={template.modules.map(module => module.id).join(' ')}
    className="group flex w-full items-start gap-4 rounded-[20px] border border-gray-100 bg-gray-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-gray-300 hover:bg-white"
    onClick={() => onCreate(template.id)}
  >
    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-white shadow-sm ${template.accentClassName}`}>
      <BuilderTemplateIcon templateId={template.id} />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="whitespace-normal break-words text-lg font-bold leading-snug text-gray-950">{template.title}</h4>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500">{template.shortTitle}</span>
      </div>
      <p className="mt-1 whitespace-normal break-words text-sm leading-6 text-gray-500">{template.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {template.capabilities.map(capability => (
          <span key={capability} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-500">
            {capability}
          </span>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {template.modules.map(module => (
          <div key={module.id} className="rounded-xl bg-white px-3 py-2">
            <div className="whitespace-normal break-words text-sm font-semibold text-gray-800">{module.label}</div>
            <div className="mt-1 line-clamp-2 whitespace-normal break-words text-xs leading-5 text-gray-500">{module.description}</div>
          </div>
        ))}
      </div>
    </div>
    <div className="mt-1 flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-gray-600 transition group-hover:bg-black group-hover:text-white">
      Create
      <ArrowRight className="h-4 w-4" />
    </div>
  </button>
)

const BuilderTemplateIcon = ({ templateId }: { templateId: BuilderTemplateId }) => {
  if (templateId === 'storyboard') return <Film className="h-8 w-8" />
  if (templateId === 'three-stage') return <Grid2X2 className="h-8 w-8" />
  return <FolderPlus className="h-8 w-8" />
}
