import type { IStoryboardProject, IStoryboardRow, IStoryboardSequence } from '@/models/PromptHistory.model'
import { createStoryboardRow, createStoryboardSequence } from '@/domain/projects/project-normalization'

const updateSequence = (
  storyboard: IStoryboardProject,
  sequenceId: string,
  updates: Partial<IStoryboardSequence>,
  timestamp = Date.now()
): IStoryboardProject => ({
  ...storyboard,
  sequences: storyboard.sequences.map(sequence =>
    sequence.id === sequenceId ? { ...sequence, ...updates, updatedAt: timestamp } : sequence
  )
})

export const addStoryboardSequence = (storyboard: IStoryboardProject, timestamp = Date.now()): IStoryboardProject => {
  const nextSequence = createStoryboardSequence(storyboard.sequences.length, timestamp)
  return {
    ...storyboard,
    sequences: [...storyboard.sequences, nextSequence],
    selectedSequenceId: nextSequence.id,
    selectedRowId: nextSequence.rows[0]?.id || null
  }
}

export const deleteStoryboardSequence = (storyboard: IStoryboardProject, sequenceId: string): IStoryboardProject => {
  if (storyboard.sequences.length <= 1) return storyboard

  const sequenceIndex = storyboard.sequences.findIndex(sequence => sequence.id === sequenceId)
  if (sequenceIndex < 0) return storyboard

  const nextSequences = storyboard.sequences.filter(sequence => sequence.id !== sequenceId)
  const fallbackSequence = nextSequences[Math.min(sequenceIndex, nextSequences.length - 1)]
  return {
    ...storyboard,
    sequences: nextSequences,
    selectedSequenceId: fallbackSequence.id,
    selectedRowId: fallbackSequence.rows[0]?.id || null
  }
}

export const selectStoryboardSequence = (storyboard: IStoryboardProject, sequenceId: string): IStoryboardProject => {
  const nextSequence = storyboard.sequences.find(sequence => sequence.id === sequenceId)
  if (!nextSequence) return storyboard
  return {
    ...storyboard,
    selectedSequenceId: nextSequence.id,
    selectedRowId: nextSequence.rows[0]?.id || null
  }
}

export const addStoryboardRow = (storyboard: IStoryboardProject, timestamp = Date.now()): IStoryboardProject => {
  const activeSequence = storyboard.sequences.find(sequence => sequence.id === storyboard.selectedSequenceId) || storyboard.sequences[0]
  if (!activeSequence) return storyboard

  const nextRow = createStoryboardRow(activeSequence.rows.length, timestamp)
  return {
    ...updateSequence(storyboard, activeSequence.id, {
      rows: [...activeSequence.rows, nextRow]
    }, timestamp),
    selectedSequenceId: activeSequence.id,
    selectedRowId: nextRow.id
  }
}

export const duplicateStoryboardRow = (storyboard: IStoryboardProject, rowId: string, timestamp = Date.now()): IStoryboardProject => {
  const activeSequence = storyboard.sequences.find(sequence => sequence.id === storyboard.selectedSequenceId) || storyboard.sequences[0]
  if (!activeSequence) return storyboard

  const source = activeSequence.rows.find(row => row.id === rowId)
  if (!source) return storyboard

  const nextRow: IStoryboardRow = {
    ...source,
    id: `${timestamp}-copy`,
    cutLabel: `${source.cutLabel} Copy`,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const sourceIndex = activeSequence.rows.findIndex(row => row.id === rowId)
  const rows = [...activeSequence.rows]
  rows.splice(sourceIndex + 1, 0, nextRow)

  return {
    ...updateSequence(storyboard, activeSequence.id, { rows }, timestamp),
    selectedSequenceId: activeSequence.id,
    selectedRowId: nextRow.id
  }
}

export const deleteStoryboardRow = (storyboard: IStoryboardProject, rowId: string, timestamp = Date.now()): IStoryboardProject => {
  const activeSequence = storyboard.sequences.find(sequence => sequence.id === storyboard.selectedSequenceId) || storyboard.sequences[0]
  if (!activeSequence || activeSequence.rows.length <= 1) return storyboard

  const rows = activeSequence.rows.filter(row => row.id !== rowId)
  return {
    ...updateSequence(storyboard, activeSequence.id, { rows }, timestamp),
    selectedSequenceId: activeSequence.id,
    selectedRowId: storyboard.selectedRowId === rowId ? rows[0]?.id || null : storyboard.selectedRowId
  }
}

export const moveStoryboardRow = (storyboard: IStoryboardProject, rowId: string, direction: -1 | 1, timestamp = Date.now()): IStoryboardProject => {
  const activeSequence = storyboard.sequences.find(sequence => sequence.id === storyboard.selectedSequenceId) || storyboard.sequences[0]
  if (!activeSequence) return storyboard

  const index = activeSequence.rows.findIndex(row => row.id === rowId)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= activeSequence.rows.length) return storyboard

  const rows = [...activeSequence.rows]
  const [row] = rows.splice(index, 1)
  rows.splice(nextIndex, 0, row)
  return updateSequence(storyboard, activeSequence.id, { rows }, timestamp)
}
