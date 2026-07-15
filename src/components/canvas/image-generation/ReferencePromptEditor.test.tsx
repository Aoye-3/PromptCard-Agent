import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PromptDocument } from '@/models/PromptHistory.model'
import {
  ReferencePromptEditor,
  insertPromptReferenceAtTextCursor,
  insertPromptReference,
  replacePromptTextSegment
} from './ReferencePromptEditor'

const references = [
  {
    edgeId: 'edge-product',
    nodeId: 'image-product',
    referenceId: 'ref-product',
    label: 'Product',
    role: 'reference-image' as const,
    assetId: 'asset-product',
    order: 0
  },
  {
    edgeId: 'edge-style',
    nodeId: 'image-style',
    referenceId: 'ref-style',
    label: 'Style',
    role: 'reference-image' as const,
    assetId: 'asset-style',
    order: 1
  }
]

describe('ReferencePromptEditor', () => {
  it('renders a controlled structured editor and marks unresolved tokens without storing DOM HTML', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [
        { type: 'text', text: 'Keep ' },
        { type: 'reference', referenceId: 'ref-product', label: 'Old product label' },
        { type: 'reference', referenceId: 'ref-missing', label: 'Missing image' }
      ]
    }

    const markup = renderToStaticMarkup(
      <ReferencePromptEditor
        document={document}
        references={references}
        unresolvedReferenceIds={['ref-missing']}
        onChange={vi.fn()}
      />
    )

    expect(markup).toContain('<textarea')
    expect(markup).not.toContain('contenteditable')
    expect(markup).toContain('data-reference-id="ref-product"')
    expect(markup).toContain('Product')
    expect(markup).toContain('data-reference-id="ref-missing"')
    expect(markup).toContain('data-unresolved="true"')
    expect(markup).toContain('Missing image')
    expect(markup).toContain('Style')
  })

  it('inserts an @ choice as a reference segment with stable identity rather than HTML', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [{ type: 'text', text: 'Use ' }]
    }

    expect(insertPromptReference(document, references[0])).toEqual({
      version: 1,
      segments: [
        { type: 'text', text: 'Use ' },
        { type: 'reference', referenceId: 'ref-product', label: 'Product' }
      ]
    })
  })

  it('updates text through PromptDocument segments only', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [
        { type: 'text', text: 'Old text' },
        { type: 'reference', referenceId: 'ref-product', label: 'Product' }
      ]
    }

    expect(replacePromptTextSegment(document, 0, '<b>Literal text</b>')).toEqual({
      version: 1,
      segments: [
        { type: 'text', text: '<b>Literal text</b>' },
        { type: 'reference', referenceId: 'ref-product', label: 'Product' }
      ]
    })
  })

  it('inserts an @ choice at the text cursor and preserves stable reference identity', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [{ type: 'text', text: 'Put @ here' }]
    }

    expect(insertPromptReferenceAtTextCursor(document, 0, 5, references[0])).toEqual({
      version: 1,
      segments: [
        { type: 'text', text: 'Put ' },
        { type: 'reference', referenceId: 'ref-product', label: 'Product' },
        { type: 'text', text: ' here' }
      ]
    })
  })

  it('renders an ordered reference list with usage, capacity, and keyboard alternatives', () => {
    const markup = renderToStaticMarkup(
      <ReferencePromptEditor
        document={{ version: 1, segments: [{ type: 'reference', referenceId: 'ref-style', label: 'Style' }] }}
        references={references}
        maxReferences={10}
        onMoveReference={vi.fn()}
        onRemoveReference={vi.fn()}
        onChange={vi.fn()}
      />
    )

    expect(markup).toContain('参考图 2/10')
    expect(markup).toContain('图1')
    expect(markup).toContain('图2')
    expect(markup).toContain('已在提示词中使用')
    expect(markup).toContain('aria-label="上移 Product"')
    expect(markup).toContain('aria-label="下移 Product"')
    expect(markup).toContain('aria-label="删除 Style"')
  })
})
