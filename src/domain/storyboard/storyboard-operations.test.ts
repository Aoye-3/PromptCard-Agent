import { describe, expect, test } from 'vitest'
import { createStoryboardProject } from '@/domain/projects/project-normalization'
import {
  addStoryboardRow,
  addStoryboardSequence,
  deleteStoryboardRow,
  deleteStoryboardSequence,
  duplicateStoryboardRow,
  moveStoryboardRow
} from './storyboard-operations'

describe('storyboard operations', () => {
  test('adds a sequence and selects its first row', () => {
    const storyboard = createStoryboardProject(100)
    const next = addStoryboardSequence(storyboard, 200)

    expect(next.sequences).toHaveLength(2)
    expect(next.selectedSequenceId).toBe('200-sequence-1')
    expect(next.selectedRowId).toBe('200-0')
  })

  test('keeps one sequence and one row as the minimum', () => {
    const storyboard = createStoryboardProject(100)

    expect(deleteStoryboardSequence(storyboard, storyboard.sequences[0].id)).toBe(storyboard)
    expect(deleteStoryboardRow(storyboard, storyboard.sequences[0].rows[0].id)).toBe(storyboard)
  })

  test('adds, duplicates, moves, and deletes rows immutably', () => {
    const storyboard = addStoryboardRow(createStoryboardProject(100), 200)
    const firstRowId = storyboard.sequences[0].rows[0].id
    const secondRowId = storyboard.sequences[0].rows[1].id
    const duplicated = duplicateStoryboardRow(storyboard, firstRowId, 300)
    const moved = moveStoryboardRow(duplicated, firstRowId, 1)
    const deleted = deleteStoryboardRow(moved, secondRowId)

    expect(storyboard.sequences[0].rows.map(row => row.id)).toEqual(['100-0', '200-1'])
    expect(duplicated.sequences[0].rows.map(row => row.id)).toEqual(['100-0', '300-copy', '200-1'])
    expect(moved.sequences[0].rows.map(row => row.id)).toEqual(['300-copy', '100-0', '200-1'])
    expect(deleted.sequences[0].rows.map(row => row.id)).toEqual(['300-copy', '100-0'])
    expect(deleted.selectedRowId).toBe('300-copy')
  })
})
