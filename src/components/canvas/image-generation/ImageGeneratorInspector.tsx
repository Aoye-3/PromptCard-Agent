import type {
  FreeCanvasImageAspectRatio,
  IFreeCanvasImageGeneratorNode,
  PromptDocument
} from '@/models/PromptHistory.model'
import type { ImageGeneratorPromptSnapshot } from '@/domain/image-generation/prompt-compiler'
import {
  recommendedImageSizeSettings,
  validateImageSizeSettings,
  type ImageSizeCapabilities,
  type ImageSizeSettings
} from '@/domain/image-generation/size-validation'
import {
  readImageRegionBindings,
  restoreBoundImageRegions,
  serializeBoundImageRegions,
  type ImageRegionCapabilities,
  type ImageRegionSource
} from '@/domain/image-generation/regions'
import { imageGeneratorResultUrl, imageGeneratorStatus } from '../nodes/ImageGeneratorNode'
import { ReferencePromptEditor } from './ReferencePromptEditor'
import { RegionEditorDialog } from './RegionEditorDialog'

export interface ImageGeneratorInspectorProps {
  node: IFreeCanvasImageGeneratorNode
  sizeCapabilities: ImageSizeCapabilities | null
  regionCapabilities?: ImageRegionCapabilities | null
  regionSources?: readonly ImageRegionSource[]
  status?: string
  resultThumbnailUrl?: string
  promptSnapshot?: ImageGeneratorPromptSnapshot
  onChange: (updates: Partial<Pick<IFreeCanvasImageGeneratorNode, 'mode' | 'settings' | 'regions' | 'meta'>>) => void
  onGenerate?: () => void
  onPromptDocumentChange?: (document: PromptDocument) => void
  onOpenHistory?: (nodeId: string) => void
}

export const ImageGeneratorInspector = ({
  node,
  sizeCapabilities,
  regionCapabilities = null,
  regionSources = [],
  status = imageGeneratorStatus(node),
  resultThumbnailUrl = imageGeneratorResultUrl(node),
  promptSnapshot,
  onChange,
  onGenerate,
  onPromptDocumentChange,
  onOpenHistory
}: ImageGeneratorInspectorProps) => {
  const activeSizeCapabilities = sizeCapabilities?.modelId === node.binding.modelId
    ? sizeCapabilities
    : null
  const sizeValidationErrors = activeSizeCapabilities
    ? validateImageSizeSettings(node.settings, activeSizeCapabilities)
    : []
  const recommendedSize = activeSizeCapabilities
    ? recommendedImageSizeSettings(activeSizeCapabilities)
    : null
  const boundRegions = restoreBoundImageRegions(
    node.regions,
    readImageRegionBindings(node.meta)
  )
  const hasRegionGenerationError = promptSnapshot?.validationErrors.some(error => (
    error.code === 'unresolved_region_reference'
    || error.code === 'stale_region_reference'
    || error.code === 'invalid_region_geometry'
  )) || false
  const generationBusy = status === 'validating' || status === 'running'
  const generationConfigured = Boolean(node.binding.connectionId && node.binding.modelId)

  const updateSettings = (updates: Partial<IFreeCanvasImageGeneratorNode['settings']>) => {
    onChange({ settings: { ...node.settings, ...updates } })
  }

  const updateSizeSettings = (updates: Partial<ImageSizeSettings>) => {
    if (!activeSizeCapabilities) return
    const settings = { ...node.settings, ...updates }
    if (validateImageSizeSettings(settings, activeSizeCapabilities).length > 0) return
    updateSettings(updates as Partial<IFreeCanvasImageGeneratorNode['settings']>)
  }

  const updateCustomDimension = (dimension: 'width' | 'height', value: string) => {
    const parsed = value === '' ? undefined : Number(value)
    updateSizeSettings({ [dimension]: parsed })
  }

  const handleGenerate = () => {
    if (!onGenerate || !promptSnapshot?.canGenerate || generationBusy || !generationConfigured) return
    onGenerate()
  }

  return (
    <section
      data-image-generator-inspector
      data-image-generation-ready={promptSnapshot ? promptSnapshot.canGenerate : undefined}
      className="space-y-4 p-4"
    >
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Image generation</p>
          <p className="mt-1 break-all text-xs font-bold text-gray-950">{node.binding.modelId || 'Model not configured'}</p>
          <p className="mt-1 truncate text-[11px] font-semibold text-gray-500">{node.binding.connectionId || 'Connection not configured'}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-700">{status}</span>
      </div>

      {promptSnapshot && onPromptDocumentChange && (
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-black text-gray-950">Prompt</h3>
            <span className="text-[10px] font-semibold text-gray-400">
              {promptSnapshot.source === 'connected' ? 'Connected snapshot' : 'Local'}
            </span>
          </div>
          <ReferencePromptEditor
            document={promptSnapshot.promptDocument}
            references={promptSnapshot.references}
            unresolvedReferenceIds={promptSnapshot.validationErrors.flatMap(error => (
              error.code === 'unresolved_reference' && error.referenceId ? [error.referenceId] : []
            ))}
            onChange={onPromptDocumentChange}
          />
        </div>
      )}

      {resultThumbnailUrl && (
        <img
          src={resultThumbnailUrl}
          alt={`${node.title} result`}
          className="h-28 w-full rounded-[6px] border border-gray-200 object-cover"
        />
      )}

      {hasRegionGenerationError && (
        <div role="alert" className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-900">
          Resolve region bindings before generating. Rebind or remove disconnected regions in the editor.
        </div>
      )}

      {!activeSizeCapabilities && (
        <div role="alert" className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Size capabilities are unavailable for {node.binding.modelId || 'the selected model'}. Choose a configured image model before changing size.
        </div>
      )}

      {activeSizeCapabilities && sizeValidationErrors.length > 0 && recommendedSize && (
        <div role="alert" className="space-y-2 rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p className="font-bold">These size settings are not supported by {activeSizeCapabilities.modelId}.</p>
          <p className="font-semibold">Confirm a supported default before generating; the current settings were not changed.</p>
          <button
            type="button"
            data-confirm-image-size
            className="rounded-[6px] border border-amber-300 bg-white px-2 py-1.5 font-bold hover:bg-amber-100"
            onClick={() => updateSettings({
              resolution: recommendedSize.resolution as IFreeCanvasImageGeneratorNode['settings']['resolution'],
              aspectRatio: recommendedSize.aspectRatio as FreeCanvasImageAspectRatio,
              width: undefined,
              height: undefined
            })}
          >
            Use {recommendedSize.resolution} · {recommendedSize.aspectRatio}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-bold text-gray-700">
          <span className="mb-1 block">Generation mode</span>
          <select
            className="nodrag w-full rounded-[6px] border border-gray-200 bg-white px-2 py-2 text-xs"
            value={node.mode}
            onChange={event => onChange({ mode: event.target.value as IFreeCanvasImageGeneratorNode['mode'] })}
          >
            <option value="generate">Generate</option>
            <option value="edit">Edit</option>
            <option value="region-edit">Region edit</option>
          </select>
        </label>

        <label className="text-xs font-bold text-gray-700">
          <span className="mb-1 block">Resolution</span>
          <select
            aria-label="Resolution"
            className="nodrag w-full rounded-[6px] border border-gray-200 bg-white px-2 py-2 text-xs"
            value={node.settings.resolution}
            disabled={!activeSizeCapabilities}
            onChange={event => updateSizeSettings({ resolution: event.target.value })}
          >
            {activeSizeCapabilities?.resolutions.map(resolution => (
              <option key={resolution} value={resolution}>{resolution}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-bold text-gray-700">
          <span className="mb-1 block">Aspect ratio</span>
          <select
            aria-label="Aspect ratio"
            className="nodrag w-full rounded-[6px] border border-gray-200 bg-white px-2 py-2 text-xs"
            value={node.settings.aspectRatio}
            disabled={!activeSizeCapabilities}
            onChange={event => updateSizeSettings({
              aspectRatio: event.target.value,
              ...(event.target.value === 'custom' ? {} : { width: undefined, height: undefined })
            })}
          >
            {activeSizeCapabilities?.aspectRatios.map(aspectRatio => (
              <option key={aspectRatio} value={aspectRatio}>{aspectRatio}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-bold text-gray-700">
          <span className="mb-1 block">Output format</span>
          <select
            className="nodrag w-full rounded-[6px] border border-gray-200 bg-white px-2 py-2 text-xs"
            value={node.settings.outputFormat}
            onChange={event => updateSettings({ outputFormat: event.target.value as 'png' | 'jpeg' })}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </label>
      </div>

      {activeSizeCapabilities?.aspectRatios.includes('custom') && activeSizeCapabilities.customSize && (
        <fieldset className="space-y-2 rounded-[6px] border border-gray-200 p-3">
          <legend className="px-1 text-xs font-black text-gray-700">Custom dimensions</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-gray-700">
              <span className="mb-1 block">Width</span>
              <input
                aria-label="Custom width"
                className="nodrag w-full rounded-[6px] border border-gray-200 bg-white px-2 py-2 text-xs"
                type="number"
                min="1"
                step="1"
                value={node.settings.width ?? ''}
                onChange={event => updateCustomDimension('width', event.target.value)}
              />
            </label>
            <label className="text-xs font-bold text-gray-700">
              <span className="mb-1 block">Height</span>
              <input
                aria-label="Custom height"
                className="nodrag w-full rounded-[6px] border border-gray-200 bg-white px-2 py-2 text-xs"
                type="number"
                min="1"
                step="1"
                value={node.settings.height ?? ''}
                onChange={event => updateCustomDimension('height', event.target.value)}
              />
            </label>
          </div>
          <p className="text-[10px] font-semibold text-gray-500">
            {activeSizeCapabilities.customSize.minPixels.toLocaleString()}–{activeSizeCapabilities.customSize.maxPixels.toLocaleString()} total pixels; width/height ratio {activeSizeCapabilities.customSize.minAspectRatio}–{activeSizeCapabilities.customSize.maxAspectRatio}.
          </p>
        </fieldset>
      )}

      {node.mode !== 'generate' && !regionCapabilities && (
        <div role="alert" className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
          Region capabilities are unavailable for this model.
        </div>
      )}

      {node.mode !== 'generate' && regionCapabilities && (
        <details className="rounded-[6px] border border-gray-200">
          <summary className="cursor-pointer px-3 py-2 text-xs font-black text-gray-800">Edit image regions</summary>
          <RegionEditorDialog
            scopeKey={node.id}
            mode={node.mode}
            capabilities={regionCapabilities}
            sources={regionSources}
            initialRegions={boundRegions}
            onSave={regions => {
              const serialized = serializeBoundImageRegions(regions)
              onChange({
                regions: serialized.regions,
                meta: { ...node.meta, imageRegionBindings: serialized.bindings }
              })
            }}
          />
        </details>
      )}

      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <label className="flex items-center gap-2 text-xs font-bold text-gray-700">
          <input
            className="nodrag h-4 w-4"
            type="checkbox"
            checked={node.settings.watermark}
            onChange={event => updateSettings({ watermark: event.target.checked })}
          />
          Watermark
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Generate image"
            className="rounded-[6px] bg-gray-950 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            disabled={!onGenerate || !promptSnapshot?.canGenerate || generationBusy || !generationConfigured}
            onClick={handleGenerate}
          >
            {status === 'failed' ? 'Retry' : 'Generate'}
          </button>
          <button
            type="button"
            className="rounded-[6px] px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100"
            onClick={() => onOpenHistory?.(node.id)}
          >
            History
          </button>
        </div>
      </div>
    </section>
  )
}

export default ImageGeneratorInspector
