import type { ReactNode } from 'react'
import { Bell, Bot, Folder, Grid2X2, Image, Moon, Plus, Smile, Trash2, Users } from 'lucide-react'
import type { IPromptProject } from '@/models/PromptHistory.model'
import type { MainTab, ProjectMode, SaveStatus } from '@/features/app/app-types'
import { useI18n } from '@/i18n'

export const AppShell = ({
  activeTab,
  setActiveTab,
  projectMode,
  saveStatus,
  saveStatusText,
  activeProject,
  onCreateProject,
  onOpenTemplateLibrary,
  onShowProjectTrash,
  showProjectUtilities,
  children
}: {
  activeTab: MainTab
  setActiveTab: (tab: MainTab) => void
  projectMode: ProjectMode
  saveStatus: SaveStatus
  saveStatusText: string
  activeProject: IPromptProject | null
  onCreateProject: () => void
  onOpenTemplateLibrary: () => void
  onShowProjectTrash: () => void
  showProjectUtilities: boolean
  children: ReactNode
}) => {
  const { t } = useI18n()

  return (
  <div className="min-h-screen bg-white font-sans text-gray-950">
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-white/92 px-6 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <img src="/promptcard-manager-icon.png" alt="PMAgent logo" className="h-9 w-9 shrink-0 rounded-lg" />
        <div className="min-w-0">
          <div className="text-xl font-black italic leading-5 tracking-tight">PMAgent</div>
          <div className="mt-0.5 max-w-[48vw] truncate text-[11px] leading-3 text-gray-400">
            {activeTab === 'projects' && projectMode === 'builder' && activeProject ? activeProject.title : '自动提示词工作台'}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300"></span>
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300"></span>
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300"></span>
      </div>
      <div className="flex items-center gap-3">
        {activeTab === 'me' ? (
          <>
            <IconButton label="深色模式"><Moon className="h-6 w-6" /></IconButton>
            <IconButton label="通知"><Bell className="h-6 w-6" /></IconButton>
          </>
        ) : (
          <>
            <IconButton label="创建项目" onClick={onCreateProject}><Plus className="h-7 w-7" /></IconButton>
            <IconButton label="视图"><Grid2X2 className="h-6 w-6" /></IconButton>
          </>
        )}
      </div>
      {activeTab === 'projects' && projectMode === 'builder' && (
        <div className={`absolute right-6 top-[48px] rounded-full px-3 py-1 text-xs font-medium ${
          saveStatus === 'error'
            ? 'bg-red-50 text-red-600'
            : saveStatus === 'saving' || saveStatus === 'loading'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-emerald-50 text-emerald-700'
        }`}>
          {saveStatusText}
        </div>
      )}
    </header>

    <main className={
      activeTab === 'library' || (activeTab === 'projects' && projectMode === 'builder' && activeProject?.type === 'three-stage')
        ? 'h-[calc(100vh-112px)] overflow-hidden'
        : 'min-h-[calc(100vh-112px)] pb-20'
    }>{children}</main>

    {showProjectUtilities && (
      <div className="fixed bottom-[68px] left-6 z-50 flex gap-3">
        <button
          className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
          onClick={onOpenTemplateLibrary}
        >
          <Grid2X2 className="h-4 w-4" />
          模板库
        </button>
        <button
          className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
          onClick={onShowProjectTrash}
        >
          <Trash2 className="h-4 w-4" />
          回收站
        </button>
      </div>
    )}

    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 px-6 pb-3 pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-5xl grid-cols-5 items-center">
        <BottomTab active={activeTab === 'projects'} label="项目" onClick={() => setActiveTab('projects')} icon={<Folder className="h-6 w-6" />} />
        <BottomTab active={activeTab === 'media'} label={t('mediaNav')} onClick={() => setActiveTab('media')} icon={<Image className="h-6 w-6" />} />
        <BottomTab active={activeTab === 'library'} label="Prompt库" onClick={() => setActiveTab('library')} icon={<Users className="h-6 w-6" />} />
        <BottomTab active={activeTab === 'agents'} label="Agent面板" onClick={() => setActiveTab('agents')} icon={<Bot className="h-6 w-6" />} />
        <BottomTab active={activeTab === 'me'} label="我的" onClick={() => setActiveTab('me')} icon={<Smile className="h-6 w-6" />} />
      </div>
    </nav>
  </div>
  )
}


const IconButton = ({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) => (
  <button className="rounded-full p-1.5 text-gray-950 transition hover:bg-gray-100" title={label} aria-label={label} onClick={onClick}>
    {children}
  </button>
)

const BottomTab = ({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) => (
  <button className={`mx-auto flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold transition sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:py-2 sm:text-sm ${active ? 'text-black' : 'text-gray-400 hover:text-gray-700'}`} onClick={onClick}>
    <span className={active ? 'text-amber-300' : ''}>{icon}</span>
    {label}
  </button>
)
