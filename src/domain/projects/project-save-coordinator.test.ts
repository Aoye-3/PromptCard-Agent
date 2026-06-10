import { describe, expect, test, vi } from 'vitest'
import type { IPromptProject } from '@/models/PromptHistory.model'
import { StorageRevisionConflict } from '@/storage/storage-service-client'
import { createProjectSaveCoordinator } from './project-save-coordinator'

const project = (revision = 1, title = 'Local'): IPromptProject => ({
  id: 'project-1',
  title,
  type: 'three-stage',
  revision,
  pages: [],
  currentPage: 0,
  createdAt: 1,
  updatedAt: 2,
  lastOpenedAt: 2,
  meta: {}
})

describe('project save coordinator', () => {
  test('serializes writes and coalesces queued changes to the latest snapshot', async () => {
    let releaseFirst: () => void = () => undefined
    const firstCanFinish = new Promise<void>(resolve => { releaseFirst = resolve })
    const update = vi.fn(async (_id: string, revision: number, updates: Partial<IPromptProject>) => {
      if (update.mock.calls.length === 1) await firstCanFinish
      return { ...project(revision + 1), ...updates }
    })
    const coordinator = createProjectSaveCoordinator({ create: vi.fn(), update })

    const first = coordinator.enqueue({ project: project(1, 'First'), editSeq: 1 })
    const second = coordinator.enqueue({ project: project(1, 'Second'), editSeq: 2 })
    const third = coordinator.enqueue({ project: project(1, 'Latest'), editSeq: 3 })
    releaseFirst()

    await expect(first).resolves.toMatchObject({ status: 'saved', editSeq: 1 })
    await expect(second).resolves.toMatchObject({ status: 'superseded', editSeq: 2 })
    await expect(third).resolves.toMatchObject({ status: 'saved', editSeq: 3 })
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[1][1]).toBe(2)
    expect(update.mock.calls[1][2]).toMatchObject({ title: 'Latest' })
  })

  test('retains the newest complete snapshot when an in-flight content save fails before a metadata save', async () => {
    let releaseFirst: () => void = () => undefined
    const firstCanFinish = new Promise<void>(resolve => { releaseFirst = resolve })
    const update = vi.fn()
      .mockImplementationOnce(async () => {
        await firstCanFinish
        throw new Error('offline')
      })
    const coordinator = createProjectSaveCoordinator({ create: vi.fn(), update })

    const deletedSnapshot = { ...project(), threeStage: { pages: [] } as never, updatedAt: 3 }
    const metadataSnapshot = { ...deletedSnapshot, lastOpenedAt: 4 }
    const first = coordinator.enqueue({ project: deletedSnapshot, editSeq: 1 })
    const metadata = coordinator.enqueue({ project: metadataSnapshot, editSeq: 1 })
    releaseFirst()

    await expect(first).resolves.toMatchObject({ status: 'failed' })
    await expect(metadata).resolves.toMatchObject({ status: 'failed' })
    update.mockResolvedValueOnce({ ...metadataSnapshot, revision: 2 })
    await coordinator.flush('project-1')
    expect(update.mock.calls[update.mock.calls.length - 1]?.[2]).toMatchObject({
      threeStage: { pages: [] },
      lastOpenedAt: 4
    })
  })

  test('queues edits behind the initial create and updates with the created revision', async () => {
    let releaseCreate: () => void = () => undefined
    const createCanFinish = new Promise<void>(resolve => { releaseCreate = resolve })
    const create = vi.fn(async (snapshot: IPromptProject) => {
      await createCanFinish
      return { ...snapshot, revision: 1 }
    })
    const update = vi.fn(async (_id: string, revision: number, updates: Partial<IPromptProject>) => ({
      ...project(revision + 1),
      ...updates
    }))
    const coordinator = createProjectSaveCoordinator({ create, update })
    coordinator.markPendingCreate(project())

    const created = coordinator.enqueue({ project: project(), editSeq: 0 })
    const edited = coordinator.enqueue({ project: project(1, 'Edited while creating'), editSeq: 1 })
    releaseCreate()

    await created
    await edited
    expect(create).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith('project-1', 1, expect.objectContaining({ title: 'Edited while creating' }))
  })

  test('retries a revision conflict with the server revision and local latest updates', async () => {
    const update = vi.fn()
      .mockRejectedValueOnce(new StorageRevisionConflict(project(4, 'Remote')))
      .mockResolvedValueOnce(project(5, 'Local latest'))
    const coordinator = createProjectSaveCoordinator({ create: vi.fn(), update })

    const result = await coordinator.enqueue({ project: project(1, 'Local latest'), editSeq: 2 })

    expect(result).toMatchObject({ status: 'saved', editSeq: 2 })
    expect(update).toHaveBeenNthCalledWith(1, 'project-1', 1, expect.objectContaining({ title: 'Local latest' }))
    expect(update).toHaveBeenNthCalledWith(2, 'project-1', 4, expect.objectContaining({ title: 'Local latest' }))
  })

  test('retries a conflict with the newest queued snapshot instead of the stale in-flight snapshot', async () => {
    let rejectFirst: (error: unknown) => void = () => undefined
    const firstRequest = new Promise<IPromptProject>((_resolve, reject) => { rejectFirst = reject })
    const update = vi.fn()
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValueOnce(project(5, 'Newest'))
    const coordinator = createProjectSaveCoordinator({ create: vi.fn(), update })

    const stale = coordinator.enqueue({ project: project(1, 'Stale'), editSeq: 1 })
    const newest = coordinator.enqueue({ project: project(1, 'Newest'), editSeq: 2 })
    rejectFirst(new StorageRevisionConflict(project(4, 'Remote')))

    await expect(stale).resolves.toMatchObject({ status: 'superseded', editSeq: 1 })
    await expect(newest).resolves.toMatchObject({ status: 'saved', editSeq: 2 })
    expect(update).toHaveBeenNthCalledWith(2, 'project-1', 4, expect.objectContaining({ title: 'Newest' }))
  })

  test('retains a failed latest request for the next flush', async () => {
    const update = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(project(2, 'Deleted stays deleted'))
    const coordinator = createProjectSaveCoordinator({ create: vi.fn(), update })

    await expect(coordinator.enqueue({ project: project(1, 'Deleted stays deleted'), editSeq: 3 }))
      .resolves.toMatchObject({ status: 'failed', editSeq: 3 })
    await expect(coordinator.flush('project-1')).resolves.toMatchObject({ status: 'saved', editSeq: 3 })
    expect(update).toHaveBeenCalledTimes(2)
  })
})
