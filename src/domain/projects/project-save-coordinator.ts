import type { IPromptProject } from '@/models/PromptHistory.model'
import { StorageRevisionConflict } from '@/storage/storage-service-client'

export interface ProjectSaveRequest {
  project: IPromptProject
  editSeq: number
}

export interface ProjectSaveResult {
  status: 'saved' | 'superseded' | 'failed'
  editSeq: number
  project?: IPromptProject
  error?: unknown
}

interface ProjectSavePersistence {
  create: (project: IPromptProject) => Promise<IPromptProject>
  update: (id: string, revision: number, updates: Partial<IPromptProject>) => Promise<IPromptProject>
}

interface PendingRequest extends ProjectSaveRequest {
  resolve: (result: ProjectSaveResult) => void
}

interface ProjectQueue {
  running: boolean
  needsCreate: boolean
  revision: number
  pending: PendingRequest | null
  retained: ProjectSaveRequest | null
  inFlight: ProjectSaveRequest | null
}

export interface ProjectSaveCoordinator {
  markPendingCreate: (project: IPromptProject) => void
  enqueue: (request: ProjectSaveRequest) => Promise<ProjectSaveResult>
  flush: (projectId: string) => Promise<ProjectSaveResult>
  hasPending: (projectId: string) => boolean
}

export const createProjectSaveCoordinator = (
  persistence: ProjectSavePersistence,
  maxConflictAttempts = 3
): ProjectSaveCoordinator => {
  const queues = new Map<string, ProjectQueue>()

  const queueFor = (project: IPromptProject): ProjectQueue => {
    const existing = queues.get(project.id)
    if (existing) return existing
    const queue: ProjectQueue = {
      running: false,
      needsCreate: false,
      revision: project.revision,
      pending: null,
      retained: null,
      inFlight: null
    }
    queues.set(project.id, queue)
    return queue
  }

  const run = async (projectId: string): Promise<void> => {
    const queue = queues.get(projectId)
    if (!queue || queue.running) return
    queue.running = true

    while (queue.pending) {
      let request = queue.pending
      queue.pending = null
      queue.inFlight = request
      let attempts = 0

      try {
        let savedProject: IPromptProject | null = null
        while (!savedProject) {
          try {
            savedProject = queue.needsCreate
              ? await persistence.create(request.project)
              : await persistence.update(projectId, queue.revision, projectUpdates(request.project))
          } catch (error) {
            if (!(error instanceof StorageRevisionConflict) || !error.current || attempts >= maxConflictAttempts - 1) {
              throw error
            }
            attempts += 1
            queue.revision = error.current.revision
            if (queue.pending) {
              request.resolve({ status: 'superseded', editSeq: request.editSeq })
              request = queue.pending
              queue.pending = null
              queue.inFlight = request
            }
          }
        }

        queue.needsCreate = false
        queue.revision = savedProject.revision
        queue.retained = null
        queue.inFlight = null
        request.resolve({ status: 'saved', editSeq: request.editSeq, project: savedProject })
      } catch (error) {
        const latest = queue.pending || request
        queue.pending = null
        queue.retained = { project: latest.project, editSeq: latest.editSeq }
        queue.inFlight = null
        request.resolve({ status: 'failed', editSeq: request.editSeq, error })
        if (latest !== request) latest.resolve({ status: 'failed', editSeq: latest.editSeq, error })
        break
      }
    }

    queue.running = false
    if (queue.pending) void run(projectId)
  }

  const enqueue = (request: ProjectSaveRequest): Promise<ProjectSaveResult> => {
    const queue = queueFor(request.project)
    queue.retained = null
    if (queue.pending) {
      queue.pending.resolve({ status: 'superseded', editSeq: queue.pending.editSeq })
    }

    return new Promise(resolve => {
      queue.pending = { ...request, resolve }
      void run(request.project.id)
    })
  }

  const flush = (projectId: string): Promise<ProjectSaveResult> => {
    const queue = queues.get(projectId)
    if (!queue?.retained) {
      return Promise.resolve({ status: 'superseded', editSeq: -1 })
    }
    return enqueue(queue.retained)
  }

  return {
    markPendingCreate(project) {
      const queue = queueFor(project)
      queue.needsCreate = true
      queue.revision = project.revision
    },
    enqueue,
    flush,
    hasPending(projectId) {
      const queue = queues.get(projectId)
      return Boolean(queue?.inFlight || queue?.pending || queue?.retained)
    }
  }
}

const projectUpdates = (project: IPromptProject): Partial<IPromptProject> => {
  const updates: Partial<IPromptProject> = { ...project }
  delete updates.id
  delete updates.revision
  delete updates.createdAt
  return updates
}
