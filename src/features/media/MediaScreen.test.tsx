import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppShell } from '@/components/app/AppShell'
import { I18nProvider } from '@/i18n'
import { MediaScreen } from './MediaScreen'

describe('MediaScreen', () => {
  it('renders the recent captures page shell and metadata affordances', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <MediaScreen />
      </I18nProvider>
    )

    expect(markup).toContain('data-media-screen')
    expect(markup).toContain('近期捕获')
    expect(markup).toContain('还没有近期捕获')
    expect(markup).toContain('捕获收件箱')
    expect(markup).toContain('提示词文本')
    expect(markup).toContain('用户备注')
    expect(markup).toContain('来源平台')
    expect(markup).toContain('来源 URL')
    expect(markup).toContain('素材角色')
    expect(markup).toContain('用途')
    expect(markup).toContain('归档')
    expect(markup).toContain('注册入库')
    expect(markup).toContain('放到画布')
  })

  it('renders Media as a top-level bottom navigation tab', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <AppShell
          activeTab="media"
          setActiveTab={() => undefined}
          projectMode="home"
          saveStatus="saved"
          saveStatusText="Saved"
          activeProject={null}
          onCreateProject={() => undefined}
          onOpenTemplateLibrary={() => undefined}
          onShowProjectTrash={() => undefined}
          showProjectUtilities={false}
        >
          <MediaScreen />
        </AppShell>
      </I18nProvider>
    )

    expect(markup).toContain('grid-cols-5')
    expect(markup).toContain('媒体')
  })
})
