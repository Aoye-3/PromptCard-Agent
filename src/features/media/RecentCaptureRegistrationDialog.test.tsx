import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n'
import { recentCaptureFixtures } from './media-fixtures'
import { RecentCaptureRegistrationDialog } from './RecentCaptureRegistrationDialog'

describe('RecentCaptureRegistrationDialog', () => {
  it('shows both batch modes, editable prompt fields, previews, and the media count', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <RecentCaptureRegistrationDialog
          captures={recentCaptureFixtures}
          onClose={() => undefined}
          onRegistered={() => undefined}
        />
      </I18nProvider>
    )

    expect(markup).toContain('data-recent-capture-registration')
    expect(markup).toContain('每项一个 Prompt')
    expect(markup).toContain('合并为一个 Prompt')
    expect(markup).toContain('最终写入 2 个媒体')
    expect(markup).toContain('Prompt 内容')
    expect(markup).toContain('/storage-api/assets/asset-style-frame-001')
  })
})
