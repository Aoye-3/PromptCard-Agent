import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { IPromptProject } from '@/models/PromptHistory.model'
import type { TrashEntry } from '@/storage/storage-service-client'
import { ProjectHome } from './ProjectHome'

const baseProject = (overrides: Partial<IPromptProject>): IPromptProject => ({
  id: 'project',
  title: 'Untitled project',
  type: 'card',
  revision: 1,
  pages: [{ id: 'page-1', cards: [] }],
  currentPage: 0,
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: 1,
  meta: {},
  ...overrides
})

const trashEntry = (project: IPromptProject): TrashEntry<IPromptProject> => ({
  id: project.id,
  deletedAt: 2,
  deletedBy: 'user',
  deleteReason: null,
  payload: project
})

const renderProjectHome = (props: Partial<Parameters<typeof ProjectHome>[0]> = {}) => renderToStaticMarkup(
  <ProjectHome
    projects={[]}
    projectTrash={[]}
    selectedProjectIds={[]}
    selectedProjectTrashIds={[]}
    showProjectTrash={false}
    searchTerm=""
    promptHistory={[]}
    onCreateProject={() => undefined}
    onOpenProject={() => undefined}
    onDeleteProject={() => undefined}
    onRenameProject={() => undefined}
    onShowHistory={() => undefined}
    onToggleProjectSelection={() => undefined}
    onToggleProjectTrashSelection={() => undefined}
    onSelectAllProjects={() => undefined}
    onSelectAllProjectTrash={() => undefined}
    onClearProjectSelection={() => undefined}
    onClearProjectTrashSelection={() => undefined}
    onTrashSelectedProjects={() => undefined}
    onRestoreSelectedProjects={() => undefined}
    onDeleteSelectedProjectsForever={() => undefined}
    onShowProjectTrash={() => undefined}
    {...props}
  />
)

describe('ProjectHome search filtering', () => {
  it('filters projects by title and hides non-matching cards', () => {
    const markup = renderProjectHome({
      searchTerm: 'canvas',
      projects: [
        baseProject({ id: 'alpha', title: 'Alpha Card Project', type: 'card' }),
        baseProject({
          id: 'beta',
          title: 'Beta Canvas Project',
          type: 'free-canvas',
          freeCanvas: { nodes: [], edges: [], meta: {} }
        })
      ]
    })

    expect(markup).toContain('Beta Canvas Project')
    expect(markup).toContain('Free Canvas')
    expect(markup).not.toContain('Alpha Card Project')
  })

  it('renders a search empty state when projects exist but none match', () => {
    const markup = renderProjectHome({
      searchTerm: 'missing',
      projects: [
        baseProject({ id: 'alpha', title: 'Alpha Card Project', type: 'card' })
      ]
    })

    expect(markup).toContain('未找到匹配项目。')
    expect(markup).not.toContain('No projects yet.')
  })

  it('filters trash projects by search term', () => {
    const archivedProject = baseProject({ id: 'archived', title: 'Archived Canvas', type: 'free-canvas', freeCanvas: { nodes: [], edges: [], meta: {} } })
    const discardedProject = baseProject({ id: 'discarded', title: 'Discarded Card', type: 'card' })
    const markup = renderProjectHome({
      showProjectTrash: true,
      searchTerm: 'archived',
      projectTrash: [trashEntry(archivedProject), trashEntry(discardedProject)]
    })

    expect(markup).toContain('Archived Canvas')
    expect(markup).not.toContain('Discarded Card')
  })
})
