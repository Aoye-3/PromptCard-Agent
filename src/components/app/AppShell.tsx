import type { ReactNode } from 'react'
import { Bell, Bot, Folder, Grid2X2, Moon, Plus, Smile, Trash2, Users } from 'lucide-react'
import type { IPromptProject } from '@/models/PromptHistory.model'
import type { MainTab, ProjectMode, SaveStatus } from '@/features/app/app-types'

export const AppShell = ({
  activeTab,
  setActiveTab,
  projectMode,
  saveStatus,
  saveStatusText,
  activeProject,
  onCreateProject,
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
  showProjectUtilities: boolean
  children: ReactNode
}) => (
  <div className="min-h-screen bg-white font-sans text-gray-950">
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between bg-white/92 px-6 backdrop-blur">
      <div className="min-w-0">
        <div className="text-2xl font-black italic tracking-tight">PMAgent</div>
        <div className="mt-1 max-w-[48vw] break-words text-xs leading-4 text-gray-400">
          {activeTab === 'projects' && projectMode === 'builder' && activeProject ? activeProject.title : '自动提示词工作台'}
        </div>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 gap-1">
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
        <div className={`absolute right-6 top-[72px] rounded-full px-3 py-1 text-xs font-medium ${
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

    <main className="min-h-[calc(100vh-160px)] pb-28">{children}</main>

    {showProjectUtilities && (
      <div className="fixed bottom-[92px] left-6 z-50 flex gap-3">
        <button className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200">
          <Grid2X2 className="h-4 w-4" />
          模板库
        </button>
        <button className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200">
          <Trash2 className="h-4 w-4" />
          回收站
        </button>
      </div>
    )}

    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-100 bg-white/95 px-6 pb-6 pt-3 backdrop-blur">
      <div className="mx-auto grid max-w-5xl grid-cols-4 items-center">
        <BottomTab active={activeTab === 'projects'} label="项目" onClick={() => setActiveTab('projects')} icon={<Folder className="h-6 w-6" />} />
        <BottomTab active={activeTab === 'library'} label="Prompt库" onClick={() => setActiveTab('library')} icon={<Users className="h-6 w-6" />} />
        <BottomTab active={activeTab === 'agents'} label="Agent面板" onClick={() => setActiveTab('agents')} icon={<Bot className="h-6 w-6" />} />
        <BottomTab active={activeTab === 'me'} label="我的" onClick={() => setActiveTab('me')} icon={<Smile className="h-6 w-6" />} />
      </div>
    </nav>
  </div>
)


const IconButton = ({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) => (
  <button className="rounded-full p-2 text-gray-950 transition hover:bg-gray-100" title={label} aria-label={label} onClick={onClick}>
    {children}
  </button>
)

const BottomTab = ({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) => (
  <button className={`mx-auto flex items-center gap-3 rounded-full px-5 py-3 text-base font-bold transition ${active ? 'text-black' : 'text-gray-400 hover:text-gray-700'}`} onClick={onClick}>
    <span className={active ? 'text-amber-300' : ''}>{icon}</span>
    {label}
  </button>
)
