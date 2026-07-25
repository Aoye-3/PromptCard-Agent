import { describe, expect, it } from 'vitest'
import type { ImageOperationDraft } from './image-operation-draft'
import {
  createMultiViewRequestMembers,
  deriveMultiViewGroupState,
  scheduleMultiViewMembers
} from './multi-view-recipe'

const sourceDraft: ImageOperationDraft = {
  operation: 'multi-view',
  source: {
    nodeId: 'source-node',
    originalAssetId: 'asset-original',
    canvasAssetId: 'asset-canvas',
    providerAssetId: 'asset-provider',
    previewUrl: '/assets/asset-provider',
    requiresVisibleRaster: false,
    includesCrop: false,
    includesAnnotations: false,
    includesPresentation: false
  },
  prompt: '保持同一把椅子的身份、材料与比例',
  presetId: 'identity-preserving',
  preservationIntents: ['主体身份', '材料与颜色'],
  references: [],
  resolution: '2K',
  aspectRatio: '1:1'
}

describe('multi-view recipe', () => {
  it('creates stable, ordered independent request members with distinct snapshots', () => {
    const members = createMultiViewRequestMembers({
      sourceDraft,
      selectedViewIds: ['rear', 'front', 'left'],
      groupId: 'group-1',
      createItemId: view => `item-${view.id}`
    })

    expect(members.map(member => member.view.id)).toEqual(['front', 'left', 'rear'])
    expect(members.map(member => member.itemId)).toEqual(['item-front', 'item-left', 'item-rear'])
    expect(members.every(member => member.draft.operationGroupId === 'group-1')).toBe(true)
    expect(members[0].draft).not.toBe(members[1].draft)
    expect(members[0].draft.preservationIntents).not.toBe(members[1].draft.preservationIntents)
    expect(members[0].draft.prompt).toContain('正面')
  })

  it('honors the concurrency limit and preserves result order through partial failure', async () => {
    let active = 0
    let maximumActive = 0
    const results = await scheduleMultiViewMembers(
      ['front', 'left', 'rear'],
      async member => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await Promise.resolve()
        active -= 1
        if (member === 'left') throw new Error('left failed')
        return `${member}-done`
      },
      2
    )

    expect(maximumActive).toBe(2)
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    expect(results[0]).toEqual({ status: 'fulfilled', value: 'front-done' })
  })

  it('derives partial and terminal group states from member states', () => {
    expect(deriveMultiViewGroupState([
      { itemId: 'front', viewId: 'front', state: 'succeeded' },
      { itemId: 'left', viewId: 'left', state: 'failed' },
      { itemId: 'rear', viewId: 'rear', state: 'queued' }
    ])).toMatchObject({ state: 'partial', total: 3, succeeded: 1, failed: 1, queued: 1 })

    expect(deriveMultiViewGroupState([
      { itemId: 'front', viewId: 'front', state: 'succeeded' }
    ]).state).toBe('succeeded')
  })
})
