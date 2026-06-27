export const PROMPT_LIBRARY_AGENT_PANEL_SETTINGS_KEY = 'promptLibraryAgentPanelWidthPx'
export const PROMPT_LIBRARY_AGENT_PANEL_MIN_WIDTH = 360
export const PROMPT_LIBRARY_AGENT_PANEL_MAX_WIDTH = 900
export const PROMPT_LIBRARY_TABLE_MIN_WIDTH = 640
export const PROMPT_LIBRARY_AGENT_PANEL_KEYBOARD_STEP = 24
export const PROMPT_LIBRARY_AGENT_PANEL_DEFAULT_WIDTH = 680

export interface PromptLibraryAgentPanelWidthBounds {
  min: number
  max: number
}

export const getPromptLibraryAgentPanelWidthBounds = (containerWidth: number): PromptLibraryAgentPanelWidthBounds => {
  const availableMax = Number.isFinite(containerWidth) && containerWidth > 0
    ? containerWidth - PROMPT_LIBRARY_TABLE_MIN_WIDTH
    : PROMPT_LIBRARY_AGENT_PANEL_MAX_WIDTH
  return {
    min: PROMPT_LIBRARY_AGENT_PANEL_MIN_WIDTH,
    max: Math.max(
      PROMPT_LIBRARY_AGENT_PANEL_MIN_WIDTH,
      Math.min(PROMPT_LIBRARY_AGENT_PANEL_MAX_WIDTH, availableMax)
    )
  }
}

export const getPromptLibraryAgentPanelDefaultWidth = (containerWidth: number): number => {
  const bounds = getPromptLibraryAgentPanelWidthBounds(containerWidth)
  const preferred = Number.isFinite(containerWidth) && containerWidth > 0
    ? Math.round(containerWidth * 0.43)
    : PROMPT_LIBRARY_AGENT_PANEL_DEFAULT_WIDTH
  return clampToBounds(preferred, bounds)
}

export const clampPromptLibraryAgentPanelWidth = (
  value: unknown,
  containerWidth: number
): number => {
  const bounds = getPromptLibraryAgentPanelWidthBounds(containerWidth)
  const candidate = typeof value === 'number' && Number.isFinite(value)
    ? value
    : getPromptLibraryAgentPanelDefaultWidth(containerWidth)
  return clampToBounds(candidate, bounds)
}

const clampToBounds = (value: number, bounds: PromptLibraryAgentPanelWidthBounds): number =>
  Math.round(Math.min(bounds.max, Math.max(bounds.min, value)))
