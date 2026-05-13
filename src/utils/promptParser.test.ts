import { describe, expect, it } from 'vitest'
import { createInitialPage } from '@/stores/card-initial-state'
import { assemblePrompt } from './promptParser'

describe('assemblePrompt', () => {
  it('returns empty text for the empty starter cards', () => {
    expect(assemblePrompt([createInitialPage(12345)])).toBe('')
  })
})
