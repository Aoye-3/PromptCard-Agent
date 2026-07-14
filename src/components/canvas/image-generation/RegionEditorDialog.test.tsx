import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  RegionEditorDialog,
  RegionEditorDialogView
} from './RegionEditorDialog'
import type { BoundImageRegion, ImageRegionCapabilities } from '@/domain/image-generation/regions'

const capabilities: ImageRegionCapabilities = {
  modelId: 'doubao-seedream-5-0-pro-260628',
  regionInputs: ['point', 'bbox']
}

const source = {
  referenceId: 'reference-source',
  label: 'Source image',
  role: 'source-image' as const,
  assetId: 'asset-source',
  imageUrl: '/assets/source'
}

const region: BoundImageRegion = {
  id: 'region-point',
  referenceId: source.referenceId,
  type: 'point',
  x: 500,
  y: 500
}

const findElement = (
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean
): ReactElement<Record<string, unknown>> => {
  const visit = (candidate: ReactNode): ReactElement<Record<string, unknown>> | null => {
    if (!isValidElement(candidate)) return null
    const element = candidate as ReactElement<Record<string, unknown>>
    if (predicate(element)) return element
    for (const child of Children.toArray((element.props as { children?: ReactNode }).children)) {
      const match = visit(child)
      if (match) return match
    }
    return null
  }
  const match = visit(node)
  if (match) return match
  throw new Error('Expected element was not found')
}

describe('RegionEditorDialog', () => {
  it('requires a source image for edit mode', () => {
    const markup = renderToStaticMarkup(
      <RegionEditorDialog
        mode="edit"
        capabilities={capabilities}
        sources={[]}
        initialRegions={[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(markup).toContain('Source image required')
    expect(markup).not.toContain('Select point tool')
    expect(markup).not.toContain('Select box tool')
  })

  it('shows only Seedream point and bbox tools with history and delete controls', () => {
    const markup = renderToStaticMarkup(
      <RegionEditorDialog
        mode="region-edit"
        capabilities={capabilities}
        sources={[source]}
        initialRegions={[region]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(markup).toContain('Select point tool')
    expect(markup).toContain('Select box tool')
    expect(markup).toContain('Undo region change')
    expect(markup).toContain('Redo region change')
    expect(markup).toContain('Delete region')
    expect(markup).not.toContain('Mask')
    expect(markup).not.toContain('Brush')
  })

  it('wires tool selection, deletion, and save through real view event handlers', () => {
    const onSelectTool = vi.fn()
    const onDeleteRegion = vi.fn()
    const onSave = vi.fn()
    const tree = RegionEditorDialogView({
      mode: 'region-edit',
      capabilities,
      sources: [source],
      activeSourceReferenceId: source.referenceId,
      activeTool: 'point',
      regions: [region],
      selectedRegionId: region.id,
      canUndo: true,
      canRedo: false,
      validationErrors: [],
      onSelectSource: vi.fn(),
      onSelectTool,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onDeleteRegion,
      onMoveRegion: vi.fn(),
      onRebindRegion: vi.fn(),
      onSelectRegion: vi.fn(),
      onImagePointerDown: vi.fn(),
      onImagePointerUp: vi.fn(),
      onSave,
      onClose: vi.fn()
    })

    ;(findElement(tree, element => element.props['aria-label'] === 'Select box tool').props.onClick as () => void)()
    ;(findElement(tree, element => element.props['aria-label'] === 'Delete region').props.onClick as () => void)()
    ;(findElement(tree, element => element.props['data-save-regions'] === true).props.onClick as () => void)()

    expect(onSelectTool).toHaveBeenCalledWith('bbox')
    expect(onDeleteRegion).toHaveBeenCalledWith(region.id)
    expect(onSave).toHaveBeenCalledWith([region])
  })

  it('disables save when a region reference is unresolved', () => {
    const markup = renderToStaticMarkup(
      <RegionEditorDialog
        mode="region-edit"
        capabilities={capabilities}
        sources={[source]}
        initialRegions={[{ ...region, referenceId: 'reference-disconnected' }]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(markup).toContain('Region image disconnected')
    expect(markup).toContain('data-save-regions="true" disabled=""')
  })
})
