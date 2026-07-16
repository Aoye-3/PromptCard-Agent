import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AnnotationEditorDialog } from './AnnotationEditorDialog'

const source = {
  assetId: 'asset-source',
  imageUrl: '/source.png',
  label: 'Source',
  width: 1000,
  height: 500
}

const mount = (onSave = vi.fn(), onClose = vi.fn()) => {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(
      <AnnotationEditorDialog
        source={source}
        initialDocument={{
          version: 1,
          sourceAssetId: source.assetId,
          width: source.width,
          height: source.height,
          annotations: []
        }}
        onSave={onSave}
        onClose={onClose}
      />,
      {
        createNodeMock: element => element.props['data-annotation-canvas']
          ? { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 500 }) }
          : { focus: vi.fn(), querySelectorAll: () => [] }
      }
    )
  })
  return { renderer, onSave, onClose }
}

describe('AnnotationEditorDialog', () => {
  it('exposes every Seedream raster markup tool and explains that it is not a mask', () => {
    const markup = renderToStaticMarkup(
      <AnnotationEditorDialog
        source={source}
        initialDocument={{
          version: 1,
          sourceAssetId: source.assetId,
          width: source.width,
          height: source.height,
          annotations: []
        }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(markup).toContain('自由画笔')
    expect(markup).toContain('箭头')
    expect(markup).toContain('矩形')
    expect(markup).toContain('椭圆')
    expect(markup).toContain('文字')
    expect(markup).toContain('不是原生蒙版')
  })

  it('creates a normalized rectangle, supports undo/redo and saves a non-destructive document', () => {
    const { renderer, onSave } = mount()
    const root = renderer.root
    const canvas = root.findByProps({ 'data-annotation-canvas': true })

    act(() => root.findByProps({ 'aria-label': '选择矩形工具' }).props.onClick())
    act(() => canvas.props.onPointerDown({ clientX: 100, clientY: 100, currentTarget: canvas.instance }))
    act(() => canvas.props.onPointerUp({ clientX: 400, clientY: 300, currentTarget: canvas.instance }))
    act(() => root.findByProps({ 'aria-label': '撤销标注' }).props.onClick())
    act(() => root.findByProps({ 'aria-label': '重做标注' }).props.onClick())
    act(() => root.findByProps({ 'aria-label': '保存视觉标记' }).props.onClick())

    expect(onSave).toHaveBeenCalledWith({
      version: 1,
      sourceAssetId: source.assetId,
      width: source.width,
      height: source.height,
      annotations: [{
        id: expect.stringMatching(/^annotation-/),
        kind: 'rect',
        color: '#ef4444',
        strokeWidth: 6,
        x: 100,
        y: 200,
        width: 300,
        height: 399
      }]
    })
  })

  it('provides bounded zoom controls without changing annotation coordinates', () => {
    const { renderer } = mount()
    const root = renderer.root
    act(() => root.findByProps({ 'aria-label': '放大标注画布' }).props.onClick())
    expect(root.findByProps({ 'data-annotation-zoom': true }).children.join('')).toBe('125%')
    act(() => root.findByProps({ 'aria-label': '适应标注画布' }).props.onClick())
    expect(root.findByProps({ 'data-annotation-zoom': true }).children.join('')).toBe('100%')
  })

  it('deletes an individual annotation and closes on Escape', () => {
    const { renderer, onSave, onClose } = mount()
    const root = renderer.root
    const canvas = root.findByProps({ 'data-annotation-canvas': true })

    act(() => root.findByProps({ 'aria-label': '选择箭头工具' }).props.onClick())
    act(() => canvas.props.onPointerDown({ clientX: 100, clientY: 100, currentTarget: canvas.instance }))
    act(() => canvas.props.onPointerUp({ clientX: 400, clientY: 300, currentTarget: canvas.instance }))
    act(() => root.findByProps({ 'aria-label': '删除标注 1' }).props.onClick())
    act(() => root.findByProps({ role: 'dialog' }).props.onKeyDown({ key: 'Escape' }))
    act(() => root.findByProps({ 'aria-label': '保存视觉标记' }).props.onClick())

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ annotations: [] }))
  })
})
