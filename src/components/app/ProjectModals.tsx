import { Film, FolderPlus, Grid2X2 } from 'lucide-react'
import { getCardDefaultTitle } from '@/utils/promptParser'
import type { CardType } from '@/models/Card.model'
import type { IPromptHistory } from '@/models/PromptHistory.model'

export const HistoryModal = ({
  histories,
  onClose,
  onRestore
}: {
  histories: IPromptHistory[]
  onClose: () => void
  onRestore: (history: IPromptHistory) => void
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
    <div className="max-h-[80vh] w-[760px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">生成历史</h3>
          <p className="mt-1 text-sm text-gray-500">自动保存会记录 Prompt 快照，可恢复到任意历史版本。</p>
        </div>
        <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={onClose}>x</button>
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
                <button
                  className="rounded-full bg-black px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:bg-gray-300"
                  disabled={!history.pages?.length}
                  onClick={() => onRestore(history)}
                >
                  恢复
                </button>
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
  onCreateCard,
  onCreateStoryboard,
  onCreateThreeStage
}: {
  onClose: () => void
  onCreateCard: () => void
  onCreateStoryboard: () => void
  onCreateThreeStage: () => void
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
    <div className="w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-950">选择项目构建模式</h3>
          <p className="mt-2 text-sm text-gray-500">项目创建后模式固定。后续可以继续增加新的构建模式。</p>
        </div>
        <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={onClose}>x</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <button
          className="rounded-[24px] border border-gray-100 bg-gray-50 p-6 text-left transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-50"
          onClick={onCreateCard}
        >
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm">
            <FolderPlus className="h-8 w-8" />
          </div>
          <h4 className="text-xl font-bold text-gray-950">卡片式构建</h4>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">使用 PromptCard 组件库组织主体、动作、场景、风格、镜头等提示词要素。</p>
        </button>
        <button
          className="rounded-[24px] border border-gray-100 bg-gray-50 p-6 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50"
          onClick={onCreateStoryboard}
        >
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-500 shadow-sm">
            <Film className="h-8 w-8" />
          </div>
          <h4 className="text-xl font-bold text-gray-950">分镜表单式构建</h4>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">按镜头序列组织风格、约束和单镜头字段，右侧保留 Agent 对话入口。</p>
        </button>
        <button
          className="rounded-[24px] border border-gray-100 bg-gray-50 p-6 text-left transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50"
          onClick={onCreateThreeStage}
        >
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-emerald-500 shadow-sm">
            <Grid2X2 className="h-8 w-8" />
          </div>
          <h4 className="text-xl font-bold text-gray-950">三段式构建</h4>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">并列制作人物版、故事版和视频生成提示词，右侧聚焦编辑当前字段。</p>
        </button>
      </div>
    </div>
  </div>
)
