import { useI18n } from '@/i18n'
import {
  recentCapturePurposeOptions,
  recentCaptureRoleOptions,
  type RecentCaptureItemViewModel,
  type RecentCapturePurpose,
  type RecentCaptureRole
} from './media-types'
import { RecentCaptureActions } from './RecentCaptureActions'
import { RecentCapturePreview } from './RecentCapturePreview'

export const RecentCaptureDetailPanel = ({
  capture,
  canPlaceOnCanvas,
  onRegister,
  onPlaceOnCanvas,
  referenceTarget,
  onPlaceAsReference,
  onOpenPromptLibrary
}: {
  capture: RecentCaptureItemViewModel | null
  canPlaceOnCanvas: boolean
  onRegister: (capture: RecentCaptureItemViewModel) => void
  onPlaceOnCanvas: (capture: RecentCaptureItemViewModel) => void
  referenceTarget?: { id: string; title: string } | null
  onPlaceAsReference?: (capture: RecentCaptureItemViewModel, targetNodeId: string) => void
  onOpenPromptLibrary: (presetId: string) => void
}) => {
  const { t } = useI18n()
  const disabled = !capture

  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white" aria-label={t('mediaDetailAria')}>
      <div className="shrink-0 border-b border-gray-100 p-4">
        <h2 className="text-sm font-black text-gray-950">{t('mediaReviewMetadataTitle')}</h2>
        <p className="mt-1 text-xs font-semibold text-gray-400">
          {t('mediaReviewMetadataDescription')}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <RecentCapturePreview capture={capture} />
        <div className="mt-4 grid gap-4">
          <Field label={t('mediaPromptText')}>
            <textarea
              disabled={disabled}
              value={capture?.prompt || ''}
              readOnly
              rows={4}
              placeholder={t('mediaPromptPlaceholder')}
              className="min-h-[104px] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-900 placeholder:text-gray-400 disabled:text-gray-400"
            />
          </Field>
          <Field label={t('mediaUserNote')}>
            <textarea
              disabled={disabled}
              value={capture?.userNote || ''}
              readOnly
              rows={3}
              placeholder={t('mediaUserNotePlaceholder')}
              className="min-h-[86px] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-900 placeholder:text-gray-400 disabled:text-gray-400"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('mediaSourcePlatform')}>
              <input
                disabled={disabled}
                value={capture?.sourcePlatform || ''}
                readOnly
                placeholder={t('mediaSourcePlatformPlaceholder')}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 placeholder:text-gray-400 disabled:text-gray-400"
              />
            </Field>
            <Field label={t('mediaSourceUrl')}>
              <input
                disabled={disabled}
                value={capture?.sourceUrl || ''}
                readOnly
                placeholder="https://"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 placeholder:text-gray-400 disabled:text-gray-400"
              />
            </Field>
            <Field label={t('mediaAssetRole')}>
              <select
                disabled={disabled}
                value={capture?.role || 'other'}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 disabled:text-gray-400"
              >
                {recentCaptureRoleOptions.map(option => (
                  <option key={option.value} value={option.value}>{t(recentCaptureRoleLabelKeys[option.value])}</option>
                ))}
              </select>
            </Field>
            <Field label={t('mediaPurpose')}>
              <select
                disabled={disabled}
                value={capture?.purpose || 'inspirationReference'}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900 disabled:text-gray-400"
              >
                {recentCapturePurposeOptions.map(option => (
                  <option key={option.value} value={option.value}>{t(recentCapturePurposeLabelKeys[option.value])}</option>
                ))}
              </select>
            </Field>
          </div>
          <RecentCaptureActions
            capture={capture}
            canPlaceOnCanvas={canPlaceOnCanvas}
            onRegister={onRegister}
            onPlaceOnCanvas={onPlaceOnCanvas}
            referenceTarget={referenceTarget}
            onPlaceAsReference={onPlaceAsReference}
            onOpenPromptLibrary={onOpenPromptLibrary}
          />
        </div>
      </div>
    </aside>
  )
}

const Field = ({ label, children }: { label: string; children: JSX.Element }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-gray-500">{label}</span>
    {children}
  </label>
)

const recentCaptureRoleLabelKeys: Record<RecentCaptureRole, 'mediaRoleCharacter' | 'mediaRoleScene' | 'mediaRoleProp' | 'mediaRoleComposition' | 'mediaRoleLighting' | 'mediaRoleColor' | 'mediaRoleStyle' | 'mediaRoleMood' | 'mediaRoleOther'> = {
  character: 'mediaRoleCharacter',
  scene: 'mediaRoleScene',
  prop: 'mediaRoleProp',
  composition: 'mediaRoleComposition',
  lighting: 'mediaRoleLighting',
  color: 'mediaRoleColor',
  style: 'mediaRoleStyle',
  mood: 'mediaRoleMood',
  other: 'mediaRoleOther'
}

const recentCapturePurposeLabelKeys: Record<RecentCapturePurpose, 'mediaPurposeInspirationReference' | 'mediaPurposeGeneratedResult' | 'mediaPurposePromptAttachment' | 'mediaPurposeShotOutput'> = {
  inspirationReference: 'mediaPurposeInspirationReference',
  generatedResult: 'mediaPurposeGeneratedResult',
  promptAttachment: 'mediaPurposePromptAttachment',
  shotOutput: 'mediaPurposeShotOutput'
}
