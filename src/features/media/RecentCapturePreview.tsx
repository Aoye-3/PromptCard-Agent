import { Image, PlaySquare } from 'lucide-react'
import { useI18n } from '@/i18n'
import { storage } from '@/utils/storage'
import type { RecentCaptureItemViewModel } from './media-types'

export const RecentCapturePreview = ({
  capture,
  assetUrl = storage.assets.url
}: {
  capture: RecentCaptureItemViewModel | null
  assetUrl?: (assetId: string) => string
}) => {
  const { t } = useI18n()

  if (!capture) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center">
        <div>
          <Image className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm font-bold text-gray-500">{t('mediaNoCaptureSelected')}</p>
          <p className="mt-1 text-xs leading-5 text-gray-400">{t('mediaNoCapturePreviewDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-950 text-white">
      {capture.thumbnailUrl || capture.contentType.startsWith('image/') ? (
        <img src={capture.thumbnailUrl || assetUrl(capture.assetId)} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="text-center">
          {capture.kind === 'screenRecording' ? <PlaySquare className="mx-auto h-9 w-9" /> : <Image className="mx-auto h-9 w-9" />}
          <p className="mt-3 text-sm font-bold">{capture.title}</p>
        </div>
      )}
    </div>
  )
}
