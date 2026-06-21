import { useEffect, useMemo, useRef, useState } from 'react'
import ThreeStageBuilderScreen from '@/components/ThreeStageBuilder'
import FreeCanvasBuilderScreen from '@/components/canvas/FreeCanvasBuilderScreen'
import { CardBuilderScreen } from './CardBuilderScreen'
import { StoryboardBuilderScreen } from './StoryboardBuilderScreen'
import { useCardStore } from '@/stores/card.store'
import { usePresetStore } from '@/stores/preset.store'
import { createInitialPage } from '@/stores/card-initial-state'
import { createStandaloneFreeCanvasProject, createStoryboardProject, createThreeStageProject } from '@/domain/projects/project-normalization'
import { assemblePrompt, getCardDefaultTitle } from '@/utils/promptParser'
import { findDuplicatePhrases, parsePromptToCardUpdates } from '@/utils/promptComposer'
import { useI18n } from '@/i18n'
import type { BuilderTemplate } from '@/domain/builder-templates/builder-templates'
import type { BuilderModePreviewSnapshot } from './builder-preview-contract'
import type { AgentWorkspaceProposal } from '@/models/Agent.model'
import type { CardType, IPreset } from '@/models/Card.model'
import type { IFreeCanvasProject, IPromptProject, IStoryboardProject, IThreeStageProject } from '@/models/PromptHistory.model'

type CardWorkspaceSnapshot = Pick<ReturnType<typeof useCardStore.getState>, 'pages' | 'currentPage'>

export const BuilderModePreviewFrame = ({
  template,
  snapshot,
  onSnapshotChange
}: {
  template: BuilderTemplate
  snapshot: BuilderModePreviewSnapshot
  onSnapshotChange: (snapshot: BuilderModePreviewSnapshot) => void
}) => (
  <div className="min-w-0 rounded-[28px] border border-gray-100 bg-white shadow-sm" data-builder-interactive-preview>
    {template.id === 'free-canvas' ? (
      <FreeCanvasPreviewHost key={template.id} template={template} snapshot={snapshot} onSnapshotChange={onSnapshotChange} />
    ) : template.id === 'storyboard' ? (
      <StoryboardPreviewHost key={template.id} template={template} snapshot={snapshot} onSnapshotChange={onSnapshotChange} />
    ) : template.id === 'three-stage' ? (
      <ThreeStagePreviewHost key={template.id} template={template} snapshot={snapshot} onSnapshotChange={onSnapshotChange} />
    ) : (
      <CardPreviewHost key={template.id} template={template} snapshot={snapshot} onSnapshotChange={onSnapshotChange} />
    )}
  </div>
)

const createPreviewProject = (template: BuilderTemplate): IPromptProject => {
  const now = Date.now()
  return {
    id: `preview-${template.id}`,
    title: `${template.shortTitle}预览`,
    type: template.projectType,
    revision: 0,
    pages: template.projectType === 'card' ? [createInitialPage(now)] : [],
    currentPage: 0,
    storyboard: template.projectType === 'storyboard' ? createStoryboardProject(now) : undefined,
    threeStage: template.projectType === 'three-stage' ? createThreeStageProject(now) : undefined,
    freeCanvas: template.projectType === 'free-canvas' ? createStandaloneFreeCanvasProject(now) : undefined,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    meta: { preview: true, builderTemplateId: template.id }
  }
}

const PreviewNotice = () => (
  <div className="border-b border-amber-100 bg-amber-50 px-6 py-3 text-sm font-semibold text-amber-800">
    预览模式：可正常编辑和试用构建页面，但不会创建项目、保存历史或写入本地文件。
  </div>
)

const CardPreviewHost = ({
  template,
  snapshot,
  onSnapshotChange
}: {
  template: BuilderTemplate
  snapshot: BuilderModePreviewSnapshot
  onSnapshotChange: (snapshot: BuilderModePreviewSnapshot) => void
}) => {
  const { t } = useI18n()
  const store = useCardStore()
  const workspaceSnapshotRef = useRef<CardWorkspaceSnapshot | null>(null)
  const incomingSnapshotRef = useRef(snapshot)
  const [duplicateMode, setDuplicateMode] = useState(false)
  const [activeEditMode, setActiveEditMode] = useState<'learn' | 'creative'>('creative')
  const baseProject = useMemo(() => createPreviewProject(template), [template])
  const [previewTitle, setPreviewTitle] = useState(baseProject.title)
  const activeProject = useMemo(() => ({
    ...baseProject,
    title: previewTitle
  }), [baseProject, previewTitle])

  useEffect(() => {
    incomingSnapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    const currentState = useCardStore.getState()
    const incomingSnapshot = incomingSnapshotRef.current
    workspaceSnapshotRef.current = {
      pages: currentState.pages,
      currentPage: currentState.currentPage
    }
    useCardStore.getState().restoreWorkspace({
      pages: incomingSnapshot.pages?.length ? incomingSnapshot.pages : baseProject.pages,
      currentPage: incomingSnapshot.currentPage ?? baseProject.currentPage
    })

    return () => {
      const previous = workspaceSnapshotRef.current
      if (previous) {
        useCardStore.getState().restoreWorkspace(previous)
      }
    }
  }, [baseProject])

  const pages = store.pages
  const currentCards = pages[store.currentPage]?.cards || []
  const currentPrompt = assemblePrompt(pages)
  const allCards = useMemo(() => pages.flatMap(page => page.cards), [pages])
  const duplicateResult = useMemo(() => findDuplicatePhrases(allCards), [allCards])

  useEffect(() => {
    onSnapshotChange({
      pages,
      currentPage: store.currentPage
    })
  }, [onSnapshotChange, pages, store.currentPage])

  const handleSavePreview = () => {
    window.alert('预览模式不会保存项目或历史。')
  }

  const handlePromptChange = (prompt: string) => {
    store.updateCards(parsePromptToCardUpdates(pages, prompt))
  }

  const handleCopyPrompt = async () => {
    if (!currentPrompt.trim()) {
      window.alert(t('noPromptToCopy'))
      return
    }
    await navigator.clipboard.writeText(currentPrompt)
    window.alert(t('promptCopied'))
  }

  const handleCopySelected = async () => {
    const combined = store.getCombinedPrompt()
    await navigator.clipboard.writeText(combined)
    window.alert(t('selectedCardsCopied', { count: store.selectedCards.length }))
  }

  const handleAddCard = () => {
    store.addCard('custom', getCardDefaultTitle('custom'), '')
  }

  const handleRenamePreviewProject = () => {
    const nextTitle = window.prompt('重命名项目', previewTitle)?.trim()
    if (nextTitle) setPreviewTitle(nextTitle)
  }

  const handleCreativePresetSelect = (preset: IPreset) => {
    store.addCard(preset.type as CardType, preset.label, preset.content)
  }

  const handleApplyAgentProposal = (proposal: AgentWorkspaceProposal) => {
    if (proposal.kind === 'workspace_card_create') {
      store.addCard(proposal.cardDraft.type, proposal.cardDraft.title, proposal.cardDraft.content)
    }
    if (proposal.kind === 'workspace_card_update') {
      store.updateCards(Object.fromEntries(
        proposal.updates.map(update => [
          update.cardId,
          {
            ...(typeof update.title === 'string' ? { title: update.title } : {}),
            ...(typeof update.content === 'string' ? { content: update.content } : {})
          }
        ])
      ))
    }
  }

  return (
    <>
      <PreviewNotice />
      <CardBuilderScreen
        activeProject={activeProject}
        pages={pages}
        currentPage={store.currentPage}
        currentCards={currentCards}
        currentPrompt={currentPrompt}
        selectedCardsCount={store.selectedCards.length}
        selectedCardIds={store.selectedCards}
        duplicateMode={duplicateMode}
        duplicateResult={duplicateResult}
        activeEditMode={activeEditMode}
        onBack={() => undefined}
        onRenameProject={handleRenamePreviewProject}
        onSave={handleSavePreview}
        onPromptChange={handlePromptChange}
        onCopyPrompt={handleCopyPrompt}
        onCopySelected={handleCopySelected}
        onClearSelection={store.clearSelection}
        onToggleDuplicates={() => setDuplicateMode(value => !value)}
        onSwitchPage={store.switchPage}
        onAddPage={store.addPage}
        onRemovePage={store.removePage}
        onAddCard={handleAddCard}
        onEditModeChange={setActiveEditMode}
        onCreativePresetSelect={handleCreativePresetSelect}
        onApplyAgentProposal={handleApplyAgentProposal}
        activeCardId={store.activeCardId}
        t={t}
        previewMode
      />
    </>
  )
}

const StoryboardPreviewHost = ({
  template,
  snapshot,
  onSnapshotChange
}: {
  template: BuilderTemplate
  snapshot: BuilderModePreviewSnapshot
  onSnapshotChange: (snapshot: BuilderModePreviewSnapshot) => void
}) => {
  const baseProject = useMemo(() => createPreviewProject(template), [template])
  const [previewTitle, setPreviewTitle] = useState(baseProject.title)
  const activeProject = useMemo(() => ({
    ...baseProject,
    title: previewTitle
  }), [baseProject, previewTitle])
  const [storyboard, setStoryboard] = useState<IStoryboardProject>(() => snapshot.storyboard || activeProject.storyboard || createStoryboardProject())

  const handleRenamePreviewProject = () => {
    const nextTitle = window.prompt('重命名项目', previewTitle)?.trim()
    if (nextTitle) setPreviewTitle(nextTitle)
  }

  useEffect(() => {
    onSnapshotChange({ storyboard })
  }, [onSnapshotChange, storyboard])

  return (
    <>
      <PreviewNotice />
      <StoryboardBuilderScreen
        activeProject={activeProject}
        storyboard={storyboard}
        onBack={() => undefined}
        onRenameProject={handleRenamePreviewProject}
        onSave={() => window.alert('预览模式不会保存项目或历史。')}
        onChange={setStoryboard}
        previewMode
      />
    </>
  )
}

const ThreeStagePreviewHost = ({
  template,
  snapshot,
  onSnapshotChange
}: {
  template: BuilderTemplate
  snapshot: BuilderModePreviewSnapshot
  onSnapshotChange: (snapshot: BuilderModePreviewSnapshot) => void
}) => {
  const { presets } = usePresetStore()
  const baseProject = useMemo(() => createPreviewProject(template), [template])
  const [previewTitle, setPreviewTitle] = useState(baseProject.title)
  const activeProject = useMemo(() => ({
    ...baseProject,
    title: previewTitle
  }), [baseProject, previewTitle])
  const [threeStage, setThreeStage] = useState<IThreeStageProject>(() => snapshot.threeStage || activeProject.threeStage || createThreeStageProject())
  const cameraPresets = useMemo(() => presets.filter(preset => preset.type === 'camera'), [presets])

  const handleRenamePreviewProject = () => {
    const nextTitle = window.prompt('重命名项目', previewTitle)?.trim()
    if (nextTitle) setPreviewTitle(nextTitle)
  }

  useEffect(() => {
    onSnapshotChange({ threeStage })
  }, [onSnapshotChange, threeStage])

  return (
    <>
      <PreviewNotice />
      <ThreeStageBuilderScreen
        activeProject={activeProject}
        threeStage={threeStage}
        cameraPresets={cameraPresets}
        onBack={() => undefined}
        onRenameProject={handleRenamePreviewProject}
        onSave={() => window.alert('预览模式不会保存项目或历史。')}
        onChange={setThreeStage}
        onIncrementPresetUsage={async () => undefined}
        previewMode
      />
    </>
  )
}

const FreeCanvasPreviewHost = ({
  template,
  snapshot,
  onSnapshotChange
}: {
  template: BuilderTemplate
  snapshot: BuilderModePreviewSnapshot
  onSnapshotChange: (snapshot: BuilderModePreviewSnapshot) => void
}) => {
  const baseProject = useMemo(() => createPreviewProject(template), [template])
  const [previewTitle, setPreviewTitle] = useState(baseProject.title)
  const activeProject = useMemo(() => ({
    ...baseProject,
    title: previewTitle
  }), [baseProject, previewTitle])
  const [freeCanvas, setFreeCanvas] = useState<IFreeCanvasProject>(() => snapshot.freeCanvas || activeProject.freeCanvas || createStandaloneFreeCanvasProject())

  const handleRenamePreviewProject = () => {
    const nextTitle = window.prompt('重命名项目', previewTitle)?.trim()
    if (nextTitle) setPreviewTitle(nextTitle)
  }

  useEffect(() => {
    onSnapshotChange({ freeCanvas })
  }, [freeCanvas, onSnapshotChange])

  return (
    <>
      <PreviewNotice />
      <FreeCanvasBuilderScreen
        activeProject={activeProject}
        freeCanvas={freeCanvas}
        onBack={() => undefined}
        onRenameProject={handleRenamePreviewProject}
        onSave={() => window.alert('预览模式不会保存项目或历史。')}
        onChange={setFreeCanvas}
        previewMode
      />
    </>
  )
}
