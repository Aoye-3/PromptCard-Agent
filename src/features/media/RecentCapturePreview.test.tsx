import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n'
import { RecentCapturePreview } from './RecentCapturePreview'
import type { RecentCaptureItemViewModel } from './media-types'

describe('RecentCapturePreview', () => {
  it('renders image captures from the physical asset URL', () => {
    const capture: RecentCaptureItemViewModel = {
      id: 'capture-1',
      assetId: 'asset-1.png',
      kind: 'screenshot',
      status: 'recent',
      purpose: 'inspirationReference',
      title: 'Reference',
      prompt: '',
      userNote: '',
      sourcePlatform: 'Floating toolbar',
      sourceUrl: '',
      contentType: 'image/png',
      sizeLabel: '2 KB',
      dimensionsLabel: '800 x 450',
      capturedAtLabel: 'Today 10:00'
    }

    const markup = renderToStaticMarkup(
      <I18nProvider>
        <RecentCapturePreview capture={capture} assetUrl={assetId => `/assets/${assetId}`} />
      </I18nProvider>
    )

    expect(markup).toContain('/assets/asset-1.png')
    expect(markup).toContain('<img')
  })
})
