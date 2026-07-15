import { renderToStaticMarkup } from 'react-dom/server'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { CanvasBottomToolbar } from './FreeCanvasBuilderScreen'

const baseProps = {
  quickDrawerOpen: false,
  quickPresets: [],
  onCreateText: vi.fn(),
  onCreateImage: vi.fn(),
  onToggleQuickDrawer: vi.fn(),
  onOpenQuickPresetComposer: vi.fn(),
  onEditQuickPreset: vi.fn(),
  onUseQuickPreset: vi.fn()
}

describe('free canvas image generation feature entry', () => {
  it('is hidden by default while persisted generator rendering remains independent', () => {
    expect(renderToStaticMarkup(<CanvasBottomToolbar {...baseProps} />)).not.toContain('Image generator')
  })

  it('is shown only when the feature-gated create action is supplied', () => {
    const markup = renderToStaticMarkup(
      <CanvasBottomToolbar {...baseProps} onCreateImageGenerator={vi.fn()} />
    )
    expect(markup).toContain('title="Image generator"')
  })

  it('disables the mounted create action while its single flight is busy', () => {
    const onCreateImageGenerator = vi.fn()
    const renderer = create(
      <CanvasBottomToolbar
        {...baseProps}
        onCreateImageGenerator={onCreateImageGenerator}
        imageGeneratorCreating
      />
    )
    const button = renderer.root.findAllByType('button').find(candidate => candidate.props.title === 'Image generator')!

    expect(button.props.disabled).toBe(true)
    act(() => button.props.onClick())
    expect(onCreateImageGenerator).not.toHaveBeenCalled()
  })
})
