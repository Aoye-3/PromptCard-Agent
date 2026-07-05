import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FloatingCaptureToolbar } from './FloatingCaptureToolbar'

describe('FloatingCaptureToolbar', () => {
  it('renders screenshot, disabled record, close, and drag controls', () => {
    const markup = renderToStaticMarkup(<FloatingCaptureToolbar />)

    expect(markup).toContain('data-floating-capture-toolbar')
    expect(markup).toContain('aria-label="Screenshot"')
    expect(markup).toContain('aria-label="Record coming next"')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('aria-label="Close toolbar"')
    expect(markup).toContain('aria-label="Drag capture toolbar"')
  })
})
