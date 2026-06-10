import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PromptLibrary from './components/PromptLibrary'
import ThreeStageBuilderScreen from './components/ThreeStageBuilder'
import { AgentDashboard } from './components/AgentDashboard'
import { AppShell } from './components/app/AppShell'
import { ProjectHome } from './components/app/ProjectHome'
import { CardBuilderScreen } from './components/app/CardBuilderScreen'
import { StoryboardBuilderScreen } from './components/app/StoryboardBuilderScreen'
import FreeCanvasBuilderScreen from './components/canvas/FreeCanvasBuilderScreen'
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
import { sortProjects } from './domain/projects/project-normalization'
import { mergeStoredProjectMetadata } from './domain/projects/project-storage-merge'
import { createProjectSaveCoordinator, type ProjectSaveResult } from './domain/projects/project-save-coordinator'
import type { IPreset, CardType } from './models/Card.model'
import type { IPromptHistory, IPromptProject, IStoryboardProject, IThreeStageProject } from './models/PromptHistory.model'
import type { AgentWorkspaceProposal } from './models/Agent.model'
import type { IUserSettings } from './models/UserSettings.model'
import type { MainTab, ProjectMode, SaveStatus } from './features/app/app-types'
import type { TrashEntry } from './storage/storage-service-client'

const DEFAULT_USER_SETTINGS: IUserSettings = {
  theme: 'light',
  defaultMode: 'learn',
  autoSave: true,
  autoSaveIdleSeconds: 10,
  presetSort: 'usage',
  meta: {}
}

const AppStartupScreen = () => (
  <div className="app-startup-screen" role="status" aria-live="polite">
    <div className="app-startup-panel">
      <div className="app-startup-brand">PMAgent</div>
      <div className="app-startup-row">
        <div className="app-startup-spinner" aria-hidden="true"></div>
        <span>正在加载本地数据...</span>
      </div>
      <div className="app-startup-progress" aria-hidden="true"></div>
    </div>
  </div>
)

const createCardWorkspaceSnapshot = (project: Pick<IPromptProject, 'pages' | 'currentPage'>) =>
  JSON.stringify({ pages: project.pages, currentPage: project.currentPage })

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
  const { init: initPresets, getByType: getPresetsByType, incrementUsage } = usePresetStore()

  const [activeTab, setActiveTab] = useState<MainTab>('projects')
  const [projectMode, setProjectMode] = useState<ProjectMode>('home')
  const [projects, setProjects] = useState<IPromptProject[]>([])
  const [projectTrash, setProjectTrash] = useState<TrashEntry<IPromptProject>[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [selectedProjectTrashIds, setSelectedProjectTrashIds] = useState<string[]>([])
  const [showProjectTrash, setShowProjectTrash] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [appSaveStatus, setAppSaveStatus] = useState<SaveStatus>('loading')
  const [projectSaveStates, setProjectSaveStates] = useState<Record<string, { status: SaveStatus; lastSavedAt: number | null }>>({})
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
  const [userSettings, setUserSettings] = useState<IUserSettings>(DEFAULT_USER_SETTINGS)
  const lastHistoryContentRef = useRef('')
  const projectEditSeqRef = useRef<Record<string, number>>({})
  const lastCardWorkspaceSnapshotRef = useRef('')
  const activeProjectRef = useRef<IPromptProject | null>(null)
  const projectSaveCoordinatorRef = useRef<ReturnType<typeof createProjectSaveCoordinator> | null>(null)
  if (!projectSaveCoordinatorRef.current) {
    projectSaveCoordinatorRef.current = createProjectSaveCoordinator({
      create: project => storage.projects.persistCreated(project),
      update: async (id, revision, updates) => {
        const updatedProject = await storage.projects.update(id, updates, { revision })
        if (!updatedProject) throw new Error(`Project ${id} was not found while saving.`)
        return updatedProject
      }
    })
  }
  const projectSaveCoordinator = projectSaveCoordinatorRef.current

  const currentCards = pages[currentPage]?.cards || []
  const currentPrompt = assemblePrompt(pages)
  const allCards = useMemo(() => pages.flatMap(page => page.cards), [pages])
  const duplicateResult = useMemo(() => findDuplicatePhrases(allCards), [allCards])
  const activeProject = projects.find(project => project.id === activeProjectId) || null
  const activeProjectSaveState = activeProjectId ? projectSaveStates[activeProjectId] : undefined
  const saveStatus = activeProjectSaveState?.status || appSaveStatus
  const lastSavedAt = activeProjectSaveState?.lastSavedAt || null
  const storyboardSnapshot = useMemo(
    () => activeProject?.type === 'storyboard' ? JSON.stringify(activeProject.storyboard || null) : '',
    [activeProject]
  )
  const threeStageSnapshot = useMemo(
    () => activeProject?.type === 'three-stage' ? JSON.stringify(activeProject.threeStage || null) : '',
    [activeProject]
  )
  const activePresetCard = activePresetCardId ? currentCards.find(card => card.id === activePresetCardId) : null
  const presetsForActiveCard = activePresetCard ? getPresetsByType(activePresetCard.type) : []

  useEffect(() => {
    activeProjectRef.current = activeProject
  }, [activeProject])

  const upsertProject = useCallback((project: IPromptProject) => {
    setProjects(currentProjects => sortProjects([
      project,
      ...currentProjects.filter(currentProject => currentProject.id !== project.id)
    ]))
  }, [])

  const confirmStoredProjectMetadata = useCallback((project: IPromptProject, options: { includeTitle?: boolean; savedAt?: number } = {}) => {
    setProjects(currentProjects => {
      return mergeStoredProjectMetadata(currentProjects, project, options)
    })
  }, [])

  const markProjectEdited = useCallback((projectId: string) => {
    projectEditSeqRef.current[projectId] = (projectEditSeqRef.current[projectId] || 0) + 1
  }, [])

  const getProjectEditSeq = useCallback((projectId: string) => projectEditSeqRef.current[projectId] || 0, [])

  const setProjectSaveStatus = useCallback((projectId: string, status: SaveStatus, savedAt?: number) => {
    setProjectSaveStates(current => ({
      ...current,
      [projectId]: {
        status,
        lastSavedAt: savedAt ?? current[projectId]?.lastSavedAt ?? null
      }
    }))
  }, [])

  const canConfirmProjectSaved = useCallback((projectId: string, editSeq: number) => (
    getProjectEditSeq(projectId) === editSeq && !projectSaveCoordinator.hasPending(projectId)
  ), [getProjectEditSeq, projectSaveCoordinator])

  const confirmAutoSavedProject = useCallback((project: IPromptProject, savedAt: number, editSeq: number) => {
    setProjects(currentProjects => {
      const existingProject = currentProjects.find(currentProject => currentProject.id === project.id)
      if (!existingProject) return currentProjects
      const saveIsCurrent = (projectEditSeqRef.current[project.id] || 0) === editSeq

      return sortProjects(currentProjects.map(currentProject =>
        currentProject.id === project.id
          ? {
              ...currentProject,
              revision: project.revision,
              updatedAt: saveIsCurrent
                ? Math.max(currentProject.updatedAt, project.updatedAt || savedAt)
                : currentProject.updatedAt,
              lastOpenedAt: Math.max(currentProject.lastOpenedAt || 0, project.lastOpenedAt || savedAt)
            }
          : currentProject
      ))
    })
  }, [])

  const handleProjectSaveError = useCallback((projectId: string, error: unknown, message: string) => {
    console.error(message, error)
    setProjectSaveStatus(projectId, 'error')
  }, [setProjectSaveStatus])

  const persistProjectChanges = useCallback(async (
    project: IPromptProject,
    updates: Partial<IPromptProject>,
    editSeq: number,
    savedAt: number,
    errorMessage: string
  ): Promise<ProjectSaveResult> => {
    const snapshot = { ...project, ...updates }
    const result = await projectSaveCoordinator.enqueue({ project: snapshot, editSeq })
    if (result.status === 'saved' && result.project) {
      confirmAutoSavedProject(result.project, savedAt, editSeq)
    } else if (result.status === 'failed') {
      handleProjectSaveError(project.id, result.error, errorMessage)
    }
    return result
  }, [confirmAutoSavedProject, handleProjectSaveError, projectSaveCoordinator])

  const removeProjectsFromState = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    setProjects(currentProjects => currentProjects.filter(project => !idSet.has(project.id)))
  }, [])

  const appendProjectTrashEntries = useCallback((trashedProjects: IPromptProject[], deletedAt = Date.now()) => {
    if (trashedProjects.length === 0) return

    setProjectTrash(currentTrash => {
      const trashedIds = new Set(trashedProjects.map(project => project.id))
      return [
        ...currentTrash.filter(entry => !trashedIds.has(entry.id)),
        ...trashedProjects.map(project => ({
          id: project.id,
          deletedAt,
          deletedBy: 'user' as const,
          deleteReason: null,
          payload: project
        }))
      ]
    })
  }, [])

  useEffect(() => {
    initPresets()
  }, [initPresets])

  useEffect(() => {
    if (!isHydrated || !activeProjectId || projectMode !== 'builder' || activeProject?.type !== 'card') {
      lastCardWorkspaceSnapshotRef.current = createCardWorkspaceSnapshot({ pages, currentPage })
      return
    }

    const nextSnapshot = createCardWorkspaceSnapshot({ pages, currentPage })
    if (!lastCardWorkspaceSnapshotRef.current) {
      lastCardWorkspaceSnapshotRef.current = nextSnapshot
      return
    }

    if (lastCardWorkspaceSnapshotRef.current !== nextSnapshot) {
      markProjectEdited(activeProjectId)
      const updatedAt = Date.now()
      setProjects(currentProjects => currentProjects.map(project =>
        project.id === activeProjectId
          ? { ...project, pages, currentPage, updatedAt }
          : project
      ))
      lastCardWorkspaceSnapshotRef.current = nextSnapshot
    }
  }, [activeProject?.type, activeProjectId, currentPage, isHydrated, markProjectEdited, pages, projectMode])

  useEffect(() => {
    let cancelled = false

    const loadAppData = async () => {
      try {
        const [savedProjects, trash, workspace, history, settings] = await Promise.all([
          storage.projects.getAll(),
          storage.projects.getTrash(),
          storage.workspace.get(),
          storage.history.getAll(),
          storage.settings.get()
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
        setUserSettings(settings)
        lastHistoryContentRef.current = history[0]?.content || ''
        setAppSaveStatus('saved')
      } catch (error) {
        console.error('Failed to load app data:', error)
        setAppSaveStatus('error')
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
    if (!isHydrated || !userSettings.autoSave || !activeProjectId || projectMode !== 'builder' || activeProjectRef.current?.type !== 'card') return

    const timeoutId = window.setTimeout(async () => {
      try {
        const project = activeProjectRef.current
        if (!project || project.id !== activeProjectId || project.type !== 'card') return
        setProjectSaveStatus(activeProjectId, 'saving')
        const savedAt = Date.now()
        const editSeq = getProjectEditSeq(activeProjectId)
        const result = await persistProjectChanges(project, {
          pages,
          currentPage,
          updatedAt: savedAt,
          lastOpenedAt: savedAt
        }, editSeq, savedAt, 'Auto-save failed:')
        if (result.status === 'failed') return
        await storage.workspace.save({ pages, currentPage, savedAt })

        const saveIsCurrent = canConfirmProjectSaved(activeProjectId, editSeq)

        const trimmedPrompt = currentPrompt.trim()
        if (saveIsCurrent && trimmedPrompt && trimmedPrompt !== lastHistoryContentRef.current) {
          const snapshot = await storage.history.addSnapshot({
            content: trimmedPrompt,
            cards: allCards,
            pages,
            title: `${project.title || 'Project'}  Auto ${new Date(savedAt).toLocaleString()}`,
            meta: { source: 'auto-save', projectId: activeProjectId }
          })

          if (snapshot) {
            lastHistoryContentRef.current = snapshot.content
            setPromptHistory(await storage.history.getAll())
          }
        }

        if (result.status === 'saved' && saveIsCurrent) {
          setProjectSaveStatus(activeProjectId, 'saved', savedAt)
        }
      } catch (error) {
        handleProjectSaveError(activeProjectId, error, 'Auto-save failed:')
      }
    }, userSettings.autoSaveIdleSeconds * 1000)

    return () => window.clearTimeout(timeoutId)
  }, [activeProjectId, allCards, canConfirmProjectSaved, currentPage, currentPrompt, getProjectEditSeq, handleProjectSaveError, isHydrated, pages, persistProjectChanges, projectMode, setProjectSaveStatus, userSettings.autoSave, userSettings.autoSaveIdleSeconds])

  useEffect(() => {
    if (!isHydrated || !userSettings.autoSave || !activeProjectId || projectMode !== 'builder' || !storyboardSnapshot) return

    const timeoutId = window.setTimeout(async () => {
      try {
        const project = activeProjectRef.current
        if (!project || project.id !== activeProjectId || project.type !== 'storyboard' || !project.storyboard) return
        setProjectSaveStatus(activeProjectId, 'saving')
        const savedAt = Date.now()
        const editSeq = getProjectEditSeq(activeProjectId)
        const result = await persistProjectChanges(project, {
          storyboard: project.storyboard,
          updatedAt: savedAt,
          lastOpenedAt: savedAt
        }, editSeq, savedAt, 'Storyboard auto-save failed:')
        if (result.status === 'failed') return

        const saveIsCurrent = canConfirmProjectSaved(activeProjectId, editSeq)
        if (result.status === 'saved' && saveIsCurrent) {
          setProjectSaveStatus(activeProjectId, 'saved', savedAt)
        }
      } catch (error) {
        handleProjectSaveError(activeProjectId, error, 'Storyboard auto-save failed:')
      }
    }, userSettings.autoSaveIdleSeconds * 1000)

    return () => window.clearTimeout(timeoutId)
  }, [activeProjectId, canConfirmProjectSaved, getProjectEditSeq, handleProjectSaveError, isHydrated, persistProjectChanges, projectMode, setProjectSaveStatus, storyboardSnapshot, userSettings.autoSave, userSettings.autoSaveIdleSeconds])

  useEffect(() => {
    if (!isHydrated || !userSettings.autoSave || !activeProjectId || projectMode !== 'builder' || !threeStageSnapshot) return

    const timeoutId = window.setTimeout(async () => {
      try {
        const project = activeProjectRef.current
        if (!project || project.id !== activeProjectId || project.type !== 'three-stage' || !project.threeStage) return
        setProjectSaveStatus(activeProjectId, 'saving')
        const savedAt = Date.now()
        const editSeq = getProjectEditSeq(activeProjectId)
        const result = await persistProjectChanges(project, {
          threeStage: project.threeStage,
          updatedAt: savedAt,
          lastOpenedAt: savedAt
        }, editSeq, savedAt, 'Three-stage auto-save failed:')
        if (result.status === 'failed') return

        const saveIsCurrent = canConfirmProjectSaved(activeProjectId, editSeq)
        if (result.status === 'saved' && saveIsCurrent) {
          setProjectSaveStatus(activeProjectId, 'saved', savedAt)
        }
      } catch (error) {
        handleProjectSaveError(activeProjectId, error, 'Three-stage auto-save failed:')
      }
    }, userSettings.autoSaveIdleSeconds * 1000)

    return () => window.clearTimeout(timeoutId)
  }, [activeProjectId, canConfirmProjectSaved, getProjectEditSeq, handleProjectSaveError, isHydrated, persistProjectChanges, projectMode, setProjectSaveStatus, threeStageSnapshot, userSettings.autoSave, userSettings.autoSaveIdleSeconds])

  const handleCreateProject = () => {
    setShowCreateProjectModal(true)
  }

  const handleCreateCardProject = async () => {
    const newProject = storage.projects.createDraft({
      title: `未命名项目 ${projects.length + 1}`,
      pages: [createInitialPage()],
      currentPage: 0
    })
    await createProjectOptimistically(newProject)
  }

  const handleCreateStoryboardProject = async () => {
    const newProject = storage.projects.createStoryboardDraft({
      title: `分镜项目 ${projects.filter(project => project.type === 'storyboard').length + 1}`
    })
    await createProjectOptimistically(newProject)
  }

  const handleCreateThreeStageProject = async () => {
    const newProject = storage.projects.createThreeStageDraft({
      title: `三段式项目 ${projects.filter(project => project.type === 'three-stage').length + 1}`
    })
    await createProjectOptimistically(newProject)
  }

  const handleCreateProjectFromTemplate = async (templateId: BuilderTemplateId, snapshot?: BuilderModePreviewSnapshot) => {
    const template = getBuilderTemplateById(templateId)
    const title = createBuilderTemplateProjectTitle(template, projects)
    const meta = { builderTemplateId: template.id }
    const newProject = template.projectType === 'storyboard'
      ? storage.projects.createStoryboardDraft({ title, storyboard: snapshot?.storyboard, meta })
      : template.projectType === 'three-stage'
        ? storage.projects.createThreeStageDraft({ title, threeStage: snapshot?.threeStage, meta })
        : storage.projects.createDraft({
            title,
            pages: snapshot?.pages?.length ? snapshot.pages : [createInitialPage()],
            currentPage: snapshot?.currentPage || 0,
            meta
          })

    setShowTemplateLibrary(false)
    await createProjectOptimistically(newProject)
  }

  const openProject = async (project: IPromptProject, options: { touchLastOpened?: boolean } = {}) => {
    const touchLastOpened = options.touchLastOpened ?? true
    const openedAt = Math.max(Date.now(), ...projects.map(currentProject => currentProject.lastOpenedAt || 0)) + 1
    const optimisticProject = touchLastOpened
      ? { ...project, updatedAt: openedAt, lastOpenedAt: openedAt }
      : project

    if (project.type === 'card') {
      lastCardWorkspaceSnapshotRef.current = createCardWorkspaceSnapshot(project)
      restoreWorkspace({
        pages: project.pages,
        currentPage: project.currentPage
      })
    }
    setActiveProjectId(project.id)
    setActiveTab('projects')
    setProjectMode('builder')
    upsertProject(optimisticProject)

    if (!touchLastOpened) return

    const result = await projectSaveCoordinator.enqueue({
      project: optimisticProject,
      editSeq: getProjectEditSeq(project.id)
    })
    if (result.status === 'saved' && result.project) {
      confirmStoredProjectMetadata(result.project, { savedAt: openedAt })
    } else if (result.status === 'failed') {
      handleProjectSaveError(project.id, result.error, 'Failed to update project last opened time:')
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('确定要删除这个项目吗？历史快照会暂时保留。')) return
    const projectToDelete = projects.find(project => project.id === projectId)
    if (!projectToDelete) return

    const previousProjects = projects
    const previousProjectTrash = projectTrash
    const previousActiveProjectId = activeProjectId
    const previousProjectMode = projectMode
    const previousWorkspace = { pages, currentPage }
    const deletedAt = Date.now()

    removeProjectsFromState([projectId])
    appendProjectTrashEntries([projectToDelete], deletedAt)
    setSelectedProjectIds(ids => ids.filter(id => id !== projectId))

    if (activeProjectId === projectId) {
      setActiveProjectId(null)
      setProjectMode('home')
      restoreWorkspace({ pages: [createInitialPage()], currentPage: 0 })
    }

    try {
      const trashedProjects = await storage.projects.delete(projectId)
      appendProjectTrashEntries(trashedProjects, deletedAt)
    } catch (error) {
      console.error('Failed to delete project:', error)
      setProjects(previousProjects)
      setProjectTrash(previousProjectTrash)
      setActiveProjectId(previousActiveProjectId)
      setProjectMode(previousProjectMode)
      restoreWorkspace(previousWorkspace)
      setAppSaveStatus('error')
      alert('Failed to delete project.')
    }
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
    const idsToTrash = selectedProjectIds
    const projectsToTrash = projects.filter(project => idsToTrash.includes(project.id))
    const previousProjects = projects
    const previousProjectTrash = projectTrash
    const previousActiveProjectId = activeProjectId
    const previousProjectMode = projectMode
    const previousWorkspace = { pages, currentPage }
    const deletedAt = Date.now()

    removeProjectsFromState(idsToTrash)
    appendProjectTrashEntries(projectsToTrash, deletedAt)
    if (activeProjectId && idsToTrash.includes(activeProjectId)) {
      setActiveProjectId(null)
      setProjectMode('home')
      restoreWorkspace({ pages: [createInitialPage()], currentPage: 0 })
    }
    setSelectedProjectIds([])

    try {
      const trashedProjects = await storage.projects.trash(idsToTrash)
      appendProjectTrashEntries(trashedProjects, deletedAt)
    } catch (error) {
      console.error('Failed to move projects to trash:', error)
      setProjects(previousProjects)
      setProjectTrash(previousProjectTrash)
      setActiveProjectId(previousActiveProjectId)
      setProjectMode(previousProjectMode)
      restoreWorkspace(previousWorkspace)
      setSelectedProjectIds(idsToTrash)
      setAppSaveStatus('error')
      alert('Failed to move projects to trash.')
    }
  }

  const handleRestoreSelectedProjects = async () => {
    if (selectedProjectTrashIds.length === 0) return
    const idsToRestore = selectedProjectTrashIds
    const entriesToRestore = projectTrash.filter(entry => idsToRestore.includes(entry.id))
    const previousProjects = projects
    const previousProjectTrash = projectTrash

    setProjectTrash(currentTrash => currentTrash.filter(entry => !idsToRestore.includes(entry.id)))
    setProjects(currentProjects => sortProjects([
      ...entriesToRestore.map(entry => entry.payload),
      ...currentProjects.filter(project => !idsToRestore.includes(project.id))
    ]))
    setSelectedProjectTrashIds([])

    try {
      const restoredProjects = await storage.projects.restore(idsToRestore)
      setProjects(currentProjects => sortProjects([
        ...restoredProjects,
        ...currentProjects.filter(project => !idsToRestore.includes(project.id))
      ]))
    } catch (error) {
      console.error('Failed to restore projects:', error)
      setProjects(previousProjects)
      setProjectTrash(previousProjectTrash)
      setSelectedProjectTrashIds(idsToRestore)
      setAppSaveStatus('error')
      alert('Failed to restore projects.')
    }
  }

  const handleDeleteSelectedProjectsForever = async () => {
    if (selectedProjectTrashIds.length === 0) return
    if (!confirm(`Permanently delete ${selectedProjectTrashIds.length} project(s)? This cannot be undone.`)) return
    const idsToDelete = selectedProjectTrashIds
    const previousProjectTrash = projectTrash

    setProjectTrash(currentTrash => currentTrash.filter(entry => !idsToDelete.includes(entry.id)))
    setSelectedProjectTrashIds([])

    try {
      await storage.projects.deleteForever(idsToDelete)
    } catch (error) {
      console.error('Failed to permanently delete projects:', error)
      setProjectTrash(previousProjectTrash)
      setSelectedProjectTrashIds(idsToDelete)
      setAppSaveStatus('error')
      alert('Failed to permanently delete projects.')
    }
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

    const optimisticProject = { ...renameProject, title: nextTitle, updatedAt: Date.now() }
    markProjectEdited(renameProject.id)
    const editSeq = getProjectEditSeq(renameProject.id)
    upsertProject(optimisticProject)
    setProjectSaveStatus(renameProject.id, 'saving')
    const result = await projectSaveCoordinator.enqueue({
      project: optimisticProject,
      editSeq
    })
    if (result.status === 'saved' && result.project) {
      confirmStoredProjectMetadata(result.project, { includeTitle: true })
      if (canConfirmProjectSaved(renameProject.id, editSeq)) {
        setProjectSaveStatus(renameProject.id, 'saved', optimisticProject.updatedAt)
      }
    } else if (result.status === 'failed') {
      handleProjectSaveError(renameProject.id, result.error, 'Failed to rename project:')
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
    markProjectEdited(activeProjectId)
    setProjects(currentProjects => currentProjects.map(project =>
      project.id === activeProjectId
        ? { ...project, storyboard, updatedAt: Date.now() }
        : project
    ))
  }

  const handleUpdateThreeStage = (threeStage: IThreeStageProject) => {
    if (!activeProjectId) return
    markProjectEdited(activeProjectId)
    setProjects(currentProjects => currentProjects.map(project =>
      project.id === activeProjectId
        ? { ...project, threeStage, updatedAt: Date.now() }
        : project
    ))
  }

  const handleUpdateUserSettings = async (settings: Partial<IUserSettings>) => {
    const updated = await storage.settings.save(settings)
    setUserSettings(updated)
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
    if (!activeProjectId || !activeProject) return
    try {
      setProjectSaveStatus(activeProjectId, 'saving')
      const savedAt = Date.now()
      const editSeq = getProjectEditSeq(activeProjectId)
      if (activeProject?.type === 'storyboard') {
        const result = await persistProjectChanges(activeProject, {
          storyboard: activeProject.storyboard,
          updatedAt: savedAt,
          lastOpenedAt: savedAt
        }, editSeq, savedAt, 'Save failed:')
        if (result.status === 'failed') {
          alert(t('saveFailed'))
          return
        }
        const saveIsCurrent = canConfirmProjectSaved(activeProjectId, editSeq)
        if (result.status === 'saved' && saveIsCurrent) {
          setProjectSaveStatus(activeProjectId, 'saved', savedAt)
          alert(t('saveSuccess'))
        }
        return
      }

      if (activeProject?.type === 'three-stage') {
        const result = await persistProjectChanges(activeProject, {
          threeStage: activeProject.threeStage,
          updatedAt: savedAt,
          lastOpenedAt: savedAt
        }, editSeq, savedAt, 'Save failed:')
        if (result.status === 'failed') {
          alert(t('saveFailed'))
          return
        }
        const saveIsCurrent = canConfirmProjectSaved(activeProjectId, editSeq)
        if (result.status === 'saved' && saveIsCurrent) {
          setProjectSaveStatus(activeProjectId, 'saved', savedAt)
          alert(t('saveSuccess'))
        }
        return
      }

      const result = await persistProjectChanges(activeProject, {
        pages,
        currentPage,
        updatedAt: savedAt,
        lastOpenedAt: savedAt
      }, editSeq, savedAt, 'Save failed:')
      if (result.status === 'failed') {
        alert(t('saveFailed'))
        return
      }
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

      if (result.status === 'saved' && canConfirmProjectSaved(activeProjectId, editSeq)) {
        setProjectSaveStatus(activeProjectId, 'saved', savedAt)
        alert(t('saveSuccess'))
      }
    } catch (error) {
      handleProjectSaveError(activeProjectId, error, 'Save failed:')
      alert(t('saveFailed'))
    }
  }

  const createProjectOptimistically = async (project: IPromptProject): Promise<void> => {
    setShowCreateProjectModal(false)
    projectSaveCoordinator.markPendingCreate(project)
    void openProject(project, { touchLastOpened: false })
    setProjectSaveStatus(project.id, 'saving')
    const result = await projectSaveCoordinator.enqueue({
      project,
      editSeq: getProjectEditSeq(project.id)
    })
    if (result.status === 'saved' && result.project) {
      confirmStoredProjectMetadata(result.project, { savedAt: Date.now() })
      setProjectSaveStatus(
        project.id,
        canConfirmProjectSaved(project.id, result.editSeq) ? 'saved' : 'saving',
        Date.now()
      )
    } else if (result.status === 'failed') {
      handleProjectSaveError(project.id, result.error, 'Failed to create project:')
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

  if (!isHydrated) {
    return <AppStartupScreen />
  }

  const saveStatusText = !userSettings.autoSave
    ? '自动保存已关闭'
    : saveStatus === 'loading'
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
      settings={userSettings}
      onSettingsChange={handleUpdateUserSettings}
      onExportData={handleExportData}
    />
  ) : showTemplateLibrary ? (
    <TemplateLibraryScreen onCreateFromTemplate={handleCreateProjectFromTemplate} />
  ) : projectMode === 'builder' && activeProject?.type === 'storyboard' && activeProject.storyboard ? (
    <StoryboardBuilderScreen
      activeProject={activeProject}
      storyboard={activeProject.storyboard}
      onBack={handleBackToProjects}
      onRenameProject={() => handleRenameProject(activeProject)}
      onSave={handleSave}
      onChange={handleUpdateStoryboard}
    />
  ) : projectMode === 'builder' && activeProject?.type === 'three-stage' && activeProject.threeStage && activeProject.meta?.builderTemplateId === 'free-canvas' ? (
    <FreeCanvasBuilderScreen
      activeProject={activeProject}
      threeStage={activeProject.threeStage}
      onBack={handleBackToProjects}
      onRenameProject={() => handleRenameProject(activeProject)}
      onSave={handleSave}
      onChange={handleUpdateThreeStage}
    />
  ) : projectMode === 'builder' && activeProject?.type === 'three-stage' && activeProject.threeStage ? (
    <ThreeStageBuilderScreen
      activeProject={activeProject}
      threeStage={activeProject.threeStage}
      cameraPresets={getPresetsByType('camera')}
      onBack={handleBackToProjects}
      onRenameProject={() => handleRenameProject(activeProject)}
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
      onRenameProject={() => handleRenameProject(activeProject)}
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
      onOpenTemplateLibrary={() => {
        setActiveTab('projects')
        setProjectMode('home')
        setActiveProjectId(null)
        setShowProjectTrash(false)
        setShowTemplateLibrary(true)
      }}
      onShowProjectTrash={() => {
        setActiveTab('projects')
        setProjectMode('home')
        setShowTemplateLibrary(false)
        setShowProjectTrash(true)
      }}
      showProjectUtilities={activeTab === 'projects' && projectMode === 'home'}
    >
      {content}

      {showHistory && (
        <HistoryModal histories={promptHistory} onClose={() => setShowHistory(false)} onRestore={handleRestoreHistory} />
      )}

      {showAddCardModal && (
        <AddCardModal cardTypes={cardTypes} onClose={() => setShowAddCardModal(false)} onAddCard={handleAddNewCard} />
      )}

      {showCreateProjectModal && (
        <CreateProjectModal
          onClose={() => setShowCreateProjectModal(false)}
          onCreateCard={handleCreateCardProject}
          onCreateStoryboard={handleCreateStoryboardProject}
          onCreateThreeStage={handleCreateThreeStageProject}
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
