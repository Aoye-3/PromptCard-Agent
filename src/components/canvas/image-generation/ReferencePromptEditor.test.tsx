import { useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PromptDocument } from '@/models/PromptHistory.model'
import { ReferencePromptEditor } from './ReferencePromptEditor'
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
})

describe('ReferencePromptEditor interactions', () => {
  it('renders one textarea, no contenteditable HTML, and a visible unresolved-reference error', () => {
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

    expect(markup.match(/<textarea/g)).toHaveLength(1)
    expect(markup).not.toContain('contenteditable')
    expect(markup).toContain('使用 @已删除图片')
    expect(markup).toContain('失效引用 @已删除图片')
  })

  it('opens a filtered listbox when @ is typed and inserts the chosen reference at the caret', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<Harness initialDocument={{ version: 1, segments: [{ type: 'text', text: '参考 ' }] }} />)
    })
    const textarea = renderer.root.findByProps({ 'aria-label': '图片描述' })

    act(() => textarea.props.onChange({
      target: { value: '参考 @产', selectionStart: 5 }
    }))

    const options = renderer.root.findAllByProps({ role: 'option' })
    expect(options).toHaveLength(1)
    expect(options[0].props.children).toBeTruthy()

    act(() => options[0].props.onClick())
    expect(renderer.root.findByProps({ 'aria-label': '图片描述' }).props.value).toBe('参考 @产品图')
    expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0)
  })

  it('supports Arrow navigation, Enter selection, and Escape dismissal', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<Harness initialDocument={{ version: 1, segments: [{ type: 'text', text: '' }] }} />)
    })
    let textarea = renderer.root.findByProps({ 'aria-label': '图片描述' })
    act(() => textarea.props.onChange({ target: { value: '@', selectionStart: 1 } }))
    textarea = renderer.root.findByProps({ 'aria-label': '图片描述' })

    act(() => textarea.props.onKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() }))
    act(() => textarea.props.onKeyDown({ key: 'Enter', preventDefault: vi.fn() }))
    expect(renderer.root.findByProps({ 'aria-label': '图片描述' }).props.value).toBe('@风格图')

    textarea = renderer.root.findByProps({ 'aria-label': '图片描述' })
    act(() => textarea.props.onChange({ target: { value: '@风格图 @', selectionStart: 7 } }))
    textarea = renderer.root.findByProps({ 'aria-label': '图片描述' })
    act(() => textarea.props.onKeyDown({ key: 'Escape', preventDefault: vi.fn() }))
    expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0)
  })

  it('does not open the mention picker during IME composition', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<Harness initialDocument={{ version: 1, segments: [{ type: 'text', text: '' }] }} />)
    })
    const textarea = renderer.root.findByProps({ 'aria-label': '图片描述' })

    act(() => textarea.props.onCompositionStart({}))
    act(() => textarea.props.onChange({ target: { value: '@', selectionStart: 1 } }))

    expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0)
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
    const textarea = renderer.root.findByProps({ 'aria-label': '图片描述' })
    act(() => textarea.props.onChange({ target: { value: '@a', selectionStart: 2 } }))

    expect(renderer.root.findByProps({ role: 'listbox' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '注入已选节点' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '上传图片' })).toBeTruthy()
  })
})
