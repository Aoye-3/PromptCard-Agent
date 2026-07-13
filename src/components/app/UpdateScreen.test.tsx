import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UpdateScreen } from './UpdateScreen'

describe('UpdateScreen', () => {
  it('renders a guarded unavailable state outside the desktop shell', () => {
    const markup = renderToStaticMarkup(<UpdateScreen />)

    expect(markup).toContain('data-update-screen')
    expect(markup).toContain('Desktop shell unavailable')
    expect(markup).toContain('更新命令只在 Tauri 桌面壳中可用')
    expect(markup).toContain('GitHub 更新源')
    expect(markup).toContain('差异预览')
  })
})
