import { Archive, ClipboardCheck, ImagePlus } from 'lucide-react'
import { useI18n } from '@/i18n'

export const RecentCaptureActions = ({ disabled = true }: { disabled?: boolean }) => {
  const { t } = useI18n()

  return (
  <div className="grid gap-2 sm:grid-cols-3" aria-label={t('mediaActionsAria')}>
    <PlaceholderAction
      icon={<Archive className="h-4 w-4" />}
      label={t('mediaActionArchive')}
      title={t('mediaActionPendingTitle')}
      disabled={disabled}
    />
    <PlaceholderAction
      icon={<ClipboardCheck className="h-4 w-4" />}
      label={t('mediaActionRegister')}
      title={t('mediaActionPendingTitle')}
      disabled={disabled}
    />
    <PlaceholderAction
      icon={<ImagePlus className="h-4 w-4" />}
      label={t('mediaActionPlaceOnCanvas')}
      title={t('mediaActionPendingTitle')}
      disabled={disabled}
    />
  </div>
  )
}

const PlaceholderAction = ({
  icon,
  label,
  title,
  disabled
}: {
  icon: JSX.Element
  label: string
  title: string
  disabled: boolean
}) => (
  <button
    type="button"
    disabled={disabled}
    title={title}
    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-black text-gray-400 disabled:cursor-not-allowed"
  >
    {icon}
    {label}
  </button>
)
