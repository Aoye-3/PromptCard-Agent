import { describe, expect, test } from 'vitest'
import {
  PROMPT_LIBRARY_AGENT_PANEL_MAX_WIDTH,
  PROMPT_LIBRARY_AGENT_PANEL_MIN_WIDTH,
  clampPromptLibraryAgentPanelWidth,
  getPromptLibraryAgentPanelDefaultWidth,
  getPromptLibraryAgentPanelWidthBounds
} from './agent-panel-layout'

describe('prompt library agent panel layout', () => {
  test('derives default width from the container', () => {
    expect(getPromptLibraryAgentPanelDefaultWidth(1600)).toBe(688)
  })

  test('clamps to the minimum agent panel width', () => {
    expect(clampPromptLibraryAgentPanelWidth(200, 1600)).toBe(PROMPT_LIBRARY_AGENT_PANEL_MIN_WIDTH)
  })

  test('clamps to the global maximum width', () => {
    expect(clampPromptLibraryAgentPanelWidth(1200, 2200)).toBe(PROMPT_LIBRARY_AGENT_PANEL_MAX_WIDTH)
  })

  test('preserves the minimum table width', () => {
    const bounds = getPromptLibraryAgentPanelWidthBounds(1200)
    expect(bounds.max).toBe(560)
    expect(clampPromptLibraryAgentPanelWidth(900, 1200)).toBe(560)
  })

  test('falls back for invalid saved settings values', () => {
    expect(clampPromptLibraryAgentPanelWidth('wide', 1600)).toBe(688)
    expect(clampPromptLibraryAgentPanelWidth(Number.NaN, 1600)).toBe(688)
  })
})
