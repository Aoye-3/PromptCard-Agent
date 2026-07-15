import { History, Image as ImageIcon, Plus } from 'lucide-react'
import { useState } from 'react'
import { ImageGenerationComposer } from './ImageGenerationComposer'
import { ImageGenerationHistoryDialog } from './ImageGenerationHistoryDialog'
import { ImageGenerationTurnCard } from './ImageGenerationTurnCard'
import type { ImageGenerationConversationPanelProps } from './types'

export const ImageGenerationConversationPanel = ({
  projectLabel,
  conversationLabel = '当前会话',
  statusLabel = '检查模型状态',
  statusReady = false,
  onConfigureModel,
  turns,
  composer,
  conversations,
  onNewConversation,
  onContinueConversation,
  onTurnAction
}: ImageGenerationConversationPanelProps) => {
  const [historyOpen, setHistoryOpen] = useState(false)
  const chronologicalTurns = [...turns].sort((left, right) => left.createdAt - right.createdAt)

  const continueConversation = (conversationId: string) => {
    onContinueConversation(conversationId)
    setHistoryOpen(false)
  }

  return (
    <section aria-label="图片生成会话" className="flex h-full min-h-0 flex-col bg-white text-gray-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-lg border border-gray-200 bg-gray-50 p-2"><ImageIcon size={18} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 className="text-base font-black">图片生成</h2>
            <p className="truncate text-xs text-gray-500">{projectLabel} · {conversationLabel}</p>
            <p className={`mt-0.5 text-[10px] font-bold ${statusReady ? 'text-emerald-700' : 'text-amber-700'}`}>{statusLabel}</p>
            {!statusReady && onConfigureModel && <button type="button" className="mt-1 text-[10px] font-black text-amber-800 underline" onClick={onConfigureModel}>前往配置图片模型</button>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="新建图片生成会话" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50" onClick={onNewConversation}>
            <Plus size={14} aria-hidden="true" /> 新建会话
          </button>
          <button type="button" aria-label="打开图片生成历史" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50" onClick={() => setHistoryOpen(true)}>
            <History size={14} aria-hidden="true" /> 历史记录
          </button>
        </div>
      </header>

      <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-4">
        {chronologicalTurns.map(turn => (
          <ImageGenerationTurnCard key={turn.id} turn={turn} onAction={onTurnAction} />
        ))}
        {chronologicalTurns.length === 0 && (
          <div className="flex min-h-56 flex-col items-center justify-center text-center">
            <ImageIcon size={28} className="mb-3 text-gray-400" aria-hidden="true" />
            <h3 className="text-sm font-black">开始一次图片生成</h3>
            <p className="mt-1 max-w-sm text-xs text-gray-500">输入描述，或上传参考图、注入当前画布节点。</p>
          </div>
        )}
      </div>

      <ImageGenerationComposer {...composer} />
      <ImageGenerationHistoryDialog
        open={historyOpen}
        conversations={conversations}
        onClose={() => setHistoryOpen(false)}
        onContinue={continueConversation}
      />
    </section>
  )
}

export default ImageGenerationConversationPanel
