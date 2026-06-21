import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { IPreset } from '@/models/Card.model'
import { PromptPresetPreviewDialog } from './PromptPresetPreviewDialog'

const createPreset = (overrides: Partial<IPreset> = {}): IPreset => ({
  id: 'preset-preview-test',
  type: 'camera',
  category: 'camera',
  label: 'Preview preset',
  content: 'A prompt body with\nmultiple lines.',
  usageCount: 0,
  meta: {},
  createdAt: 1,
  updatedAt: 1,
  ...overrides
})

describe('PromptPresetPreviewDialog', () => {
  it('renders an empty media state when the preset has no media', () => {
    const markup = renderToStaticMarkup(
      <PromptPresetPreviewDialog preset={createPreset()} onClose={() => undefined} />
    )

    expect(markup).toContain('媒体预览')
    expect(markup).toContain('暂无媒体')
    expect(markup).toContain('提示词')
    expect(markup).toContain('复制')
  })

  it('renders media previews when media items are present', () => {
    const markup = renderToStaticMarkup(
      <PromptPresetPreviewDialog
        preset={createPreset({
          meta: {
            media: [{
              id: 'media-asset-1',
              kind: 'image',
              source: 'asset',
              assetId: 'asset-1',
              title: 'Reference frame',
              size: 2048
            }]
          }
        })}
        onClose={() => undefined}
      />
    )

    expect(markup).toContain('Reference frame')
    expect(markup).toContain('2.0 KB')
    expect(markup).not.toContain('暂无媒体')
  })

  it('keeps the prompt content in the right-side prompt panel', () => {
    const markup = renderToStaticMarkup(
      <PromptPresetPreviewDialog preset={createPreset({ content: 'Copy me exactly.' })} onClose={() => undefined} />
    )

    expect(markup).toContain('Prompt content')
    expect(markup).toContain('Copy me exactly.')
  })
})
