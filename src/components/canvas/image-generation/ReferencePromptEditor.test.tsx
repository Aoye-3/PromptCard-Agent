import { useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PromptDocument } from '@/models/PromptHistory.model'
import { ReferencePromptEditor } from './ReferencePromptEditor'
import {
  promptDocumentEditorText,
  promptEditorUnitAt,
  replacePromptEditorRangeWithReference,
  replacePromptEditorRangeWithText
} from './reference-prompt-editor-model'
import {
  insertPromptReferenceAtTextCursor,
  promptDocumentFromText,
  reconcilePromptDocumentEdit,
  replacePromptRangeWithReference,
  serializePromptDocument
} from './reference-prompt-document'

const references = [
  {
    edgeId: 'edge-product',
    nodeId: 'image-product',
    referenceId: 'ref-product',
    label: '产品图',
    role: 'source-image' as const,
    assetId: 'asset-product',
    order: 0
  },
  {
    edgeId: 'edge-style',
    nodeId: 'image-style',
    referenceId: 'ref-style',
    label: '风格图',
    role: 'reference-image' as const,
    assetId: 'asset-style',
    order: 1
  }
]

const Harness = ({
  initialDocument,
  editorReferences = references
}: {
  initialDocument: PromptDocument
  editorReferences?: typeof references
}) => {
  const [document, setDocument] = useState(initialDocument)
  return (
    <ReferencePromptEditor
      document={document}
      references={editorReferences}
      onChange={setDocument}
    />
  )
}

const editorWithText = (text: string) => ({
  childNodes: [{ nodeType: 3, textContent: text }],
  contains: () => false
})

describe('ReferencePromptEditor document model', () => {
  it('serializes stable reference segments into readable textarea text and restores them', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [
        { type: 'text', text: '使用 ' },
        { type: 'reference', referenceId: 'ref-product', label: '产品图' },
        { type: 'text', text: ' 的主体' }
      ]
    }

    const serialized = serializePromptDocument(document)
    expect(serialized).toEqual({
      text: '使用 @产品图 的主体',
      mentions: [{ start: 3, end: 7, referenceId: 'ref-product', label: '产品图' }]
    })
    expect(promptDocumentFromText(serialized.text, serialized.mentions)).toEqual(document)
  })

  it('keeps untouched reference ids while text around them changes', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [
        { type: 'text', text: '使用 ' },
        { type: 'reference', referenceId: 'ref-product', label: '产品图' },
        { type: 'text', text: ' 生成海报' }
      ]
    }

    expect(reconcilePromptDocumentEdit(document, '请使用 @产品图 生成海报')).toEqual({
      version: 1,
      segments: [
        { type: 'text', text: '请使用 ' },
        { type: 'reference', referenceId: 'ref-product', label: '产品图' },
        { type: 'text', text: ' 生成海报' }
      ]
    })
  })

  it('degrades a token to plain text when the user edits through it', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [
        { type: 'text', text: '使用 ' },
        { type: 'reference', referenceId: 'ref-product', label: '产品图' }
      ]
    }

    expect(reconcilePromptDocumentEdit(document, '使用 @产品照片')).toEqual({
      version: 1,
      segments: [{ type: 'text', text: '使用 @产品照片' }]
    })
  })

  it('allows the same stable image reference to be inserted more than once', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [
        { type: 'reference', referenceId: 'ref-product', label: '产品图' },
        { type: 'text', text: ' 和 @' }
      ]
    }

    expect(replacePromptRangeWithReference(document, 7, 8, references[0])).toEqual({
      version: 1,
      segments: [
        { type: 'reference', referenceId: 'ref-product', label: '产品图' },
        { type: 'text', text: ' 和 ' },
        { type: 'reference', referenceId: 'ref-product', label: '产品图' }
      ]
    })
  })

  it('retains the compatibility helper for insertion at a text-segment cursor', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [{ type: 'text', text: '放到 @ 这里' }]
    }

    expect(insertPromptReferenceAtTextCursor(document, 0, 4, references[0])).toEqual({
      version: 1,
      segments: [
        { type: 'text', text: '放到 ' },
        { type: 'reference', referenceId: 'ref-product', label: '产品图' },
        { type: 'text', text: ' 这里' }
      ]
    })
  })

  it('treats each reference as one editor unit for repeated insertion and deletion', () => {
    const once = replacePromptEditorRangeWithReference(
      { version: 1, segments: [{ type: 'text', text: '前@后' }] },
      1,
      2,
      references[0]
    )
    const twice = replacePromptEditorRangeWithReference(once, 2, 2, references[0])

    expect(promptDocumentEditorText(twice)).toBe(`前\uFFFC\uFFFC后`)
    expect(promptEditorUnitAt(twice, 1)).toMatchObject({
      type: 'reference',
      referenceId: 'ref-product'
    })
    expect(replacePromptEditorRangeWithText(twice, 1, 2, '')).toEqual({
      version: 1,
      segments: [
        { type: 'text', text: '前' },
        { type: 'reference', referenceId: 'ref-product', label: '产品图' },
        { type: 'text', text: '后' }
      ]
    })
  })
})

describe('ReferencePromptEditor interactions', () => {
  it('renders references as inline thumbnail tokens without visible @ labels', () => {
    const markup = renderToStaticMarkup(
      <ReferencePromptEditor
        document={{
          version: 1,
          segments: [
            { type: 'text', text: '使用 ' },
            { type: 'reference', referenceId: 'ref-product', label: '产品图' },
            { type: 'text', text: ' 生成海报' }
          ]
        }}
        references={references}
        onChange={vi.fn()}
      />
    )

    expect(markup).toContain('role="textbox"')
    expect(markup).toContain('contenteditable="true"')
    expect(markup).toContain('data-reference-token="true"')
    expect(markup).toContain('/storage-api/assets/asset-product')
    expect(markup).not.toContain('<textarea')
    expect(markup).not.toContain('@产品图')
  })

  it('renders an unresolved reference as a broken thumbnail token and preserves its error', () => {
    const markup = renderToStaticMarkup(
      <ReferencePromptEditor
        document={{
          version: 1,
          segments: [
            { type: 'text', text: '使用 ' },
            { type: 'reference', referenceId: 'ref-missing', label: '已删除图片' }
          ]
        }}
        references={references}
        unresolvedReferenceIds={['ref-missing']}
        onChange={vi.fn()}
      />
    )

    expect(markup).toContain('contenteditable="true"')
    expect(markup).toContain('data-reference-token="true"')
    expect(markup).toContain('失效图片引用：已删除图片')
    expect(markup).not.toContain('<textarea')
    expect(markup).toContain('失效引用 @已删除图片')
  })

  it('opens a filtered listbox when @ is typed and inserts the chosen reference at the caret', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<Harness initialDocument={{ version: 1, segments: [{ type: 'text', text: '参考 ' }] }} />)
    })
    const editor = renderer.root.findByProps({ 'aria-label': '图片描述' })

    act(() => editor.props.onInput({
      currentTarget: editorWithText('参考 @产')
    }))

    const options = renderer.root.findAllByProps({ role: 'option' })
    expect(options).toHaveLength(1)
    expect(options[0].props.children).toBeTruthy()

    act(() => options[0].props.onClick())
    expect(renderer.root.findAllByProps({ 'data-reference-id': 'ref-product' })).not.toHaveLength(0)
    expect(renderer.root.findAllByProps({ 'data-reference-token': 'true' })).toHaveLength(1)
    expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0)
  })

  it('supports Arrow navigation, Enter selection, and Escape dismissal', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<Harness initialDocument={{ version: 1, segments: [{ type: 'text', text: '' }] }} />)
    })
    let editor = renderer.root.findByProps({ 'aria-label': '图片描述' })
    act(() => editor.props.onInput({ currentTarget: editorWithText('@') }))
    editor = renderer.root.findByProps({ 'aria-label': '图片描述' })

    act(() => editor.props.onKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() }))
    act(() => editor.props.onKeyDown({ key: 'Enter', preventDefault: vi.fn() }))
    expect(renderer.root.findAllByProps({ 'data-reference-id': 'ref-style' })).not.toHaveLength(0)

    editor = renderer.root.findByProps({ 'aria-label': '图片描述' })
    act(() => editor.props.onInput({ currentTarget: editorWithText('\uFFFC @') }))
    editor = renderer.root.findByProps({ 'aria-label': '图片描述' })
    act(() => editor.props.onKeyDown({ key: 'Escape', preventDefault: vi.fn() }))
    expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0)
  })

  it('does not open the mention picker during IME composition', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<Harness initialDocument={{ version: 1, segments: [{ type: 'text', text: '' }] }} />)
    })
    const editor = renderer.root.findByProps({ 'aria-label': '图片描述' })

    act(() => editor.props.onCompositionStart({}))
    act(() => editor.props.onInput({ currentTarget: editorWithText('@') }))

    expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0)
  })

  it('commits an IME composition once when composition ends', () => {
    const onChange = vi.fn()
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <ReferencePromptEditor
          document={{ version: 1, segments: [{ type: 'text', text: '' }] }}
          references={references}
          onChange={onChange}
        />
      )
    })
    const editor = renderer.root.findByProps({ 'aria-label': '图片描述' })
    const composedEditor = editorWithText('中文')

    act(() => editor.props.onCompositionStart({}))
    act(() => editor.props.onInput({ currentTarget: composedEditor }))
    expect(onChange).not.toHaveBeenCalled()

    act(() => editor.props.onCompositionEnd({ currentTarget: composedEditor }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      version: 1,
      segments: [{ type: 'text', text: '中文' }]
    })
  })

  it('shows injection and upload actions when @ has no available image candidate', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <ReferencePromptEditor
          document={{ version: 1, segments: [{ type: 'text', text: '@' }] }}
          references={[]}
          canInjectSelectedNodes
          selectedNodeCount={2}
          onInjectSelectedNodes={vi.fn()}
          onRequestUpload={vi.fn()}
          onChange={vi.fn()}
        />
      )
    })
    const editor = renderer.root.findByProps({ 'aria-label': '图片描述' })
    act(() => editor.props.onInput({ currentTarget: editorWithText('@a') }))

    expect(renderer.root.findByProps({ role: 'listbox' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '注入已选节点' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '上传图片' })).toBeTruthy()
  })

  it('accepts only plain text from the clipboard', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<Harness initialDocument={{ version: 1, segments: [{ type: 'text', text: '' }] }} />)
    })
    const editor = renderer.root.findByProps({ 'aria-label': '图片描述' })
    const preventDefault = vi.fn()

    act(() => editor.props.onPaste({
      currentTarget: editorWithText(''),
      preventDefault,
      clipboardData: {
        getData: (type: string) => type === 'text/plain' ? '纯文本' : '<b>纯文本</b>'
      }
    }))

    expect(preventDefault).toHaveBeenCalled()
    expect(renderer.root.findAllByProps({ 'data-prompt-text': true })[0].props.children).toBe('纯文本')
  })
})
