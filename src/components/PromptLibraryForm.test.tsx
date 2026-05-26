import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n'
import type { IPreset } from '@/models/Card.model'
import PromptLibraryForm from './PromptLibraryForm'

const editingPreset: IPreset = {
  id: 'preset-1',
  type: 'camera',
  category: 'camera',
  label: 'Camera preset',
  content: 'Camera preset content',
  usageCount: 0,
  meta: {}
}

describe('PromptLibraryForm', () => {
  it('opens new presets in editable mode without copy or modify actions', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <PromptLibraryForm
          editingPreset={null}
          cardTypes={[{ type: 'camera', label: '镜头' }]}
          onSave={() => undefined}
          onCancel={() => undefined}
        />
      </I18nProvider>
    )

    expect(markup).not.toContain('readonly')
    expect(markup).not.toContain('disabled')
    expect(markup).not.toContain('复制内容')
    expect(markup).not.toContain('修改')
  })

  it('opens existing presets in read-only mode with copy and modify actions', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider>
        <PromptLibraryForm
          editingPreset={editingPreset}
          cardTypes={[{ type: 'camera', label: '镜头' }]}
          onSave={() => undefined}
          onCancel={() => undefined}
        />
      </I18nProvider>
    )

    expect(markup).toContain('readonly')
    expect(markup).toContain('disabled')
    expect(markup).toContain('Camera preset content')
    expect(markup).toContain('复制内容')
    expect(markup).toContain('修改')
    expect(markup).not.toContain('保存修改</button>')
  })
})
