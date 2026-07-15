import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
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

const referenceSource = {
  referenceId: 'reference-alternate',
  label: 'Alternate reference',
  role: 'reference-image' as const,
  assetId: 'asset-alternate',
  imageUrl: '/assets/alternate'
}

const mountEditor = (element: ReactElement): ReactTestRenderer => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(element, {
      createNodeMock: candidate => candidate.type === 'img'
        ? { naturalWidth: 1_000, naturalHeight: 1_000 }
        : {
            clientWidth: 1_000,
            clientHeight: 1_000,
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 1_000, height: 1_000 })
          }
    })
  })
  return renderer
}

const pointerEvent = (x: number, y: number) => ({
  clientX: x,
  clientY: y,
  currentTarget: {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1_000, height: 1_000 })
  }
})

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

  it('mounts the editor and closes the pointer, stale-source, rebind, delete, history, and save loop', () => {
    const onSave = vi.fn()
    const renderer = mountEditor(
      <RegionEditorDialog
        scopeKey="generator-one"
        mode="region-edit"
        capabilities={capabilities}
        sources={[source, referenceSource]}
        initialRegions={[]}
        onSave={onSave}
      />
    )
    const root = renderer.root
    const viewport = root.find(node => typeof node.props.onPointerDown === 'function' && typeof node.props.onPointerUp === 'function')

    act(() => viewport.props.onPointerDown(pointerEvent(250, 750)))
    act(() => root.findByProps({ 'aria-label': 'Select box tool' }).props.onClick())
    act(() => viewport.props.onPointerDown(pointerEvent(900, 800)))
    act(() => viewport.props.onPointerUp(pointerEvent(200, 100)))

    act(() => root.findByProps({ 'aria-label': 'Region image' }).props.onChange({ target: { value: referenceSource.referenceId } }))
    expect(root.findByProps({ 'data-save-regions': true }).props.disabled).toBe(true)

    act(() => root.findByProps({ children: 'Rebind to current image' }).props.onClick())
    act(() => root.findByProps({ 'aria-label': 'Select point region' }).props.onClick())
    act(() => root.findByProps({ 'aria-label': 'Delete region' }).props.onClick())
    expect(root.findByProps({ 'data-save-regions': true }).props.disabled).toBe(false)

    act(() => root.findByProps({ 'aria-label': 'Undo region change' }).props.onClick())
    expect(root.findByProps({ 'data-save-regions': true }).props.disabled).toBe(true)
    act(() => root.findByProps({ 'aria-label': 'Redo region change' }).props.onClick())
    act(() => root.findByProps({ 'data-save-regions': true }).props.onClick())

    expect(onSave).toHaveBeenCalledWith([{
      id: expect.stringMatching(/^region-/),
      referenceId: referenceSource.referenceId,
      type: 'bbox',
      x: 200,
      y: 100,
      width: 699,
      height: 699
    }])
  })

  it('keeps cleanup controls mounted after source-image disconnect so stale regions can be rebound or deleted', () => {
    const onSave = vi.fn()
    const renderer = mountEditor(
      <RegionEditorDialog
        scopeKey="generator-disconnected"
        mode="region-edit"
        capabilities={capabilities}
        sources={[referenceSource]}
        initialRegions={[region]}
        onSave={onSave}
      />
    )
    const root = renderer.root

    expect(root.findAllByProps({ role: 'alert' }).some(alert => (
      alert.children.join('').includes('Source image required')
    ))).toBe(true)
    act(() => root.findByProps({ children: 'Rebind to current image' }).props.onClick())
    expect(root.findByProps({ 'data-save-regions': true }).props.disabled).toBe(false)
    act(() => root.findByProps({ 'aria-label': 'Delete region' }).props.onClick())
    act(() => root.findByProps({ 'data-save-regions': true }).props.onClick())

    expect(onSave).toHaveBeenCalledWith([])
  })

  it('resets history and active source when two generators at the same position are swapped', () => {
    const onSave = vi.fn()
    const renderer = mountEditor(
      <RegionEditorDialog
        scopeKey="generator-one"
        mode="region-edit"
        capabilities={capabilities}
        sources={[source]}
        initialRegions={[{ ...region, x: 100, y: 100 }]}
        onSave={onSave}
      />
    )

    act(() => renderer.root.findByProps({ 'aria-label': 'Move region right' }).props.onClick())
    expect(renderer.root.findByProps({ 'aria-label': 'Undo region change' }).props.disabled).toBe(false)

    act(() => renderer.update(
      <RegionEditorDialog
        scopeKey="generator-two"
        mode="region-edit"
        capabilities={capabilities}
        sources={[referenceSource]}
        initialRegions={[{ ...region, id: 'region-two', referenceId: referenceSource.referenceId, x: 100, y: 100 }]}
        onSave={onSave}
      />
    ))

    expect(renderer.root.findByProps({ 'aria-label': 'Region image' }).props.value).toBe(referenceSource.referenceId)
    expect(renderer.root.findByProps({ 'aria-label': 'Undo region change' }).props.disabled).toBe(true)
    act(() => renderer.root.findByProps({ 'data-save-regions': true }).props.onClick())
    expect(onSave).toHaveBeenLastCalledWith([{
      ...region,
      id: 'region-two',
      referenceId: referenceSource.referenceId,
      x: 100,
      y: 100
    }])
  })
})
