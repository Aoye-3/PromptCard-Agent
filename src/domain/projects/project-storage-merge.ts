import type { IPromptProject } from '@/models/PromptHistory.model'
import { sortProjects } from './project-normalization'

export interface MergeStoredProjectOptions {
  includeTitle?: boolean
  savedAt?: number
}

export const mergeStoredProjectMetadata = (
  projects: IPromptProject[],
  storedProject: IPromptProject,
  options: MergeStoredProjectOptions = {}
): IPromptProject[] => {
  let didFindProject = false

  const mergedProjects = projects.map(project => {
    if (project.id !== storedProject.id) return project
    didFindProject = true

    return {
      ...project,
      title: options.includeTitle ? storedProject.title : project.title,
      revision: storedProject.revision,
      updatedAt: Math.max(
        project.updatedAt || 0,
        storedProject.updatedAt || 0,
        options.savedAt || 0
      ),
      lastOpenedAt: Math.max(
        project.lastOpenedAt || 0,
        storedProject.lastOpenedAt || 0,
        options.savedAt || 0
      )
    }
  })

  return didFindProject ? sortProjects(mergedProjects) : projects
}
