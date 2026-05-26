import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { getBuilderTemplateById, getBuilderTemplates } from '@/domain/builder-templates/builder-templates'
import { I18nProvider } from '@/i18n'
import { BuilderModePreviewFrame } from './BuilderModePreviewFrame'
import { builderPreviewIds } from './builder-preview-contract'
import { TemplateLibraryScreen } from './TemplateLibraryScreen'
import { CreateProjectModal } from './ProjectModals'

const renderWithI18n = (node: ReactElement) => renderToStaticMarkup(
  <I18nProvider>
    {node}
  </I18nProvider>
)

const extractTemplateContracts = (markup: string) =>
  Array.from(markup.matchAll(/data-builder-template-id="([^"]+)" data-builder-template-modules="([^"]*)"/g))
    .map(match => ({
      id: match[1],
      modules: match[2] ? match[2].split(' ') : []
    }))

describe('BuilderModePreviewFrame', () => {
  it('renders all registered builder previews through the interactive preview frame', () => {
    for (const id of builderPreviewIds) {
      const markup = renderWithI18n(
        <BuilderModePreviewFrame
          template={getBuilderTemplateById(id)}
          snapshot={{}}
          onSnapshotChange={() => undefined}
        />
      )

      expect(markup).toContain('data-builder-interactive-preview')
      expect(markup).toContain('预览模式')
      expect(markup).not.toContain('data-builder-preview-scroll')
    }
  })

  it('renders the template library as a full-width page, not a modal or narrow preview', () => {
    const markup = renderWithI18n(
      <TemplateLibraryScreen onCreateFromTemplate={() => undefined} />
    )

    expect(markup).toContain('data-template-library-screen')
    expect(markup).toContain('lg:grid-cols-[280px_minmax(0,1fr)]')
    expect(markup).not.toContain('max-w-[1320px]')
    expect(markup).not.toContain('minmax(0,940px)')
    expect(markup).not.toContain('fixed inset-0')
  })

  it('keeps the template library and create-project modal in lockstep with builder module registry', () => {
    const expected = getBuilderTemplates().map(template => ({
      id: template.id,
      modules: template.modules.map(module => module.id)
    }))
    const libraryMarkup = renderWithI18n(
      <TemplateLibraryScreen onCreateFromTemplate={() => undefined} />
    )
    const modalMarkup = renderWithI18n(
      <CreateProjectModal onClose={() => undefined} onCreateFromTemplate={() => undefined} />
    )

    expect(extractTemplateContracts(libraryMarkup)).toEqual(expected)
    expect(extractTemplateContracts(modalMarkup)).toEqual(expected)
  })
})
