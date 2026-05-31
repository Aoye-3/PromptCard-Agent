import type { CardType, IPreset } from '@/models/Card.model'
import type { PromptLibraryWriteProposal } from '@/models/Agent.model'

const CARD_TYPES: CardType[] = [
  'subject',
  'action',
  'scene',
  'style',
  'camera',
  'lighting',
  'timing',
  'audio',
  'constraint',
  'custom'
]

export function isAdditivePromptLibraryProposal(proposal: PromptLibraryWriteProposal) {
  return proposal.operation === 'create' &&
    proposal.status === 'pending' &&
    Boolean(proposal.presetDraft?.label?.trim()) &&
    Boolean(proposal.presetDraft?.content?.trim())
}

export function buildPresetDraftFromProposal(
  proposal: PromptLibraryWriteProposal
): Omit<IPreset, 'id' | 'usageCount'> {
  const type = CARD_TYPES.includes(proposal.presetDraft.type)
    ? proposal.presetDraft.type
    : 'custom'

  return {
    type,
    category: proposal.presetDraft.category.trim() || 'agent',
    label: proposal.presetDraft.label.trim(),
    content: proposal.presetDraft.content.trim(),
    meta: {
      ...(proposal.presetDraft.meta || {}),
      agentProposalId: proposal.id,
      agentName: proposal.agentName,
      rationale: proposal.rationale,
      approvedAt: Date.now()
    }
  }
}

export async function approvePromptLibraryProposalBatch(
  proposals: PromptLibraryWriteProposal[],
  selectedIds: string[],
  actions: {
    addPreset: (preset: Omit<IPreset, 'id' | 'usageCount' | 'meta'> & { meta?: IPreset['meta'] }) => Promise<void>
    markProposalStatus: (id: string, status: 'approved' | 'rejected') => void
  }
) {
  const selected = new Set(selectedIds)
  const approvable = proposals.filter(proposal =>
    selected.has(proposal.id) && isAdditivePromptLibraryProposal(proposal)
  )

  for (const proposal of approvable) {
    await actions.addPreset(buildPresetDraftFromProposal(proposal))
    actions.markProposalStatus(proposal.id, 'approved')
  }
}

export function rejectPromptLibraryProposalBatch(
  proposals: PromptLibraryWriteProposal[],
  selectedIds: string[],
  actions: {
    markProposalStatus: (id: string, status: 'approved' | 'rejected') => void
  }
) {
  const selected = new Set(selectedIds)
  proposals
    .filter(proposal => selected.has(proposal.id) && proposal.status === 'pending')
    .forEach(proposal => actions.markProposalStatus(proposal.id, 'rejected'))
}
