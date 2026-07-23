import { Box, History, Image as ImageIcon, Pencil, Plus, ScanLine, Sparkles } from 'lucide-react'
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
  onOpenSubjectLibrary,
  turns,
  composer,
  conversations,
  onNewConversation,
  onContinueConversation,
  onOpenHistoryConversation,
  onLoadMoreConversations,
  onLoadMoreConversationRuns,
  hasMoreConversations,
  hasMoreConversationRuns,
  onTurnAction
}: ImageGenerationConversationPanelProps) => {
  const [historyOpen, setHistoryOpen] = useState(false)
  const chronologicalTurns = [...turns].sort((left, right) => left.createdAt - right.createdAt)

  const continueConversation = (conversationId: string) => {
    onContinueConversation(conversationId)
    setHistoryOpen(false)
  }
  const handleTurnAction: NonNullable<ImageGenerationConversationPanelProps['onTurnAction']> = (turn, action) => {
    if (action === 'history') {
      setHistoryOpen(true)
      return
    }
    onTurnAction?.(turn, action)
  }

  const starterActions = [
    {
      label: '生成一张新图',
      icon: <Sparkles size={14} aria-hidden="true" />,
      onClick: () => composer.onPromptChange('生成一张新图片：'),
      disabled: false
    },
    {
      label: '参考当前画布',
      icon: <ScanLine size={14} aria-hidden="true" />,
      onClick: () => {
        if (composer.selectedNode && composer.onInjectSelectedNode) {
          composer.onInjectSelectedNode(composer.selectedNode.id)
          return
        }
        composer.onPromptChange('参考当前画布内容生成：')
      },
      disabled: false
    },
    {
      label: '编辑选中图片',
      icon: <Pencil size={14} aria-hidden="true" />,
      onClick: () => {
        composer.onWorkflowChange('smart-edit')
        composer.onPromptChange('编辑当前选中的图片：')
      },
      disabled: false
    },
    {
      label: '从主体库添加',
      icon: <Box size={14} aria-hidden="true" />,
      onClick: () => onOpenSubjectLibrary?.(),
      disabled: !onOpenSubjectLibrary
    }
  ]

  return (
    <section aria-label="图片生成会话" className="flex h-full min-h-0 flex-col bg-white text-[#141413]">
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[#e5e7eb] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <ImageIcon size={14} className="shrink-0 text-[#5e5d59]" aria-hidden="true" />
          <span className="truncate text-[11px] font-semibold text-[#4d4c48]">{projectLabel} · {conversationLabel}</span>
          {composer.selectedNodeCount ? (
            <span className="hidden shrink-0 rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[9px] font-semibold text-[#5e5d59] sm:inline">
              已选 {composer.selectedNodeCount} 个节点
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!statusReady && onConfigureModel && (
            <button
              type="button"
              className="h-7 rounded-lg px-2 text-[10px] font-semibold text-amber-800 transition hover:bg-amber-50"
              title={statusLabel}
              onClick={onConfigureModel}
            >
              配置
            </button>
          )}
          <button
            type="button"
            aria-label="新建图片生成会话"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5e5d59] transition hover:bg-[#f3f4f6] hover:text-[#141413]"
            onClick={onNewConversation}
          >
            <Plus size={14} aria-hidden="true" />
            <span className="sr-only">新建会话</span>
          </button>
          <button
            type="button"
            aria-label="打开图片生成历史"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5e5d59] transition hover:bg-[#f3f4f6] hover:text-[#141413]"
            onClick={() => setHistoryOpen(true)}
          >
            <History size={14} aria-hidden="true" />
            <span className="sr-only">历史记录</span>
          </button>
        </div>
      </header>

      <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {chronologicalTurns.map(turn => (
          <ImageGenerationTurnCard key={turn.id} turn={turn} onAction={handleTurnAction} />
        ))}
        {chronologicalTurns.length === 0 && (
          <div aria-label="开始一次图片生成" className="mt-3 rounded-[10px] border border-[#e5e7eb] bg-white p-3">
            <div className="flex items-start gap-2">
              <ImageIcon size={17} className="mt-0.5 shrink-0 text-[#87867f]" aria-hidden="true" />
              <div>
                <h3 className="text-[13px] font-bold text-[#141413]">开始一次图片生成</h3>
                <p className="mt-0.5 text-[11px] leading-4 text-[#87867f]">描述画面，或添加参考图与画布节点。</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {starterActions.map(action => (
                <button
                  key={action.label}
                  type="button"
                  aria-label={action.label}
                  className="flex h-9 items-center gap-2 rounded-lg border border-[#e5e7eb] px-2.5 text-left text-[11px] font-semibold text-[#5e5d59] transition hover:border-[#d1d5db] hover:bg-[#f9fafb] hover:text-[#141413] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.icon}
                  <span className="truncate">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ImageGenerationComposer {...composer} />
      <ImageGenerationHistoryDialog
        open={historyOpen}
        conversations={conversations}
        onClose={() => setHistoryOpen(false)}
        onContinue={continueConversation}
        onSelectConversation={onOpenHistoryConversation}
        onLoadMoreConversations={onLoadMoreConversations}
        onLoadMoreRuns={onLoadMoreConversationRuns}
        hasMoreConversations={hasMoreConversations}
        hasMoreRuns={hasMoreConversationRuns}
      />
    </section>
  )
}

export default ImageGenerationConversationPanel
