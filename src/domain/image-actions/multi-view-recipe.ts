import type { ImageOperationDraft } from './image-operation-draft'

export interface MultiViewSpec {
  id: string
  label: string
  instruction: string
  order: number
}

export interface MultiViewRequestMember {
  groupId: string
  itemId: string
  view: MultiViewSpec
  draft: ImageOperationDraft
}

export type MultiViewMemberState = 'queued' | 'running' | 'succeeded' | 'failed'

export interface MultiViewGroupMemberState {
  itemId: string
  viewId: string
  state: MultiViewMemberState
}

export interface MultiViewGroupState {
  state: MultiViewMemberState | 'partial'
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
}

export const defaultMultiViewSpecs: readonly MultiViewSpec[] = [
  { id: 'front', label: '正面', instruction: '从主体正面平视观察', order: 0 },
  { id: 'front-three-quarter', label: '正面 3/4', instruction: '从主体正面偏左约 45 度观察', order: 1 },
  { id: 'left', label: '左侧', instruction: '从主体左侧平视观察', order: 2 },
  { id: 'right', label: '右侧', instruction: '从主体右侧平视观察', order: 3 },
  { id: 'rear', label: '背面', instruction: '从主体背面平视观察', order: 4 }
]

export const createMultiViewRequestMembers = ({
  sourceDraft,
  selectedViewIds,
  groupId,
  createItemId
}: {
  sourceDraft: ImageOperationDraft
  selectedViewIds: readonly string[]
  groupId: string
  createItemId: (view: MultiViewSpec) => string
}): MultiViewRequestMember[] => {
  const selected = new Set(selectedViewIds)
  return defaultMultiViewSpecs
    .filter(view => selected.has(view.id))
    .sort((left, right) => left.order - right.order)
    .map(view => {
      const itemId = createItemId(view)
      return {
        groupId,
        itemId,
        view,
        draft: {
          ...sourceDraft,
          operation: 'multi-view',
          prompt: [sourceDraft.prompt.trim(), view.instruction].filter(Boolean).join('\n'),
          preservationIntents: [...sourceDraft.preservationIntents],
          references: sourceDraft.references.map(reference => ({ ...reference })),
          operationGroupId: groupId,
          operationItemId: itemId,
          viewSpec: view.id
        }
      }
    })
}

export const scheduleMultiViewMembers = async <T, R>(
  members: readonly T[],
  execute: (member: T, index: number) => Promise<R>,
  concurrency = 1
): Promise<Array<PromiseSettledResult<R>>> => {
  const limit = Math.max(1, Math.floor(concurrency))
  const results: Array<PromiseSettledResult<R>> = new Array(members.length)
  let nextIndex = 0

  const worker = async (): Promise<void> => {
    while (nextIndex < members.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = { status: 'fulfilled', value: await execute(members[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(limit, members.length) },
    () => worker()
  ))
  return results
}

export const deriveMultiViewGroupState = (
  members: readonly MultiViewGroupMemberState[]
): MultiViewGroupState => {
  const counts = members.reduce((result, member) => {
    result[member.state] += 1
    return result
  }, { queued: 0, running: 0, succeeded: 0, failed: 0 })
  const total = members.length
  let state: MultiViewGroupState['state'] = 'queued'
  if (total > 0 && counts.succeeded === total) state = 'succeeded'
  else if (total > 0 && counts.failed === total) state = 'failed'
  else if (counts.succeeded > 0 || counts.failed > 0) state = 'partial'
  else if (counts.running > 0) state = 'running'

  return { state, total, ...counts }
}
