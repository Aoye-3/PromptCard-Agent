import { Image, PlaySquare, X } from 'lucide-react'
import type { IPreset } from '@/models/Card.model'
import { getPresetMedia, formatMediaSize } from '@/domain/prompt-media/prompt-media'
import { storage } from '@/utils/storage'

export const PromptPresetPreviewDialog = ({
  preset,
  onClose
}: {
  preset: IPreset
  onClose: () => void
}) => {
  const media = getPresetMedia(preset)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 px-4" onClick={onClose}>
      <div className="max-h-[84vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-400">{preset.category || preset.type}</div>
            <h3 className="mt-1 break-words text-xl font-black text-gray-950">{preset.label}</h3>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-950"
            onClick={onClose}
            aria-label="关闭预览"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-7 text-gray-800">{preset.content}</div>

        {media.length > 0 && (
          <div className="mt-4 space-y-4">
            {media.map(item => (
              <figure key={item.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2 font-semibold text-gray-800">
                    {item.kind === 'image' ? <Image className="h-4 w-4 text-gray-500" /> : <PlaySquare className="h-4 w-4 text-gray-500" />}
                    <span className="truncate">{item.title || item.filename || item.assetId}</span>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{formatMediaSize(item.size)}</span>
                </div>
                {item.kind === 'image' ? (
                  <img
                    src={storage.assets.url(item.assetId)}
                    alt={item.title || item.filename || preset.label}
                    className="max-h-[52vh] w-full object-contain bg-gray-950"
                  />
                ) : (
                  <video
                    src={storage.assets.url(item.assetId)}
                    controls
                    className="max-h-[52vh] w-full bg-gray-950"
                  />
                )}
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
