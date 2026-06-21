import { ArchiveRestore, Folder, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { IPromptHistory, IPromptProject } from '@/models/PromptHistory.model'
import type { TrashEntry } from '@/storage/storage-service-client'

export const ProjectHome = ({
  projects,
  projectTrash,
  selectedProjectIds,
  selectedProjectTrashIds,
  showProjectTrash,
  promptHistory,
  onOpenProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
  onShowHistory,
  onToggleProjectSelection,
  onToggleProjectTrashSelection,
  onSelectAllProjects,
  onSelectAllProjectTrash,
  onClearProjectSelection,
  onClearProjectTrashSelection,
  onTrashSelectedProjects,
  onRestoreSelectedProjects,
  onDeleteSelectedProjectsForever,
  onShowProjectTrash
}: {
  projects: IPromptProject[]
  projectTrash: TrashEntry<IPromptProject>[]
  selectedProjectIds: string[]
  selectedProjectTrashIds: string[]
  showProjectTrash: boolean
  promptHistory: IPromptHistory[]
  onOpenProject: (project: IPromptProject) => void
  onCreateProject: () => void
  onDeleteProject: (projectId: string) => void
  onRenameProject: (project: IPromptProject) => void
  onShowHistory: () => void
  onToggleProjectSelection: (projectId: string) => void
  onToggleProjectTrashSelection: (projectId: string) => void
  onSelectAllProjects: () => void
  onSelectAllProjectTrash: () => void
  onClearProjectSelection: () => void
  onClearProjectTrashSelection: () => void
  onTrashSelectedProjects: () => void
  onRestoreSelectedProjects: () => void
  onDeleteSelectedProjectsForever: () => void
  onShowProjectTrash: (show: boolean) => void
}) => {
  const selectedCount = selectedProjectIds.length
  const selectedTrashCount = selectedProjectTrashIds.length
  const visibleProjects = showProjectTrash ? projectTrash.map(entry => entry.payload) : projects

  return (
    <section className="px-6 pt-5">
      {!showProjectTrash && projects.length === 0 ? (
        <div className="mx-auto flex min-h-[68vh] max-w-2xl flex-col items-center justify-center text-center">
          <div className="mb-8 flex h-28 w-28 items-center justify-center rounded-[32px] bg-amber-50 text-amber-400">
            <FolderPlus className="h-16 w-16" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-950">Create your first project</h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-gray-500">
          Create card, storyboard, three-stage, or free-canvas projects. Local auto-save is handled by the storage service.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button className="rounded-full bg-black px-8 py-4 text-base font-semibold text-white transition hover:bg-gray-800" onClick={onCreateProject}>
              <Plus className="h-5 w-5" />
              Create project
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-6xl py-12">
          <div className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h1 className="text-3xl font-bold">{showProjectTrash ? 'Project trash' : 'Projects'}</h1>
              <p className="mt-2 text-sm text-gray-500">
        {showProjectTrash ? 'Restore projects or permanently delete them from local storage.' : 'Manage card, storyboard, three-stage, and free-canvas projects.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <button className="rounded-full bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-200" onClick={() => onShowProjectTrash(!showProjectTrash)}>
                {showProjectTrash ? <Folder className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                {showProjectTrash ? 'Back to projects' : `Trash ${projectTrash.length}`}
              </button>
              {!showProjectTrash && (
                <>
                  <button className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800" onClick={onCreateProject}>
                    <Plus className="h-4 w-4" />
                    Create project
                  </button>
                </>
              )}
            </div>
          </div>

          {!showProjectTrash && selectedCount > 0 && (
            <SelectionBar
              count={selectedCount}
              onSelectAll={onSelectAllProjects}
              onClear={onClearProjectSelection}
              actions={[
                { label: 'Move to trash', icon: <Trash2 className="h-4 w-4" />, onClick: onTrashSelectedProjects, tone: 'danger' }
              ]}
            />
          )}

          {showProjectTrash && selectedTrashCount > 0 && (
            <SelectionBar
              count={selectedTrashCount}
              onSelectAll={onSelectAllProjectTrash}
              onClear={onClearProjectTrashSelection}
              actions={[
                { label: 'Restore', icon: <ArchiveRestore className="h-4 w-4" />, onClick: onRestoreSelectedProjects },
                { label: 'Delete forever', icon: <Trash2 className="h-4 w-4" />, onClick: onDeleteSelectedProjectsForever, tone: 'danger' }
              ]}
            />
          )}

          {visibleProjects.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-gray-200 py-16 text-center text-sm text-gray-500">
              {showProjectTrash ? 'Trash is empty.' : 'No projects yet.'}
            </div>
          ) : (
            <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.map(project => {
                const selected = showProjectTrash
                  ? selectedProjectTrashIds.includes(project.id)
                  : selectedProjectIds.includes(project.id)
                const cardCount = project.pages.reduce((sum, page) => sum + page.cards.length, 0)
  const meta = project.type === 'storyboard'
    ? `${project.storyboard?.sequences.length || 0} sequences`
    : project.type === 'three-stage'
      ? '3 structured stages'
      : project.type === 'free-canvas'
        ? `${project.freeCanvas?.nodes.length || 0} canvas nodes`
      : `${project.pages.length} pages / ${cardCount} cards`
  const modeLabel = project.type === 'storyboard' ? 'Storyboard' : project.type === 'three-stage' ? 'Three-stage' : project.type === 'free-canvas' ? 'Free Canvas' : 'Card'

                return (
                  <article
                    key={project.id}
                    className={`group flex min-h-[230px] flex-col rounded-[24px] border bg-white p-5 text-left shadow-[0_18px_45px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.08)] ${
                      selected ? 'border-black' : 'border-gray-100'
                    }`}
                  >
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-black focus:ring-gray-200"
                          checked={selected}
                          onChange={() => showProjectTrash ? onToggleProjectTrashSelection(project.id) : onToggleProjectSelection(project.id)}
                        />
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
                          <Folder className="h-7 w-7" />
                        </div>
                      </label>
                      {!showProjectTrash && (
                        <div className="flex shrink-0 gap-1">
                          <button type="button" className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900" title="Rename project" aria-label="Rename project" onClick={() => onRenameProject(project)}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500" title="Move to trash" aria-label="Move to trash" onClick={() => onDeleteProject(project.id)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mb-4 inline-flex w-fit rounded-full bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-500">
                      {modeLabel} / {meta}
                    </div>
                    <h2 className="whitespace-normal break-words text-lg font-bold leading-snug text-gray-950">{project.title}</h2>
                    <p className="mt-4 text-xs leading-5 text-gray-400">Updated {new Date(project.updatedAt).toLocaleString()} / rev {project.revision}</p>
                    {!showProjectTrash && (
                      <button type="button" className="mt-auto inline-flex w-full items-center justify-center rounded-full bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800" onClick={() => onOpenProject(project)}>
                        Open project
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          )}

          {!showProjectTrash && promptHistory.length > 0 && (
            <button className="mt-8 rounded-full bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-200" onClick={onShowHistory}>
              View {promptHistory.length} prompt history items
            </button>
          )}
        </div>
      )}
    </section>
  )
}

const SelectionBar = ({
  count,
  actions,
  onSelectAll,
  onClear
}: {
  count: number
  actions: Array<{ label: string; icon: JSX.Element; onClick: () => void; tone?: 'danger' }>
  onSelectAll: () => void
  onClear: () => void
}) => (
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
    <span className="font-medium text-gray-700">{count} selected</span>
    <div className="flex flex-wrap gap-2">
      <button className="rounded-full px-3 py-2 text-gray-600 transition hover:bg-white" onClick={onSelectAll}>Select all</button>
      {actions.map(action => (
        <button
          key={action.label}
          className={`rounded-full px-3 py-2 font-semibold transition ${
            action.tone === 'danger' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
          onClick={action.onClick}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
      <button className="rounded-full px-3 py-2 text-gray-500 transition hover:bg-white" onClick={onClear}>
        <X className="h-4 w-4" />
        Clear
      </button>
    </div>
  </div>
)
