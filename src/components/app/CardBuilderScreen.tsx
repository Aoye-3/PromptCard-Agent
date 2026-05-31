import { useState } from 'react'
import { Bot, Copy, Database, Grid2X2, Home, Pencil, Plus, Trash2 } from 'lucide-react'
import CardComponent from '@/components/CardComponent'
import CreativeMode from '@/components/CreativeMode'
import PromptComposer from '@/components/PromptComposer'
import { AIChatbotBox } from '@/components/AgentCollaborationPanel'
import { buildCardWorkspaceContext } from '@/utils/agent-workspace'
import { findDuplicatePhrases } from '@/utils/promptComposer'
import type { IPreset } from '@/models/Card.model'
import type { IPromptProject } from '@/models/PromptHistory.model'
import type { AgentWorkspaceProposal } from '@/models/Agent.model'
import type { useI18n } from '@/i18n'

export const CardBuilderScreen = ({
  activeProject,
  pages,
  currentPage,
  currentCards,
  currentPrompt,
  selectedCardsCount,
  selectedCardIds,
  duplicateMode,
  duplicateResult,
  activeEditMode,
  onBack,
  onRenameProject,
  onSave,
  onPromptChange,
  onCopyPrompt,
  onCopySelected,
  onClearSelection,
  onToggleDuplicates,
  onSwitchPage,
  onAddPage,
  onRemovePage,
  onAddCard,
  onEditModeChange,
  onCreativePresetSelect,
  onApplyAgentProposal,
  activeCardId,
  t,
  previewMode = false
}: {
  activeProject: IPromptProject
  pages: IPromptProject['pages']
  currentPage: number
  currentCards: IPromptProject['pages'][number]['cards']
  currentPrompt: string
  selectedCardsCount: number
  selectedCardIds: string[]
  duplicateMode: boolean
  duplicateResult: ReturnType<typeof findDuplicatePhrases>
  activeEditMode: 'learn' | 'creative'
  onBack: () => void
  onRenameProject?: () => void
  onSave: () => void
  onPromptChange: (prompt: string) => void
  onCopyPrompt: () => void
  onCopySelected: () => void
  onClearSelection: () => void
  onToggleDuplicates: () => void
  onSwitchPage: (pageIndex: number) => void
  onAddPage: () => void
  onRemovePage: (pageIndex: number) => void
  onAddCard: () => void
  onEditModeChange: (mode: 'learn' | 'creative') => void
  onCreativePresetSelect: (preset: IPreset) => void
  onApplyAgentProposal: (proposal: AgentWorkspaceProposal) => void
  activeCardId: string | null
  t: ReturnType<typeof useI18n>['t']
  previewMode?: boolean
}) => {
  const [rightPanelMode, setRightPanelMode] = useState<'structured' | 'agent'>('structured')
  const workspaceContext = buildCardWorkspaceContext({
    activeProject,
    pages,
    currentPage,
    currentPrompt,
    selectedCardIds
  })

  return (
  <section className="px-6 pt-7">
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
        <p className="mt-1 text-sm text-gray-500">卡片构建模式</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200" onClick={onCopyPrompt}>
          <Copy className="h-4 w-4" />
          {t('copyAllPrompt')}
        </button>
        <button className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800" onClick={onSave}>
          <Database className="h-4 w-4" />
          {previewMode ? '预览不保存' : t('save')}
        </button>
      </div>
    </div>

    <PromptComposer
      pages={pages}
      currentPrompt={currentPrompt}
      selectedCardsCount={selectedCardsCount}
      duplicateMode={duplicateMode}
      duplicateCount={duplicateMode ? duplicateResult.duplicates.length : 0}
      onPromptChange={onPromptChange}
      onCopyPrompt={onCopyPrompt}
      onCopySelected={onCopySelected}
      onClearSelection={onClearSelection}
      onToggleDuplicates={onToggleDuplicates}
    />

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">{t('cardLibrary')}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {pages.map((_, index) => (
                <div key={index} className="flex items-center gap-1">
                  <button
                    className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                      currentPage === index ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    onClick={() => onSwitchPage(index)}
                  >
                    {index + 1}
                  </button>
                  {pages.length > 1 && (
                    <button
                      className="rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      onClick={() => {
                        if (confirm(t('deletePageConfirm'))) onRemovePage(index)
                      }}
                      title={t('deletePageTitle')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button className="rounded-full bg-gray-100 p-2 text-gray-700 hover:bg-gray-200" onClick={onAddPage}>
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {currentCards.map(card => (
            <CardComponent
              key={card.id}
              card={card}
              activeEditMode={activeEditMode}
              onEditModeChange={onEditModeChange}
              duplicatePhrases={duplicateMode ? duplicateResult.byCardId[card.id] || [] : []}
            />
          ))}
          <button
            id="add-card-btn"
            className="flex min-h-[220px] flex-col items-center justify-center rounded-[20px] border border-dashed border-gray-200 bg-gray-50 p-5 text-gray-500 transition hover:border-gray-300 hover:bg-gray-100"
            onClick={onAddCard}
          >
            <Plus className="mb-2 h-8 w-8" />
            <p className="text-sm font-semibold">{t('addCard')}</p>
            <p className="mt-1 text-xs text-gray-400">{t('supportedCardTypes')}</p>
          </button>
        </div>
      </div>
      <aside className="rounded-[24px] border border-gray-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
        <div className="border-b border-gray-100 p-4">
          <div className={`grid gap-2 rounded-2xl bg-gray-50 p-1 ${previewMode ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <button
              type="button"
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition ${
                rightPanelMode === 'structured'
                  ? 'bg-white text-gray-950 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
              onClick={() => setRightPanelMode('structured')}
            >
              <Grid2X2 className="h-4 w-4" />
              结构化卡片输入
            </button>
            {!previewMode && (
            <button
              type="button"
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition ${
                rightPanelMode === 'agent'
                  ? 'bg-white text-gray-950 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
              onClick={() => setRightPanelMode('agent')}
            >
              <Bot className="h-4 w-4" />
              Agent 协作
            </button>
            )}
          </div>
        </div>
        {!previewMode && rightPanelMode === 'agent' && (
        <AIChatbotBox
          title="Agent 协作"
          mode="card-workspace"
          sessionKey={`workspace:card:${activeProject.id}`}
          workspaceContext={workspaceContext}
          onApplyWorkspaceProposal={onApplyAgentProposal}
          autoApplyWorkspaceChanges
        />
        )}
        {rightPanelMode === 'structured' && (
        <div>
        <div className="border-b border-gray-100 p-5">
          <h2 className="text-lg font-bold">结构化卡片输入</h2>
          <p className="mt-1 text-sm text-gray-500">先使用结构化卡片输入创建内容，再切换到 Agent 协作继续编辑。</p>
        </div>
        <CreativeMode
          onPresetSelect={onCreativePresetSelect}
          initialType={activeCardId ? pages[currentPage]?.cards.find(card => card.id === activeCardId)?.type : 'subject'}
        />
        </div>
        )}
      </aside>
    </div>
  </section>
  )
}
