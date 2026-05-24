import { describe, expect, test } from 'vitest'
import { isValidPresetList, isValidProjectList } from './promptcard-dev-storage'

describe('promptcard dev storage validators', () => {
  test('validates preset payload shape', () => {
    expect(isValidPresetList([
      {
        id: 'preset',
        type: 'camera',
        category: 'camera',
        label: 'Camera',
        content: 'Pan',
        usageCount: 0,
        meta: {}
      }
    ])).toBe(true)

    expect(isValidPresetList([{ id: 'preset' }])).toBe(false)
  })

  test('validates project payload shape and allowed project types', () => {
    expect(isValidProjectList([
      {
        id: 'project',
        title: 'Project',
        type: 'three-stage',
        pages: [],
        currentPage: 0,
        createdAt: 1,
        updatedAt: 1,
        lastOpenedAt: 1,
        meta: {}
      }
    ])).toBe(true)

    expect(isValidProjectList([{ id: 'project', type: 'unknown' }])).toBe(false)
  })
})
