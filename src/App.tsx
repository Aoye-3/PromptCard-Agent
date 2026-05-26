import { useEffect, useMemo, useRef, useState } from 'react'
import PromptLibrary from './components/PromptLibrary'
import ThreeStageBuilderScreen from './components/ThreeStageBuilder'
import { AgentDashboard } from './components/AgentDashboard'
import { AppShell } from './components/app/AppShell'
import { ProjectHome } from './components/app/ProjectHome'
import { CardBuilderScreen } from './components/app/CardBuilderScreen'
import { StoryboardBuilderScreen } from './components/app/StoryboardBuilderScreen'
import { MeScreen } from './components/app/MeScreen'
import { TemplateLibraryScreen } from './components/app/TemplateLibraryScreen'
import type { BuilderModePreviewSnapshot } from './components/app/builder-preview-contract'
import { AddCardModal, CreateProjectModal, HistoryModal, RenameProjectModal } from './components/app/ProjectModals'
import { useCardStore } from './stores/card.store'
import { usePresetStore } from './stores/preset.store'
import { createInitialPage } from './stores/card-initial-state'
import { assemblePrompt, getCardDefaultTitle } from './utils/promptParser'
import { findDuplicatePhrases, parsePromptToCardUpdates } from './utils/promptComposer'
import { useI18n } from './i18n'
import { storage } from './utils/storage'
import { createBuilderTemplateProjectTitle, getBuilderTemplateById } from './domain/builder-templates/builder-templates'
import type { BuilderTemplateId } from './domain/builder-templates/builder-templates'
import type { IPreset, CardType } from './models/Card.model'
import type { IPromptHistory, IPromptProject, IStoryboardProject, IThreeStageProject } from './models/PromptHistory.model'
import type { AgentWorkspaceProposal } from './models/Agent.model'
import type { MainTab, ProjectMode, SaveStatus } from './features/app/app-types'
import type { TrashEntry } from './storage/storage-service-client'

function App() {
  const { language, setLanguage, t, cardTypeLabel } = useI18n()
  const {
    pages,
    currentPage,
    addCard,
    updateCard,
    updateCards,
    activeCardId,
    activePresetCardId,
    setActivePresetCardId,
    addPage,
    switchPage,
    removePage,
    restoreWorkspace,
    selectedCards,
    getCombinedPrompt,
    clearSelection
  } = useCardStore()
  const { init: initPresets, presets, incrementUsage } = usePresetStore()

  const [activeTab, setActiveTab] = useState<MainTab>('projects')
  const [projectMode, setProjectMode] = useState<ProjectMode>('home')
  const [projects, setProjects] = useState<IPromptProject[]>([])
  const [projectTrash, setProjectTrash] = useState<TrashEntry<IPromptProject>[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [selectedProjectTrashIds, setSelectedProjectTrashIds] = useState<string[]>([])
  const [showProjectTrash, setShowProjectTrash] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [promptHistory, setPromptHistory] = useState<IPromptHistory[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showAddCardModal, setShowAddCardModal] = useState(false)
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false)
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false)
  const [renameProject, setRenameProject] = useState<IPromptProject | null>(null)
  const [renameProjectTitle, setRenameProjectTitle] = useState('')
  const [duplicateMode, setDuplicateMode] = useState(false)
  const [activeEditMode, setActiveEditMode] = useState<'learn' | 'creative'>('creative')
  const [showSettings, setShowSettings] = useState(false)
  const lastHistoryContentRef = useRef('')

  const currentCards = pages[currentPage]?.cards || []
  const currentPrompt = assemblePrompt(pages)
  const allCards = useMemo(() => pages.flatMap(page => page.cards), [pages])
  const duplicateResult = useMemo(() => findDuplicatePhrases(allCards), [allCards])
  const activeProject = projects.find(project => project.id === activeProjectId) || null
  const storyboardSnapshot = useMemo(
    () => activeProject?.type === 'storyboard' ? JSON.stringify(activeProject.storyboard || null) : '',
    [activeProject]
  )
  const threeStageSnapshot = useMemo(
    () => activeProject?.type === 'three-stage' ? JSON.stringify(activeProject.threeStage || null) : '',
    [activeProject]
  )
  const activePresetCard = activePresetCardId ? currentCards.find(card => card.id === activePresetCardId) : null
  const presetsForActiveCard = useMemo(
    () => activePresetCard ? presets.filter(preset => preset.type === activePresetCard.type) : [],
    [activePresetCard, presets]
  )
  const cameraPresets = useMemo(
    () => presets.filter(preset => preset.type === 'camera'),
    [presets]
  )

  useEffect(() => {
    initPresets()
  }, [initPresets])

  useEffect(() => {
    let cancelled = false

    const loadAppData = async () => {
      try {
        const [savedProjects, trash, workspace, history] = await Promise.all([
          storage.projects.getAll(),
          storage.projects.getTrash(),
          storage.workspace.get(),
          storage.history.getAll()
        ])

        if (cancelled) return

        let nextProjects = savedProjects
        if (savedProjects.length === 0 && workspace?.pages?.length) {
          const hasLegacyContent = assemblePrompt(workspace.pages).trim().length > 0
          if (hasLegacyContent) {
            const migratedProject = await storage.projects.create({
              title: '迁移项目',
              pages: workspace.pages,
              currentPage: workspace.currentPage,
              meta: { source: 'legacy-workspace' }
            })
            nextProjects = [migratedProject]
          }
        }

        setProjects(nextProjects)
        setProjectTrash(trash)
        setPromptHistory(history)
        lastHistoryContentRef.current = history[0]?.content || ''
        setSaveStatus('saved')
      } catch (error) {
        console.error('Failed to load app data:', error)
        setSaveStatus('error')
      } finally {
        if (!cancelled) {
          setIsHydrated(true)
        }
      }
    }

    loadAppData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isHydrated || !activeProjectId || projectMode !== 'builder' || activeProject?.type !== 'card') return

    setSaveStatus('saving')
    const timeoutId = window.setTimeout(async () => {
      try {
        const savedAt = Date.now()
        const updatedProject = await storage.projects.update(activeProjectId, {
          pages,
          currentPage,
          updatedAt: savedAt,
          lastOpenedAt: savedAt
        })
        await storage.workspace.save({ pages, currentPage, savedAt })

        if (updatedProject) {
          setProjects(await storage.projects.getAll())
        }

        const trimmedPrompt = currentPrompt.trim()
        if (trimmedPrompt && trimmedPrompt !== lastHistoryContentRef.current) {
          const snapshot = await storage.history.addSnapshot({
            content: trimmedPrompt,
            cards: allCards,
            pages,
            title: `${activeProject?.title || 'Project'}  Auto ${new Date(savedAt).toLocaleString()}`,
            meta: { source: 'auto-save', projectId: activeProjectId }
          })

          if (snapshot) {
            lastHistoryContentRef.current = snapshot.content
            setPromptHistory(await storage.history.getAll())
          }
        }

        setLastSavedAt(savedAt)
        setSaveStatus('saved')
      } catch (error) {
        console.error('Auto-save failed:', error)
        setSaveStatus('error')
      }
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [activeProject?.title, activeProject?.type, activeProjectId, allCards, currentPage, currentPrompt, isHydrated, pages, projectMode])

  useEffect(() => {
    if (!isHydrated || !activeProjectId || projectMode !== 'builder' || activeProject?.type !== 'storyboard' || !activeProject.storyboard) return

    setSaveStatus('saving')
    const timeoutId = window.setTimeout(async () => {
      try {
        const savedAt = Date.now()
        const updatedProject = await storage.projects.update(activeProjectId, {
          storyboard: activeProject.storyboard,
          updatedAt: savedAt,
          lastOpenedAt: savedAt
        })

        if (updatedProject) {
          setProjects(await storage.projects.getAll())
        }

        setLastSavedAt(savedAt)
        setSaveStatus('saved')
      } catch (error) {
        console.error('Storyboard auto-save failed:', error)
        setSaveStatus('error')
      }
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [activeProject?.storyboard, activeProject?.type, activeProjectId, isHydrated, projectMode, storyboardSnapshot])

  useEffect(() => {
    if (!isHydrated || !activeProjectId || projectMode !== 'builder' || activeProject?.type !== 'three-stage' || !activeProject.threeStage) return

    setSaveStatus('saving')
    const timeoutId = window.setTimeout(async () => {
      try {
        const savedAt = Date.now()
        const updatedProject = await storage.projects.update(activeProjectId, {
          threeStage: activeProject.threeStage,
          updatedAt: savedAt,
          lastOpenedAt: savedAt
        })

        if (updatedProject) {
          setProjects(await storage.projects.getAll())
        }

        setLastSavedAt(savedAt)
        setSaveStatus('saved')
      } catch (error) {
        console.error('Three-stage auto-save failed:', error)
        setSaveStatus('error')
      }
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [activeProject?.threeStage, activeProject?.type, activeProjectId, isHydrated, projectMode, threeStageSnapshot])

  const refreshProjects = async () => {
    const [nextProjects, nextTrash] = await Promise.all([
      storage.projects.getAll(),
      storage.projects.getTrash()
    ])
    setProjects(nextProjects)
    setProjectTrash(nextTrash)
  }

  const handleCreateProject = () => {
    setShowCreateProjectModal(true)
  }

  const handleCreateProjectFromTemplate = async (templateId: BuilderTemplateId, snapshot?: BuilderModePreviewSnapshot) => {
    const template = getBuilderTemplateById(templateId)
    const title = createBuilderTemplateProjectTitle(template, projects)
    const meta = { builderTemplateId: template.id }
    const newProject = template.projectType === 'storyboard'
      ? await storage.projects.createStoryboard({ title, storyboard: snapshot?.storyboard, meta })
      : template.projectType === 'three-stage'
        ? await storage.projects.createThreeStage({ title, threeStage: snapshot?.threeStage, meta })
        : await storage.projects.create({
            title,
            pages: snapshot?.pages?.length ? snapshot.pages : [createInitialPage()],
            currentPage: snapshot?.currentPage ?? 0,
            meta
          })

    setShowCreateProjectModal(false)
    setShowTemplateLibrary(false)
    await openProject(newProject)
  }

  const openProject = async (project: IPromptProject) => {
    if (project.type === 'card') {
      restoreWorkspace({
        pages: project.pages,
        currentPage: project.currentPage
      })
    }
    await storage.projects.setLastOpened(project.id)
    setActiveProjectId(project.id)
    setActiveTab('projects')
    setProjectMode('builder')
    await refreshProjects()
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('确定要删除这个项目吗？历史快照会暂时保留。')) return
    await storage.projects.delete(projectId)
    setSelectedProjectIds(ids => ids.filter(id => id !== projectId))
    if (activeProjectId === projectId) {
      setActiveProjectId(null)
      setProjectMode('home')
      restoreWorkspace({ pages: [createInitialPage()], currentPage: 0 })
    }
    await refreshProjects()
  }

  const handleToggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds(ids => ids.includes(projectId) ? ids.filter(id => id !== projectId) : [...ids, projectId])
  }

  const handleToggleProjectTrashSelection = (projectId: string) => {
    setSelectedProjectTrashIds(ids => ids.includes(projectId) ? ids.filter(id => id !== projectId) : [...ids, projectId])
  }

  const handleTrashSelectedProjects = async () => {
    if (selectedProjectIds.length === 0) return
    if (!confirm(`Move ${selectedProjectIds.length} project(s) to trash?`)) return
    await storage.projects.trash(selectedProjectIds)
    if (activeProjectId && selectedProjectIds.includes(activeProjectId)) {
      setActiveProjectId(null)
      setProjectMode('home')
      restoreWorkspace({ pages: [createInitialPage()], currentPage: 0 })
    }
    setSelectedProjectIds([])
    await refreshProjects()
  }

  const handleRestoreSelectedProjects = async () => {
    if (selectedProjectTrashIds.length === 0) return
    await storage.projects.restore(selectedProjectTrashIds)
    setSelectedProjectTrashIds([])
    await refreshProjects()
  }

  const handleDeleteSelectedProjectsForever = async () => {
    if (selectedProjectTrashIds.length === 0) return
    if (!confirm(`Permanently delete ${selectedProjectTrashIds.length} project(s)? This cannot be undone.`)) return
    await storage.projects.deleteForever(selectedProjectTrashIds)
    setSelectedProjectTrashIds([])
    await refreshProjects()
  }
  const handleRenameProject = async (project: IPromptProject) => {
    setRenameProject(project)
    setRenameProjectTitle(project.title)
  }

  const handleConfirmRenameProject = async () => {
    if (!renameProject) return
    const nextTitle = renameProjectTitle.trim()
    if (!nextTitle || nextTitle === renameProject.title) {
      setRenameProject(null)
      setRenameProjectTitle('')
      return
    }

    const updatedProject = await storage.projects.update(renameProject.id, {
      title: nextTitle,
      updatedAt: Date.now()
    })
    if (updatedProject) {
      setProjects(await storage.projects.getAll())
    }
    setRenameProject(null)
    setRenameProjectTitle('')
  }

  const handleBackToProjects = () => {
    setProjectMode('home')
    setActiveProjectId(null)
  }

  const handleUpdateStoryboard = (storyboard: IStoryboardProject) => {
    if (!activeProjectId) return
    setProjects(currentProjects => currentProjects.map(project =>
      project.id === activeProjectId
        ? { ...project, storyboard, updatedAt: Date.now() }
        : project
    ))
  }

  const handleUpdateThreeStage = (threeStage: IThreeStageProject) => {
    if (!activeProjectId) return
    setProjects(currentProjects => currentProjects.map(project =>
      project.id === activeProjectId
        ? { ...project, threeStage, updatedAt: Date.now() }
        : project
    ))
  }

  const handleCopyPrompt = async () => {
    if (!currentPrompt.trim()) {
      alert(t('noPromptToCopy'))
      return
    }
    try {
      await navigator.clipboard.writeText(currentPrompt)
      alert(t('promptCopied'))
    } catch (error) {
      console.error('Copy failed:', error)
      alert(t('copyFailed'))
    }
  }

  const handleCopySelectedCards = async () => {
    const combined = getCombinedPrompt()
    await navigator.clipboard.writeText(combined)
    alert(t('selectedCardsCopied', { count: selectedCards.length }))
  }

  const handlePromptChange = (prompt: string) => {
    updateCards(parsePromptToCardUpdates(pages, prompt))
  }

  const handleSave = async () => {
    if (!activeProjectId) return
    try {
      const savedAt = Date.now()
      if (activeProject?.type === 'storyboard') {
        await storage.projects.update(activeProjectId, {
          storyboard: activeProject.storyboard,
          updatedAt: savedAt,
          lastOpenedAt: savedAt
        })
        setLastSavedAt(savedAt)
        setSaveStatus('saved')
        await refreshProjects()
        alert(t('saveSuccess'))
        return
      }

      if (activeProject?.type === 'three-stage') {
        await storage.projects.update(activeProjectId, {
          threeStage: activeProject.threeStage,
          updatedAt: savedAt,
          lastOpenedAt: savedAt
        })
        setLastSavedAt(savedAt)
        setSaveStatus('saved')
        await refreshProjects()
        alert(t('saveSuccess'))
        return
      }

      await storage.projects.update(activeProjectId, {
        pages,
        currentPage,
        updatedAt: savedAt,
        lastOpenedAt: savedAt
      })
      await storage.workspace.save({ pages, currentPage, savedAt })

      if (currentPrompt.trim()) {
        const snapshot = await storage.history.addSnapshot({
          content: currentPrompt,
          cards: allCards,
          pages,
          title: `${activeProject?.title || 'Project'}  Manual ${new Date(savedAt).toLocaleString()}`,
          meta: { source: 'manual-save', projectId: activeProjectId }
        })

        if (snapshot) {
          lastHistoryContentRef.current = snapshot.content
          setPromptHistory(await storage.history.getAll())
        }
      }

      setLastSavedAt(savedAt)
      setSaveStatus('saved')
      await refreshProjects()
      alert(t('saveSuccess'))
    } catch (error) {
      console.error('Save failed:', error)
      setSaveStatus('error')
      alert(t('saveFailed'))
    }
  }

  const handleRestoreHistory = (history: IPromptHistory) => {
    if (!history.pages?.length) return

    restoreWorkspace({
      pages: history.pages,
      currentPage: 0
    })
    setShowHistory(false)
    lastHistoryContentRef.current = history.content
  }

  const handleDeleteHistory = async (historyId: string) => {
    if (!confirm('Delete this prompt history item?')) return
    await storage.history.delete(historyId)
    const nextHistory = await storage.history.getAll()
    setPromptHistory(nextHistory)
    lastHistoryContentRef.current = nextHistory[0]?.content || ''
  }

  const handleClearHistory = async () => {
    if (!confirm(`Delete all ${promptHistory.length} prompt history items?`)) return
    await storage.history.clear()
    setPromptHistory([])
    lastHistoryContentRef.current = ''
    setShowHistory(false)
  }

  const handleCreativePresetSelect = (preset: IPreset) => {
    addCard(preset.type as CardType, preset.label, preset.content)
    alert(t('cardAdded', { title: preset.label }))
  }

  const handleAddNewCard = (type: CardType) => {
    const title = getCardDefaultTitle(type)
    addCard(type, title, '')
    setShowAddCardModal(false)
    alert(t('cardAdded', { title }))
  }

  const handleApplyCardAgentProposal = (proposal: AgentWorkspaceProposal) => {
    if (proposal.kind === 'workspace_card_create') {
      addCard(proposal.cardDraft.type, proposal.cardDraft.title, proposal.cardDraft.content)
    }
    if (proposal.kind === 'workspace_card_update') {
      updateCards(Object.fromEntries(
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

  const handleExportData = async () => {
    const data = await storage.exportData()
    await navigator.clipboard.writeText(data)
    alert('导出数据已复制到剪贴板。')
  }

  const saveStatusText = saveStatus === 'loading'
    ? '加载存档...'
    : saveStatus === 'saving'
      ? '自动保存中...'
      : saveStatus === 'error'
        ? '保存失败'
        : lastSavedAt
          ? `已自动保存 ${new Date(lastSavedAt).toLocaleTimeString()}`
          : '已启用自动保存'

  const cardTypes = [
    { type: 'subject', label: cardTypeLabel('subject'), color: 'bg-blue-100 text-blue-700' },
    { type: 'action', label: cardTypeLabel('action'), color: 'bg-green-100 text-green-700' },
    { type: 'scene', label: cardTypeLabel('scene'), color: 'bg-purple-100 text-purple-700' },
    { type: 'style', label: cardTypeLabel('style'), color: 'bg-orange-100 text-orange-700' },
    { type: 'camera', label: cardTypeLabel('camera'), color: 'bg-red-100 text-red-700' },
    { type: 'lighting', label: cardTypeLabel('lighting'), color: 'bg-yellow-100 text-yellow-700' },
    { type: 'timing', label: cardTypeLabel('timing'), color: 'bg-amber-100 text-amber-700' },
    { type: 'audio', label: cardTypeLabel('audio'), color: 'bg-teal-100 text-teal-700' },
    { type: 'constraint', label: cardTypeLabel('constraint'), color: 'bg-purple-100 text-purple-700' },
    { type: 'custom', label: cardTypeLabel('custom'), color: 'bg-gray-100 text-gray-700' }
  ] as const

  const content = activeTab === 'library' ? (
    <PromptLibrary embedded />
  ) : activeTab === 'agents' ? (
      <AgentDashboard />
  ) : activeTab === 'me' ? (
    <MeScreen
      language={language}
      setLanguage={setLanguage}
      showSettings={showSettings}
      setShowSettings={setShowSettings}
      onExportData={handleExportData}
    />
  ) : showTemplateLibrary ? (
    <TemplateLibraryScreen onCreateFromTemplate={handleCreateProjectFromTemplate} />
  ) : projectMode === 'builder' && activeProject?.type === 'storyboard' && activeProject.storyboard ? (
    <StoryboardBuilderScreen
      activeProject={activeProject}
      storyboard={activeProject.storyboard}
      onBack={handleBackToProjects}
      onSave={handleSave}
      onChange={handleUpdateStoryboard}
    />
  ) : projectMode === 'builder' && activeProject?.type === 'three-stage' && activeProject.threeStage ? (
    <ThreeStageBuilderScreen
      activeProject={activeProject}
      threeStage={activeProject.threeStage}
      cameraPresets={cameraPresets}
      onBack={handleBackToProjects}
      onSave={handleSave}
      onChange={handleUpdateThreeStage}
      onIncrementPresetUsage={incrementUsage}
    />
  ) : projectMode === 'builder' && activeProject?.type === 'card' ? (
    <CardBuilderScreen
      activeProject={activeProject}
      pages={pages}
      currentPage={currentPage}
      currentCards={currentCards}
      currentPrompt={currentPrompt}
      selectedCardsCount={selectedCards.length}
      selectedCardIds={selectedCards}
      duplicateMode={duplicateMode}
      duplicateResult={duplicateResult}
      activeEditMode={activeEditMode}
      onBack={handleBackToProjects}
      onSave={handleSave}
      onPromptChange={handlePromptChange}
      onCopyPrompt={handleCopyPrompt}
      onCopySelected={handleCopySelectedCards}
      onClearSelection={clearSelection}
      onToggleDuplicates={() => setDuplicateMode(value => !value)}
      onSwitchPage={switchPage}
      onAddPage={addPage}
      onRemovePage={removePage}
      onAddCard={() => setShowAddCardModal(true)}
      onEditModeChange={setActiveEditMode}
      onCreativePresetSelect={handleCreativePresetSelect}
      onApplyAgentProposal={handleApplyCardAgentProposal}
      activeCardId={activeCardId}
      t={t}
    />
  ) : (
    <ProjectHome
      projects={projects}
      projectTrash={projectTrash}
      selectedProjectIds={selectedProjectIds}
      selectedProjectTrashIds={selectedProjectTrashIds}
      showProjectTrash={showProjectTrash}
      promptHistory={promptHistory}
      onCreateProject={handleCreateProject}
      onOpenProject={openProject}
      onDeleteProject={handleDeleteProject}
      onRenameProject={handleRenameProject}
      onShowHistory={() => setShowHistory(true)}
      onToggleProjectSelection={handleToggleProjectSelection}
      onToggleProjectTrashSelection={handleToggleProjectTrashSelection}
      onSelectAllProjects={() => setSelectedProjectIds(projects.map(project => project.id))}
      onSelectAllProjectTrash={() => setSelectedProjectTrashIds(projectTrash.map(entry => entry.id))}
      onClearProjectSelection={() => setSelectedProjectIds([])}
      onClearProjectTrashSelection={() => setSelectedProjectTrashIds([])}
      onTrashSelectedProjects={handleTrashSelectedProjects}
      onRestoreSelectedProjects={handleRestoreSelectedProjects}
      onDeleteSelectedProjectsForever={handleDeleteSelectedProjectsForever}
      onShowProjectTrash={(show) => {
        setShowProjectTrash(show)
        setSelectedProjectIds([])
        setSelectedProjectTrashIds([])
      }}
    />
  )

  return (
    <AppShell
      activeTab={activeTab}
      setActiveTab={(tab) => {
        setActiveTab(tab)
        setShowTemplateLibrary(false)
        if (tab !== 'projects') setProjectMode('home')
      }}
      projectMode={projectMode}
      saveStatus={saveStatus}
      saveStatusText={saveStatusText}
      activeProject={activeProject}
      onCreateProject={handleCreateProject}
      onOpenTemplateLibrary={() => setShowTemplateLibrary(true)}
      onShowProjectTrash={() => {
        setActiveTab('projects')
        setProjectMode('home')
        setShowTemplateLibrary(false)
        setShowProjectTrash(true)
      }}
      showProjectUtilities={activeTab === 'projects'}
    >
      {content}

      {showHistory && (
        <HistoryModal
          histories={promptHistory}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestoreHistory}
          onDelete={handleDeleteHistory}
          onClear={handleClearHistory}
        />
      )}

      {showAddCardModal && (
        <AddCardModal cardTypes={cardTypes} onClose={() => setShowAddCardModal(false)} onAddCard={handleAddNewCard} />
      )}

      {showCreateProjectModal && (
        <CreateProjectModal
          onClose={() => setShowCreateProjectModal(false)}
          onCreateFromTemplate={handleCreateProjectFromTemplate}
        />
      )}

      {renameProject && (
        <RenameProjectModal
          title={renameProjectTitle}
          onTitleChange={setRenameProjectTitle}
          onClose={() => {
            setRenameProject(null)
            setRenameProjectTitle('')
          }}
          onConfirm={handleConfirmRenameProject}
        />
      )}

      {activePresetCard && (
        <div className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/40" onClick={() => setActivePresetCardId(null)}>
          <div className="max-h-[70vh] w-[500px] cursor-default overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('selectPresetPrompt')}</h3>
              <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={() => setActivePresetCardId(null)}>
                x
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {presetsForActiveCard.length > 0 ? (
                presetsForActiveCard.map(preset => (
                  <button
                    key={preset.id}
                    className="block rounded-2xl border border-gray-100 p-3 text-left transition hover:border-gray-300 hover:bg-gray-50"
                    onClick={async () => {
                      updateCard(activePresetCard.id, {
                        title: preset.label,
                        content: preset.content
                      })
                      await incrementUsage(preset.id)
                      setActivePresetCardId(null)
                    }}
                  >
                    <div className="mb-1 text-sm font-medium">{preset.label}</div>
                    <div className="line-clamp-2 text-xs text-gray-500">{preset.content}</div>
                  </button>
                ))
              ) : (
                <div className="py-8 text-center text-sm text-gray-500">{t('noPresetForType')}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default App
