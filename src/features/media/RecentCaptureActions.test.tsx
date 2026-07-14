import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n'
import { recentCaptureFixtures } from './media-fixtures'
import { RecentCaptureActions } from './RecentCaptureActions'

describe('RecentCaptureActions', () => {
  it('exposes registration and Canvas actions for an unregistered image', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <RecentCaptureActions
          capture={recentCaptureFixtures[0]}
          canPlaceOnCanvas
          onRegister={() => undefined}
          onPlaceOnCanvas={() => undefined}
          onOpenPromptLibrary={() => undefined}
        />
      </I18nProvider>
    )
    expect(markup).toContain('data-register-capture')
    expect(markup).toContain('data-place-capture-on-canvas')
    expect(markup).not.toContain('data-open-registered-prompt')
  })

  it('replaces registration with a Prompt Library shortcut after registration', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <RecentCaptureActions
          capture={{ ...recentCaptureFixtures[0], registeredPromptId: 'preset-1', status: 'registeredToPromptLibrary' }}
          canPlaceOnCanvas={false}
          onRegister={() => undefined}
          onPlaceOnCanvas={() => undefined}
          onOpenPromptLibrary={() => undefined}
        />
      </I18nProvider>
    )
    expect(markup).toContain('data-open-registered-prompt')
    expect(markup).not.toContain('data-register-capture')
  })
})
