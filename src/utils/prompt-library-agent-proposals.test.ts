import { describe, expect, it, vi } from 'vitest'
import type { PromptLibraryWriteProposal } from '@/models/Agent.model'
import {
  approvePromptLibraryProposalBatch,
  buildPresetDraftFromProposal,
  rejectPromptLibraryProposalBatch
} from './prompt-library-agent-proposals'

const proposal = (overrides: Partial<PromptLibraryWriteProposal> = {}): PromptLibraryWriteProposal => ({
  kind: 'prompt_library_write_proposal',
  id: 'proposal-1',
  threadId: null,
  runId: null,
  agentName: 'DeepSeek Agent',
  operation: 'create',
  targetPresetId: null,
  presetDraft: {
    type: 'style',
    category: 'agent',
    label: 'Golden light',
    content: 'warm sunset light',
    meta: { source: 'agent-runtime' }
  },
  rationale: 'Reusable style',
  status: 'pending',
  createdAt: 1,
  ...overrides
})

describe('prompt library agent proposals', () => {
  it('builds a valid additive preset draft from a create proposal', () => {
    const draft = buildPresetDraftFromProposal(proposal({
      presetDraft: {
        type: 'not-real' as PromptLibraryWriteProposal['presetDraft']['type'],
        category: '  scene  ',
        label: '  Beach  ',
        content: '  sunset beach  '
      }
    }))

    expect(draft).toEqual({
      type: 'custom',
      category: 'scene',
      label: 'Beach',
      content: 'sunset beach',
      meta: {
        agentProposalId: 'proposal-1',
        agentName: 'DeepSeek Agent',
        rationale: 'Reusable style',
        approvedAt: expect.any(Number)
      }
    })
  })

  it('batch approves only selected pending create proposals', async () => {
    const addPreset = vi.fn().mockResolvedValue(undefined)
    const markProposalStatus = vi.fn()
    const proposals = [
      proposal({ id: 'selected-create' }),
      proposal({ id: 'not-selected' }),
      proposal({ id: 'selected-approved', status: 'approved' }),
      proposal({ id: 'selected-update', operation: 'update', targetPresetId: 'preset-1' })
    ]

    await approvePromptLibraryProposalBatch(proposals, ['selected-create', 'selected-approved', 'selected-update'], {
      addPreset,
      markProposalStatus
    })

    expect(addPreset).toHaveBeenCalledTimes(1)
    expect(addPreset.mock.calls[0][0]).toMatchObject({
      label: 'Golden light',
      content: 'warm sunset light',
      type: 'style'
    })
    expect(markProposalStatus).toHaveBeenCalledWith('selected-create', 'approved')
    expect(markProposalStatus).not.toHaveBeenCalledWith('selected-update', 'approved')
  })

  it('preserves media metadata from approved proposal drafts', () => {
    const draft = buildPresetDraftFromProposal(proposal({
      presetDraft: {
        type: 'custom',
        category: 'reference',
        label: 'Video reference',
        content: 'Use this motion reference.',
        meta: {
          media: [{
            id: 'media-clip',
            kind: 'video',
            source: 'asset',
            assetId: 'clip.mp4',
            filename: 'clip.mp4',
            contentType: 'video/mp4',
            size: 1000
          }]
        }
      }
    }))

    expect(draft.meta.media).toEqual([{
      id: 'media-clip',
      kind: 'video',
      source: 'asset',
      assetId: 'clip.mp4',
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      size: 1000
    }])
  })

  it('batch rejects selected pending proposals without writing presets', () => {
    const markProposalStatus = vi.fn()
    const proposals = [
      proposal({ id: 'selected-create' }),
      proposal({ id: 'selected-approved', status: 'approved' })
    ]

    rejectPromptLibraryProposalBatch(proposals, ['selected-create', 'selected-approved'], {
      markProposalStatus
    })

    expect(markProposalStatus).toHaveBeenCalledTimes(1)
    expect(markProposalStatus).toHaveBeenCalledWith('selected-create', 'rejected')
  })
})
