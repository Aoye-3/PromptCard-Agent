import type {
  FreeCanvasImageAspectRatio,
  IFreeCanvasImageGeneratorNode,
  PromptDocument
} from '@/models/PromptHistory.model'
import type { ImageGeneratorPromptSnapshot } from '@/domain/image-generation/prompt-compiler'
import { imageGeneratorResultUrl, imageGeneratorStatus } from '../nodes/ImageGeneratorNode'
import { ReferencePromptEditor } from './ReferencePromptEditor'

export interface ImageGeneratorInspectorProps {
  node: IFreeCanvasImageGeneratorNode
  status?: string
  resultThumbnailUrl?: string
  promptSnapshot?: ImageGeneratorPromptSnapshot
  onChange: (updates: Partial<Pick<IFreeCanvasImageGeneratorNode, 'mode' | 'settings'>>) => void
  onPromptDocumentChange?: (document: PromptDocument) => void
  onOpenHistory?: (nodeId: string) => void
}

const ASPECT_RATIOS: FreeCanvasImageAspectRatio[] = [
  'smart',
  '1:1',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
  '3:2',
  '2:3',
  '21:9',
  'custom'
]

export const ImageGeneratorInspector = ({
  node,
  status = imageGeneratorStatus(node),
  resultThumbnailUrl = imageGeneratorResultUrl(node),
  promptSnapshot,
  onChange,
  onPromptDocumentChange,
  onOpenHistory
}: ImageGeneratorInspectorProps) => {
  const updateSettings = (updates: Partial<IFreeCanvasImageGeneratorNode['settings']>) => {
    onChange({ settings: { ...node.settings, ...updates } })
  }

  return (
    <section data-image-generator-inspector className="space-y-4 p-4">
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
            className="nodrag w-full rounded-[6px] border border-gray-200 bg-white px-2 py-2 text-xs"
            value={node.settings.resolution}
            onChange={event => updateSettings({ resolution: event.target.value as '1K' | '2K' })}
          >
            <option value="1K">1K</option>
            <option value="2K">2K</option>
          </select>
        </label>

        <label className="text-xs font-bold text-gray-700">
          <span className="mb-1 block">Aspect ratio</span>
          <select
            className="nodrag w-full rounded-[6px] border border-gray-200 bg-white px-2 py-2 text-xs"
            value={node.settings.aspectRatio}
            onChange={event => updateSettings({ aspectRatio: event.target.value as FreeCanvasImageAspectRatio })}
          >
            {ASPECT_RATIOS.map(aspectRatio => (
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
        <button
          type="button"
          className="rounded-[6px] px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100"
          onClick={() => onOpenHistory?.(node.id)}
        >
          History
        </button>
      </div>
    </section>
  )
}

export default ImageGeneratorInspector
