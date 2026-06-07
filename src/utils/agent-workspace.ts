import type { ICard } from '@/models/Card.model'
import type { AgentWorkspaceContext } from '@/models/Agent.model'
import type { IPromptProject, IStoryboardProject, IThreeStageProject } from '@/models/PromptHistory.model'
import type { IPage } from '@/stores/card-initial-state'
import {
  getSelectedThreeStageFormContext,
  normalizeThreeStagePages,
  syncThreeStageLegacyFields
} from '@/domain/three-stage/three-stage-pages'

const MAX_TEXT_LENGTH = 1200
const MAX_CARDS = 60
const MAX_ROWS = 40

const compactText = (value: string | undefined) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}...` : text
}

const compactCard = (card: ICard) => ({
  id: card.id,
  type: card.type,
  title: compactText(card.title),
  content: compactText(card.content)
})

export function buildCardWorkspaceContext({
  activeProject,
  pages,
  currentPage,
  currentPrompt,
  selectedCardIds
}: {
  activeProject: IPromptProject
  pages: IPage[]
  currentPage: number
  currentPrompt: string
  selectedCardIds: string[]
}): AgentWorkspaceContext {
  const flattenedCards = pages.flatMap((page, pageIndex) =>
    page.cards.map(card => ({ pageIndex, ...compactCard(card) }))
  )
  const selectedCards = flattenedCards.filter(card => selectedCardIds.includes(card.id))

  return {
    contextId: `card:${activeProject.id}:${currentPage}`,
    mode: 'card-workspace',
    projectId: activeProject.id,
    projectTitle: activeProject.title,
    snapshot: {
      projectType: activeProject.type,
      currentPage,
      pageCount: pages.length,
      selectedCardIds,
      selectedCards,
      cards: flattenedCards.slice(0, MAX_CARDS),
      assembledPrompt: compactText(currentPrompt)
    }
  }
}

export function buildStoryboardWorkspaceContext({
  activeProject,
  storyboard
}: {
  activeProject: IPromptProject
  storyboard: IStoryboardProject
}): AgentWorkspaceContext {
  const activeSequence = storyboard.sequences.find(sequence => sequence.id === storyboard.selectedSequenceId) || storyboard.sequences[0]
  const selectedRow = activeSequence?.rows.find(row => row.id === storyboard.selectedRowId) || activeSequence?.rows[0] || null
  const rows = storyboard.sequences.flatMap(sequence =>
    sequence.rows.map(row => ({
      sequenceId: sequence.id,
      id: row.id,
      cutLabel: compactText(row.cutLabel),
      timeRange: compactText(row.timeRange),
      subject: compactText(row.subject),
      action: compactText(row.action),
      scene: compactText(row.scene),
      camera: compactText(row.camera),
      lighting: compactText(row.lighting),
      audio: compactText(row.audio),
      duration: compactText(row.duration)
    }))
  )

  return {
    contextId: `storyboard:${activeProject.id}:${storyboard.selectedSequenceId || 'sequence'}:${storyboard.selectedRowId || 'row'}`,
    mode: 'storyboard-workspace',
    projectId: activeProject.id,
    projectTitle: activeProject.title,
    snapshot: {
      projectType: activeProject.type,
      aspectRatio: storyboard.aspectRatio,
      selectedSequenceId: storyboard.selectedSequenceId,
      selectedRowId: storyboard.selectedRowId,
      activeSequence: activeSequence ? {
        id: activeSequence.id,
        name: compactText(activeSequence.name),
        description: compactText(activeSequence.description),
        style: compactText(activeSequence.style),
        constraints: compactText(activeSequence.constraints)
      } : null,
      selectedRow: selectedRow ? {
        id: selectedRow.id,
        cutLabel: compactText(selectedRow.cutLabel),
        timeRange: compactText(selectedRow.timeRange),
        subject: compactText(selectedRow.subject),
        action: compactText(selectedRow.action),
        scene: compactText(selectedRow.scene),
        camera: compactText(selectedRow.camera),
        lighting: compactText(selectedRow.lighting),
        audio: compactText(selectedRow.audio),
        duration: compactText(selectedRow.duration)
      } : null,
      sequences: storyboard.sequences.map(sequence => ({
        id: sequence.id,
        name: compactText(sequence.name),
        description: compactText(sequence.description),
        style: compactText(sequence.style),
        constraints: compactText(sequence.constraints),
        rowCount: sequence.rows.length
      })),
      rows: rows.slice(0, MAX_ROWS)
    }
  }
}

export function buildThreeStageWorkspaceContext({
  activeProject,
  threeStage,
  selectedOutput,
  freeCanvas
}: {
  activeProject: IPromptProject
  threeStage: IThreeStageProject
  selectedOutput: string
  freeCanvas?: {
    selectedNodeId?: string | null
    selectedNodeType?: string | null
    selectedMediaAssetId?: string | null
    nodes?: Array<{
      id: string
      kind: string
      title?: string
      formId?: string
      mediaAssetId?: string | null
    }>
  }
}): AgentWorkspaceContext {
  const syncedThreeStage = syncThreeStageLegacyFields(threeStage)
  const selectedStage = syncedThreeStage.selectedStage
  const selectedFieldId = syncedThreeStage.selectedFieldId
  const pages = normalizeThreeStagePages(syncedThreeStage)
  const selectedContext = getSelectedThreeStageFormContext(syncedThreeStage)
  const pairedStoryboardSummary = selectedContext.form.type === 'videoPrompt' && selectedContext.pairedStoryboardForm
    ? compactThreeStageSection(selectedContext.pairedStoryboardForm.section)
    : null

  return {
    contextId: `three-stage:${activeProject.id}:${selectedContext.page.id}:${selectedContext.form.id}:${selectedFieldId}`,
    mode: 'three-stage-workspace',
    projectId: activeProject.id,
    projectTitle: activeProject.title,
    snapshot: {
      projectType: activeProject.type,
      selectedStage,
      selectedFieldId,
      selectedPageId: selectedContext.page.id,
      selectedItemId: selectedContext.item.id,
      selectedFormId: selectedContext.form.id,
      selectedPairId: selectedContext.item.kind === 'storyVideoPair' ? selectedContext.item.pairId : null,
      selectedFormType: selectedContext.form.type,
      selectedFormTitle: selectedContext.form.title,
      pairedStoryboardSummary,
      selectedOutput: compactText(selectedOutput),
      sections: {
        character: compactThreeStageSection(syncedThreeStage.character),
        storyboard: compactThreeStageSection(syncedThreeStage.storyboard),
        videoPrompt: compactThreeStageSection(syncedThreeStage.videoPrompt)
      },
      pages: pages.map(page => ({
        id: page.id,
        title: compactText(page.title),
        selectedItemId: page.selectedItemId,
        items: page.items.map(item => item.kind === 'character'
          ? {
              id: item.id,
              kind: item.kind,
              formId: item.form.id,
              title: item.form.title,
              number: item.form.number
            }
          : {
              id: item.id,
              kind: item.kind,
              pairId: item.pairId,
              storyboardFormId: item.storyboardForm.id,
              videoPromptFormId: item.videoPromptForm.id,
              number: item.storyboardForm.number
            })
      })),
      freeCanvas: freeCanvas ? {
        selectedNodeId: freeCanvas.selectedNodeId || null,
        selectedNodeType: freeCanvas.selectedNodeType || null,
        selectedMediaAssetId: freeCanvas.selectedMediaAssetId || null,
        nodes: (freeCanvas.nodes || []).slice(0, MAX_CARDS).map(node => ({
          id: node.id,
          kind: node.kind,
          title: compactText(node.title),
          formId: node.formId,
          mediaAssetId: node.mediaAssetId || null
        }))
      } : undefined
    }
  }
}

function compactThreeStageSection(section: IThreeStageSectionLike) {
  return {
    focusedFieldId: section.focusedFieldId,
    fields: Object.fromEntries(
      Object.entries(section.fields).map(([key, value]) => [key, compactText(String(value))])
    )
  }
}

type IThreeStageSectionLike = IThreeStageProject['character']
