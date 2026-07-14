import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n'
import { recentCaptureFixtures } from './media-fixtures'
import { RecentCaptureInbox } from './RecentCaptureInbox'

describe('RecentCaptureInbox', () => {
  it('enables batch selection and marks already registered captures as unavailable', () => {
    const captures = [
      recentCaptureFixtures[0],
      { ...recentCaptureFixtures[1], registeredPromptId: 'preset-existing', status: 'registeredToPromptLibrary' as const }
    ]
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <RecentCaptureInbox
          captures={captures}
          selectedCaptureId={captures[0].id}
          selectedCaptureIds={[captures[0].id]}
          batchMode
          onSelectCapture={() => undefined}
          onToggleBatchMode={() => undefined}
          onToggleCaptureSelection={() => undefined}
        />
      </I18nProvider>
    )

    expect(markup).toContain('data-batch-mode="true"')
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('checked=""')
    expect(markup).toContain('已注册')
    expect(markup).toContain('disabled=""')
  })

  it('labels the destructive action as removing the Recent Capture record', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <RecentCaptureInbox
          captures={[recentCaptureFixtures[0]]}
          selectedCaptureId={recentCaptureFixtures[0].id}
          onSelectCapture={() => undefined}
          onEditCapture={() => undefined}
          onDeleteCapture={() => undefined}
        />
      </I18nProvider>
    )

    expect(markup).toContain('data-capture-action="edit"')
    expect(markup).toContain('data-capture-action="delete"')
    expect(markup).toContain('>编辑<')
    expect(markup).toContain('>移除记录<')
    expect(markup).not.toContain('>删除<')
  })
})
