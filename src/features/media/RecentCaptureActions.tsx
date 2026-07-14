import { Archive, ClipboardCheck, ExternalLink, ImagePlus } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { RecentCaptureItemViewModel } from './media-types'

interface RecentCaptureActionsProps {
  capture: RecentCaptureItemViewModel | null
  canPlaceOnCanvas: boolean
  onRegister: (capture: RecentCaptureItemViewModel) => void
  onPlaceOnCanvas: (capture: RecentCaptureItemViewModel) => void
  onOpenPromptLibrary: (presetId: string) => void
}

export const RecentCaptureActions = ({ capture, canPlaceOnCanvas, onRegister, onPlaceOnCanvas, onOpenPromptLibrary }: RecentCaptureActionsProps) => {
  const { t } = useI18n()
  const registeredPromptId = capture?.registeredPromptId
  const canPlace = Boolean(capture && capture.kind !== 'screenRecording' && canPlaceOnCanvas)

  return (
    <div className="grid gap-2 sm:grid-cols-3" aria-label={t('mediaActionsAria')}>
      <button type="button" disabled title={t('mediaActionPendingTitle')} className={disabledClass}>
        <Archive className="h-4 w-4" />{t('mediaActionArchive')}
      </button>
      {registeredPromptId ? (
        <button
          type="button"
          data-open-registered-prompt
          onClick={() => onOpenPromptLibrary(registeredPromptId)}
          className={activeClass}
        >
          <ExternalLink className="h-4 w-4" />在 Prompt Library 中查看
        </button>
      ) : (
        <button
          type="button"
          data-register-capture
          disabled={!capture}
          onClick={() => capture && onRegister(capture)}
          className={activeClass}
        >
          <ClipboardCheck className="h-4 w-4" />{t('mediaActionRegister')}
        </button>
      )}
      <button
        type="button"
        data-place-capture-on-canvas
        disabled={!canPlace}
        title={canPlace ? '' : '仅在活动的 Free Canvas 项目中可用'}
        onClick={() => capture && canPlace && onPlaceOnCanvas(capture)}
        className={activeClass}
      >
        <ImagePlus className="h-4 w-4" />{t('mediaActionPlaceOnCanvas')}
      </button>
    </div>
  )
}

const activeClass = 'inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300'
const disabledClass = 'inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-black text-gray-300 disabled:cursor-not-allowed'
