import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n'
import type { IPreset } from '@/models/Card.model'
import PromptLibraryTable from './PromptLibraryTable'

const preset = (id: string): IPreset => ({
  id,
  type: 'camera',
  category: 'camera',
  label: id,
  content: `${id} content`,
  usageCount: 0,
  meta: {}
})

const renderTable = (sortable: boolean) => renderToStaticMarkup(
  <I18nProvider>
    <PromptLibraryTable
      presets={[preset('camera-1'), preset('camera-2')]}
      onEdit={() => undefined}
      onDelete={() => undefined}
      onReorder={() => undefined}
      onMoveToTop={() => undefined}
      sortable={sortable}
    />
  </I18nProvider>
)

describe('PromptLibraryTable', () => {
  it('marks selected presets without changing row order', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <PromptLibraryTable
          presets={[preset('camera-1'), preset('camera-2')]}
          selectedIds={['camera-2']}
          onEdit={() => undefined}
          onDelete={() => undefined}
        />
      </I18nProvider>
    )

    expect(markup.indexOf('camera-1 content')).toBeLessThan(markup.indexOf('camera-2 content'))
    expect(markup).toContain('checked=""')
  })

  it('shows the move-to-top action only when the list is sortable', () => {
    expect(renderTable(true)).toContain('置顶')
    expect(renderTable(true)).toContain('移动到列表顶端')
    expect(renderTable(false)).not.toContain('置顶')
  })
})
