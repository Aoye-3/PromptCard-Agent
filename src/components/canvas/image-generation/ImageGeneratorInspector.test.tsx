import { Children, isValidElement, useState, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type {
  IFreeCanvasImageGeneratorNode,
  IFreeCanvasImageNode,
  IFreeCanvasProject,
  IFreeCanvasTextNode
} from '@/models/PromptHistory.model'
import { applyImageGeneratorConnection } from '../nodes/ImageGeneratorNode'
import {
  SEEDREAM_5_PRO_SIZE_CAPABILITIES,
  type ImageSizeCapabilities
} from '@/domain/image-generation/size-validation'
import {
  SEEDREAM_5_PRO_REGION_CAPABILITIES,
  type BoundImageRegion,
  type ImageRegionSource
} from '@/domain/image-generation/regions'
import { ImageGeneratorInspector } from './ImageGeneratorInspector'
import { RegionEditorDialog } from './RegionEditorDialog'
import type { ImageGeneratorPromptSnapshot, PromptCompilerValidationErrorCode } from '@/domain/image-generation/prompt-compiler'

const ONE_K_SQUARE_CAPABILITIES: ImageSizeCapabilities = {
  modelId: 'model-one-k-square',
  resolutions: ['1K'],
  aspectRatios: ['1:1', 'custom'],
  customSize: {
    minPixels: 921_600,
    maxPixels: 4_624_220,
    minAspectRatio: 1 / 16,
    maxAspectRatio: 16
  }
}

const REGION_SOURCE: ImageRegionSource = {
  referenceId: 'reference-source',
  label: 'Source image',
  role: 'source-image',
  assetId: 'asset-source',
  imageUrl: '/assets/source'
}

const findElement = (
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean
): ReactElement<Record<string, unknown>> => {
  const visit = (candidate: ReactNode): ReactElement<Record<string, unknown>> | null => {
    if (!isValidElement(candidate)) return null
    const element = candidate as ReactElement<Record<string, unknown>>
    if (predicate(element)) return element
    const props = element.props as { children?: ReactNode }
    for (const child of Children.toArray(props.children)) {
      const match = visit(child)
      if (match) return match
    }
    return null
  }
  const match = visit(node)
  if (match) return match
  throw new Error('Expected element was not found')
}

const generatorNode: IFreeCanvasImageGeneratorNode = {
  id: 'generator-1',
  kind: 'image-generator',
  title: 'Product render',
  position: { x: 120, y: 240 },
  width: 420,
  height: 560,
  mode: 'generate',
  binding: {
    connectionId: 'ark-primary',
    modelId: 'doubao-seedream-5-0-pro-260628'
  },
  settings: {
    resolution: '2K',
    aspectRatio: '16:9',
    outputFormat: 'png',
    watermark: false
  },
  promptDocument: { version: 1, segments: [] },
  regions: [],
  primaryAssetId: 'asset-result-1',
  meta: {}
}

const textNode = (id: string): IFreeCanvasTextNode => ({
  id,
  kind: 'text',
  title: 'Prompt',
  position: { x: 0, y: 0 },
  width: 420,
  height: 180,
  fontSize: 'large',
  segments: [],
  meta: {}
})

const imageNode = (id: string): IFreeCanvasImageNode => ({
  id,
  kind: 'image',
  title: 'Reference',
  position: { x: 0, y: 0 },
  width: 300,
  height: 220,
  annotations: [],
  meta: {}
})

const projectWith = (
  nodes: IFreeCanvasProject['nodes'],
  edges: IFreeCanvasProject['edges'] = []
): IFreeCanvasProject => ({
  nodes,
  edges,
  viewport: null,
  selectedNodeId: generatorNode.id,
  meta: {}
})

const promptSnapshot = (
  canGenerate: boolean,
  errorCode?: PromptCompilerValidationErrorCode
): ImageGeneratorPromptSnapshot => ({
  source: 'local',
  promptDocument: { version: 1, segments: [{ type: 'text', text: 'Product render' }] },
  prompt: 'Product render',
  references: [],
  inputAssets: [],
  validationErrors: errorCode ? [{ code: errorCode }] : [],
  canGenerate
})

const mountInspector = (element: ReactElement): ReactTestRenderer => {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(element)
  })
  return renderer
}

describe('ImageGeneratorInspector', () => {
  it('renders provider-neutral binding and generation controls', () => {
    const markup = renderToStaticMarkup(
      <ImageGeneratorInspector
        node={generatorNode}
        sizeCapabilities={SEEDREAM_5_PRO_SIZE_CAPABILITIES}
        status="Completed"
        resultThumbnailUrl="/result.png"
        onChange={vi.fn()}
        onOpenHistory={vi.fn()}
      />
    )

    expect(markup).toContain('ark-primary')
    expect(markup).toContain('doubao-seedream-5-0-pro-260628')
    expect(markup).toContain('Generation mode')
    expect(markup).toContain('Resolution')
    expect(markup).toContain('Aspect ratio')
    expect(markup).toContain('Completed')
    expect(markup).toContain('/result.png')
    expect(markup).toContain('History')
  })

  it('mounts the structured prompt editor with connected references and unresolved validation', () => {
    const markup = renderToStaticMarkup(
      <ImageGeneratorInspector
        node={{
          ...generatorNode,
          promptDocument: {
            version: 1,
            segments: [{ type: 'reference', referenceId: 'ref-missing', label: 'Missing' }]
          }
        }}
        sizeCapabilities={SEEDREAM_5_PRO_SIZE_CAPABILITIES}
        promptSnapshot={{
          source: 'local',
          promptDocument: {
            version: 1,
            segments: [{ type: 'reference', referenceId: 'ref-missing', label: 'Missing' }]
          },
          prompt: '@Missing',
          references: [{
            edgeId: 'edge-product',
            nodeId: 'image-product',
            referenceId: 'ref-product',
            label: 'Product',
            role: 'reference-image',
            assetId: 'asset-product',
            order: 0
          }],
          inputAssets: [{
            referenceId: 'ref-product',
            role: 'reference-image',
            assetId: 'asset-product',
            order: 0
          }],
          validationErrors: [{ code: 'unresolved_reference', referenceId: 'ref-missing' }],
          canGenerate: false
        }}
        onChange={vi.fn()}
        onPromptDocumentChange={vi.fn()}
      />
    )

    expect(markup).toContain('data-reference-prompt-editor')
    expect(markup).toContain('Product')
    expect(markup).toContain('data-unresolved="true"')
    expect(markup).toContain('Resolve or remove disconnected image references')
  })

  it('renders resolution and ratio options from the selected model capabilities', () => {
    const markup = renderToStaticMarkup(
      <ImageGeneratorInspector
        node={{
          ...generatorNode,
          binding: { ...generatorNode.binding, modelId: ONE_K_SQUARE_CAPABILITIES.modelId },
          settings: { ...generatorNode.settings, resolution: '1K', aspectRatio: '1:1' }
        }}
        sizeCapabilities={ONE_K_SQUARE_CAPABILITIES}
        onChange={vi.fn()}
      />
    )

    expect(markup).toContain('<option value="1K" selected="">1K</option>')
    expect(markup).not.toContain('<option value="2K"')
    expect(markup).not.toContain('<option value="4K"')
    expect(markup).toContain('<option value="1:1" selected="">1:1</option>')
    expect(markup).toContain('<option value="custom">custom</option>')
    expect(markup).not.toContain('<option value="16:9"')
  })

  it('requires explicit confirmation when a model switch invalidates persisted settings', () => {
    const onChange = vi.fn()
    const invalidNode = {
      ...generatorNode,
      binding: { ...generatorNode.binding, modelId: ONE_K_SQUARE_CAPABILITIES.modelId }
    }
    const markup = renderToStaticMarkup(
      <ImageGeneratorInspector
        node={invalidNode}
        sizeCapabilities={ONE_K_SQUARE_CAPABILITIES}
        onChange={onChange}
      />
    )

    expect(onChange).not.toHaveBeenCalled()
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('These size settings are not supported by model-one-k-square')
    expect(markup).toContain('Use 1K · 1:1')

    const tree = ImageGeneratorInspector({
      node: invalidNode,
      sizeCapabilities: ONE_K_SQUARE_CAPABILITIES,
      onChange
    })
    const confirmButton = findElement(tree, element => element.props['data-confirm-image-size'] === true)
    const onClick = confirmButton.props.onClick as () => void
    onClick()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      settings: {
        ...invalidNode.settings,
        resolution: '1K',
        aspectRatio: '1:1',
        width: undefined,
        height: undefined
      }
    })
  })

  it('does not persist a forged unsupported resolution interaction', () => {
    const onChange = vi.fn()
    const tree = ImageGeneratorInspector({
      node: {
        ...generatorNode,
        binding: { ...generatorNode.binding, modelId: ONE_K_SQUARE_CAPABILITIES.modelId },
        settings: { ...generatorNode.settings, resolution: '1K', aspectRatio: '1:1' }
      },
      sizeCapabilities: ONE_K_SQUARE_CAPABILITIES,
      onChange
    })
    const resolutionSelect = findElement(tree, element => element.props['aria-label'] === 'Resolution')
    const onResolutionChange = resolutionSelect.props.onChange as (event: { target: { value: string } }) => void

    onResolutionChange({ target: { value: '4K' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('persists an invalid custom dimension draft so validation can be shown', () => {
    const onChange = vi.fn()
    const tree = ImageGeneratorInspector({
      node: {
        ...generatorNode,
        binding: { ...generatorNode.binding, modelId: ONE_K_SQUARE_CAPABILITIES.modelId },
        settings: {
          ...generatorNode.settings,
          resolution: '1K',
          aspectRatio: 'custom',
          width: 1_200,
          height: 768
        }
      },
      sizeCapabilities: ONE_K_SQUARE_CAPABILITIES,
      onChange
    })
    const widthInput = findElement(tree, element => element.props['aria-label'] === 'Custom width')
    const onWidthChange = widthInput.props.onChange as (event: { target: { value: string } }) => void

    onWidthChange({ target: { value: '1199' } })

    expect(onChange).toHaveBeenCalledWith({
      settings: {
        ...generatorNode.settings,
        resolution: '1K',
        aspectRatio: 'custom',
        width: 1_199,
        height: 768
      }
    })
  })

  it('mounts the custom size draft and enables generation only after both dimensions are valid', () => {
    const onGenerate = vi.fn()
    const onChange = vi.fn()
    const initialNode: IFreeCanvasImageGeneratorNode = {
      ...generatorNode,
      binding: { ...generatorNode.binding, modelId: ONE_K_SQUARE_CAPABILITIES.modelId },
      settings: { ...generatorNode.settings, resolution: '1K', aspectRatio: '1:1' }
    }
    const Host = () => {
      const [node, setNode] = useState(initialNode)
      return (
        <ImageGeneratorInspector
          node={node}
          sizeCapabilities={ONE_K_SQUARE_CAPABILITIES}
          promptSnapshot={promptSnapshot(true)}
          onChange={updates => {
            onChange(updates)
            setNode(current => ({ ...current, ...updates }))
          }}
          onGenerate={onGenerate}
        />
      )
    }
    const renderer = mountInspector(<Host />)
    const aspectRatio = () => renderer.root.findByProps({ 'aria-label': 'Aspect ratio' })
    const generate = () => renderer.root.findByProps({ 'aria-label': 'Generate image' })

    act(() => aspectRatio().props.onChange({ target: { value: 'custom' } }))
    expect(aspectRatio().props.value).toBe('custom')
    expect(generate().props.disabled).toBe(true)
    act(() => generate().props.onClick())
    expect(onGenerate).not.toHaveBeenCalled()

    act(() => renderer.root.findByProps({ 'aria-label': 'Custom width' }).props.onChange({ target: { value: '1200' } }))
    expect(generate().props.disabled).toBe(true)
    act(() => renderer.root.findByProps({ 'aria-label': 'Custom height' }).props.onChange({ target: { value: '768' } }))
    expect(generate().props.disabled).toBe(false)

    act(() => generate().props.onClick())
    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('persists supported resolution and custom dimension interactions', () => {
    const onResolutionChange = vi.fn()
    const resolutionTree = ImageGeneratorInspector({
      node: {
        ...generatorNode,
        settings: { ...generatorNode.settings, resolution: '1K' }
      },
      sizeCapabilities: SEEDREAM_5_PRO_SIZE_CAPABILITIES,
      onChange: onResolutionChange
    })
    const resolutionSelect = findElement(resolutionTree, element => element.props['aria-label'] === 'Resolution')
    const changeResolution = resolutionSelect.props.onChange as (event: { target: { value: string } }) => void

    changeResolution({ target: { value: '2K' } })

    expect(onResolutionChange).toHaveBeenCalledWith({
      settings: { ...generatorNode.settings, resolution: '2K' }
    })

    const onCustomChange = vi.fn()
    const customNode = {
      ...generatorNode,
      settings: {
        ...generatorNode.settings,
        resolution: '1K' as const,
        aspectRatio: 'custom' as const,
        width: 1_200,
        height: 768
      }
    }
    const customTree = ImageGeneratorInspector({
      node: customNode,
      sizeCapabilities: SEEDREAM_5_PRO_SIZE_CAPABILITIES,
      onChange: onCustomChange
    })
    const widthInput = findElement(customTree, element => element.props['aria-label'] === 'Custom width')
    const changeWidth = widthInput.props.onChange as (event: { target: { value: string } }) => void

    changeWidth({ target: { value: '1250' } })

    expect(onCustomChange).toHaveBeenCalledWith({
      settings: { ...customNode.settings, width: 1_250 }
    })
  })

  it('mounts Seedream point and bbox editing only for region-edit mode', () => {
    const markup = renderToStaticMarkup(
      <ImageGeneratorInspector
        node={{ ...generatorNode, mode: 'region-edit' }}
        sizeCapabilities={SEEDREAM_5_PRO_SIZE_CAPABILITIES}
        regionCapabilities={SEEDREAM_5_PRO_REGION_CAPABILITIES}
        regionSources={[REGION_SOURCE]}
        onChange={vi.fn()}
      />
    )

    expect(markup).toContain('data-region-editor-dialog')
    expect(markup).toContain('Select point tool')
    expect(markup).toContain('Select box tool')
    expect(markup).not.toContain('Mask')
    expect(markup).not.toContain('Brush')
  })

  it('persists region integer geometry and stable bindings without preview data', () => {
    const onChange = vi.fn()
    const node = { ...generatorNode, mode: 'region-edit' as const }
    const tree = ImageGeneratorInspector({
      node,
      sizeCapabilities: SEEDREAM_5_PRO_SIZE_CAPABILITIES,
      regionCapabilities: SEEDREAM_5_PRO_REGION_CAPABILITIES,
      regionSources: [REGION_SOURCE],
      onChange
    })
    const editor = findElement(tree, element => element.type === RegionEditorDialog)
    const onSave = editor.props.onSave as (regions: BoundImageRegion[]) => void

    onSave([{
      id: 'region-1',
      referenceId: REGION_SOURCE.referenceId,
      type: 'bbox',
      x: 100,
      y: 200,
      width: 300,
      height: 400
    }])

    expect(onChange).toHaveBeenCalledWith({
      regions: [{ type: 'bbox', x: 100, y: 200, width: 300, height: 400 }],
      meta: {
        imageRegionBindings: [{ regionId: 'region-1', referenceId: REGION_SOURCE.referenceId }]
      }
    })
    expect(JSON.stringify(onChange.mock.calls)).not.toContain('/assets/source')
  })

  it('shows the source requirement for edit mode without a connected source image', () => {
    const markup = renderToStaticMarkup(
      <ImageGeneratorInspector
        node={{ ...generatorNode, mode: 'edit' }}
        sizeCapabilities={SEEDREAM_5_PRO_SIZE_CAPABILITIES}
        regionCapabilities={SEEDREAM_5_PRO_REGION_CAPABILITIES}
        regionSources={[]}
        onChange={vi.fn()}
      />
    )

    expect(markup).toContain('Source image required')
  })

  it('exposes region validation as a blocked production generation snapshot', () => {
    const markup = renderToStaticMarkup(
      <ImageGeneratorInspector
        node={{ ...generatorNode, mode: 'region-edit' }}
        sizeCapabilities={SEEDREAM_5_PRO_SIZE_CAPABILITIES}
        promptSnapshot={{
          source: 'local',
          promptDocument: { version: 1, segments: [{ type: 'text', text: 'Edit product' }] },
          prompt: 'Edit product',
          references: [],
          inputAssets: [],
          validationErrors: [{
            code: 'stale_region_reference',
            regionId: 'region-stale',
            referenceId: 'ref-reference'
          }],
          canGenerate: false
        }}
        onChange={vi.fn()}
      />
    )

    expect(markup).toContain('data-image-generation-ready="false"')
    expect(markup).toContain('Resolve region bindings before generating')
  })

  it.each([
    'stale_region_reference',
    'unresolved_region_reference',
    'missing_source_image'
  ] as const)('does not invoke generation for a blocked %s snapshot even if its handler is fired', errorCode => {
    const onGenerate = vi.fn()
    const renderer = mountInspector(
      <ImageGeneratorInspector
        node={generatorNode}
        sizeCapabilities={SEEDREAM_5_PRO_SIZE_CAPABILITIES}
        promptSnapshot={promptSnapshot(false, errorCode)}
        onChange={vi.fn()}
        onGenerate={onGenerate}
      />
    )
    const button = renderer.root.findByProps({ 'aria-label': 'Generate image' })

    expect(button.props.disabled).toBe(true)
    act(() => button.props.onClick())
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('invokes generation once from a mounted generate-ready Inspector', () => {
    const onGenerate = vi.fn()
    const renderer = mountInspector(
      <ImageGeneratorInspector
        node={generatorNode}
        sizeCapabilities={SEEDREAM_5_PRO_SIZE_CAPABILITIES}
        promptSnapshot={promptSnapshot(true)}
        onChange={vi.fn()}
        onGenerate={onGenerate}
      />
    )
    const button = renderer.root.findByProps({ 'aria-label': 'Generate image' })

    expect(button.props.disabled).toBe(false)
    act(() => button.props.onClick())
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it.each(['validating', 'running'] as const)('blocks duplicate generation while the node is %s', status => {
    const onGenerate = vi.fn()
    const renderer = mountInspector(
      <ImageGeneratorInspector
        node={generatorNode}
        sizeCapabilities={SEEDREAM_5_PRO_SIZE_CAPABILITIES}
        promptSnapshot={promptSnapshot(true)}
        status={status}
        onChange={vi.fn()}
        onGenerate={onGenerate}
      />
    )
    const button = renderer.root.findByProps({ 'aria-label': 'Generate image' })

    expect(button.props.disabled).toBe(true)
    act(() => button.props.onClick())
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('offers retry after failure and invokes a new attempt', () => {
    const onGenerate = vi.fn()
    const renderer = mountInspector(
      <ImageGeneratorInspector
        node={generatorNode}
        sizeCapabilities={SEEDREAM_5_PRO_SIZE_CAPABILITIES}
        promptSnapshot={promptSnapshot(true)}
        status="failed"
        onChange={vi.fn()}
        onGenerate={onGenerate}
      />
    )
    const button = renderer.root.findByProps({ 'aria-label': 'Generate image' })

    expect(button.props.children).toBe('Retry')
    expect(button.props.disabled).toBe(false)
    act(() => button.props.onClick())
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('blocks the production action until both connection and model are configured', () => {
    const onGenerate = vi.fn()
    const renderer = mountInspector(
      <ImageGeneratorInspector
        node={{ ...generatorNode, binding: { connectionId: '', modelId: '' } }}
        sizeCapabilities={null}
        promptSnapshot={promptSnapshot(true)}
        onChange={vi.fn()}
        onGenerate={onGenerate}
      />
    )
    const button = renderer.root.findByProps({ 'aria-label': 'Generate image' })

    expect(button.props.disabled).toBe(true)
    act(() => button.props.onClick())
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('does not add an invalid second prompt connection to project state', () => {
    const project = projectWith(
      [generatorNode, textNode('prompt-1'), textNode('prompt-2')],
      [{
        id: 'prompt-edge-1',
        source: 'prompt-1',
        target: generatorNode.id,
        targetHandle: 'prompt',
        createdAt: 1
      }]
    )

    const updated = applyImageGeneratorConnection(project, {
      source: 'prompt-2',
      target: generatorNode.id,
      sourceHandle: null,
      targetHandle: 'prompt'
    }, 100)

    expect(updated).toBe(project)
    expect(updated.edges).toHaveLength(1)
  })

  it('adds a valid reference with deterministic referenceId and next inputOrder', () => {
    const project = projectWith(
      [generatorNode, imageNode('reference-1'), imageNode('reference-2')],
      [{
        id: 'reference-edge-1',
        source: 'reference-1',
        target: generatorNode.id,
        sourceHandle: 'image-output',
        targetHandle: 'reference-image',
        inputOrder: 0,
        referenceId: 'reference-existing',
        createdAt: 1
      }]
    )
    const connection = {
      source: 'reference-2',
      target: generatorNode.id,
      sourceHandle: 'image-output',
      targetHandle: 'reference-image'
    }

    const first = applyImageGeneratorConnection(project, connection, 100)
    const repeated = applyImageGeneratorConnection(project, connection, 100)

    expect(project.edges).toHaveLength(1)
    expect(first.edges[1]).toEqual({
      id: 'free-edge-reference-2-generator-1-reference-image-100',
      source: 'reference-2',
      target: generatorNode.id,
      sourceHandle: 'image-output',
      targetHandle: 'reference-image',
      inputOrder: 1,
      referenceId: 'reference-free-edge-reference-2-generator-1-reference-image-100',
      createdAt: 100
    })
    expect(repeated.edges[1]).toEqual(first.edges[1])
  })
})
