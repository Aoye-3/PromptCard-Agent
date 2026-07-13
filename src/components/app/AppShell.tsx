import type { ReactNode } from 'react'
import { Bot, Camera, Folder, Grid2X2, Image, Plus, RefreshCw, Search, Smile, Trash2, Users } from 'lucide-react'
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
  projectSearchTerm,
  onProjectSearchTermChange,
  onCreateProject,
  onShowProjectTrash,
  children
}: {
  activeTab: MainTab
  setActiveTab: (tab: MainTab) => void
  projectMode: ProjectMode
  saveStatus: SaveStatus
  saveStatusText: string
  activeProject: IPromptProject | null
  projectSearchTerm: string
  onProjectSearchTermChange: (searchTerm: string) => void
  onCreateProject: () => void
  onShowProjectTrash: () => void
  children: ReactNode
}) => {
  const { t } = useI18n()
  const isProjectBuilder = activeTab === 'projects' && projectMode === 'builder' && Boolean(activeProject)
  const canSearchProjects = activeTab === 'projects' && projectMode === 'home'
  const mainClassName = isProjectBuilder
    ? 'h-[calc(100vh-56px)] overflow-hidden'
    : activeTab === 'library'
      ? 'ml-20 h-screen overflow-hidden md:ml-[300px]'
      : 'ml-20 min-h-screen md:ml-[300px]'

  const navItems: Array<{ tab: MainTab; label: string; icon: ReactNode }> = [
    { tab: 'projects', label: '项目', icon: <Folder className="h-5 w-5" /> },
    { tab: 'media', label: t('mediaNav'), icon: <Image className="h-5 w-5" /> },
    { tab: 'capture', label: '捕获栏', icon: <Camera className="h-5 w-5" /> },
    { tab: 'library', label: 'Prompt库', icon: <Users className="h-5 w-5" /> },
    { tab: 'agents', label: 'Agent面板', icon: <Bot className="h-5 w-5" /> },
    { tab: 'updates', label: '更新', icon: <RefreshCw className="h-5 w-5" /> },
    { tab: 'me', label: '我的', icon: <Smile className="h-5 w-5" /> }
  ]

  return (
    <div className="min-h-screen bg-white font-sans text-gray-950">
      {!isProjectBuilder && (
        <SideNav
          activeTab={activeTab}
          canSearchProjects={canSearchProjects}
          items={navItems}
          projectSearchTerm={projectSearchTerm}
          onProjectSearchTermChange={onProjectSearchTermChange}
          onSelectTab={setActiveTab}
          onShowProjectTrash={onShowProjectTrash}
        />
      )}

      {isProjectBuilder && (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-white/92 px-6 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <img src="/promptcard-manager-icon.png" alt="PMAgent logo" className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <div className="text-xl font-black italic leading-5 tracking-tight">PMAgent</div>
              <div className="mt-0.5 max-w-[48vw] truncate text-[11px] leading-3 text-gray-400">
                {activeProject?.title}
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300"></span>
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300"></span>
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300"></span>
          </div>
          <div className="flex items-center gap-3">
            <IconButton label="创建项目" onClick={onCreateProject}><Plus className="h-7 w-7" /></IconButton>
            <IconButton label="视图"><Grid2X2 className="h-6 w-6" /></IconButton>
          </div>
          <div className={`absolute right-6 top-[48px] rounded-full px-3 py-1 text-xs font-medium ${
            saveStatus === 'error'
              ? 'bg-red-50 text-red-600'
              : saveStatus === 'saving' || saveStatus === 'loading'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-emerald-50 text-emerald-700'
          }`}>
            {saveStatusText}
          </div>
        </header>
      )}

      <main className={mainClassName}>{children}</main>
    </div>
  )
}

const SideNav = ({
  activeTab,
  canSearchProjects,
  items,
  projectSearchTerm,
  onProjectSearchTermChange,
  onSelectTab,
  onShowProjectTrash
}: {
  activeTab: MainTab
  canSearchProjects: boolean
  items: Array<{ tab: MainTab; label: string; icon: ReactNode }>
  projectSearchTerm: string
  onProjectSearchTermChange: (searchTerm: string) => void
  onSelectTab: (tab: MainTab) => void
  onShowProjectTrash: () => void
}) => (
  <aside
    className="fixed bottom-0 left-0 top-0 z-40 flex w-20 flex-col border-r border-gray-100 bg-white/96 px-3 py-6 shadow-[10px_0_30px_rgba(15,23,42,0.03)] backdrop-blur md:w-[300px] md:px-6"
    data-app-side-nav
  >
    <div className="mb-7 flex items-center gap-3">
      <img src="/promptcard-manager-icon.png" alt="PMAgent logo" className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="hidden min-w-0 md:block">
        <div className="text-xl font-black italic leading-5 tracking-tight">PMAgent</div>
        <div className="mt-1 truncate text-xs font-medium text-gray-400">自动提示词工作台</div>
      </div>
    </div>

    <label className="relative mb-5 hidden md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-amber-200 focus:ring-4 focus:ring-amber-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        aria-label="搜索项目"
        data-project-search-input
        disabled={!canSearchProjects}
        placeholder={canSearchProjects ? '搜索项目' : '项目页可搜索'}
        value={canSearchProjects ? projectSearchTerm : ''}
        onChange={event => onProjectSearchTermChange(event.target.value)}
      />
    </label>

    <nav className="space-y-1" aria-label="主导航">
      {items.map(item => (
        <SideNavItem
          key={item.tab}
          active={activeTab === item.tab}
          icon={item.icon}
          label={item.label}
          onClick={() => onSelectTab(item.tab)}
        />
      ))}
    </nav>

    <div className="mt-8 border-t border-gray-100 pt-5" data-app-project-utilities>
      <div className="mb-3 hidden px-3 text-xs font-semibold uppercase tracking-wide text-gray-400 md:block">项目工具</div>
      <div className="space-y-1">
        <SideNavItem icon={<Trash2 className="h-5 w-5" />} label="回收站" onClick={onShowProjectTrash} />
      </div>
    </div>
  </aside>
)

const IconButton = ({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) => (
  <button className="rounded-full p-1.5 text-gray-950 transition hover:bg-gray-100" title={label} aria-label={label} onClick={onClick}>
    {children}
  </button>
)

const SideNavItem = ({
  active = false,
  icon,
  label,
  onClick
}: {
  active?: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) => (
  <button
    type="button"
    className={`flex min-h-[44px] w-full items-center justify-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition md:justify-start ${
      active ? 'bg-amber-50 text-gray-950' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
    }`}
    data-side-nav-item={label}
    data-active={active ? 'true' : 'false'}
    title={label}
    aria-label={label}
    onClick={onClick}
  >
    <span className={active ? 'text-amber-400' : 'text-gray-400'}>{icon}</span>
    <span className="hidden truncate md:inline">{label}</span>
  </button>
)
