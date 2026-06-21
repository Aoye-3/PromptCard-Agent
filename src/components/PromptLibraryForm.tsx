import { useEffect, useState } from 'react'
import { Image, PlaySquare, Trash2, Upload } from 'lucide-react'
import type { CardType, IPreset } from '@/models/Card.model'
import { useI18n } from '@/i18n'
import {
  createPromptMediaItem,
  formatMediaSize,
  getPresetMedia,
  withPresetMedia,
  type PromptPresetMediaItem
} from '@/domain/prompt-media/prompt-media'
import { storage } from '@/utils/storage'

export type PromptLibraryFormSave = Pick<IPreset, 'type' | 'category' | 'label' | 'content' | 'meta'>

interface PromptLibraryFormProps {
  editingPreset: IPreset | null
  cardTypes: { type: string; label: string }[]
  onSave: (preset: PromptLibraryFormSave) => void
  onCancel: () => void
}

interface FormData {
  type: CardType
  label: string
  content: string
}

const emptyFormData: FormData = {
  type: 'subject',
  label: '',
  content: ''
}

const PromptLibraryForm = ({ editingPreset, cardTypes, onSave, onCancel }: PromptLibraryFormProps) => {
  const { t } = useI18n()
  const [formData, setFormData] = useState<FormData>(emptyFormData)
  const [media, setMedia] = useState<PromptPresetMediaItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (!editingPreset) {
      setFormData(emptyFormData)
      setMedia([])
      setUploadError('')
      return
    }

    setFormData({
      type: editingPreset.type,
      label: editingPreset.label,
      content: editingPreset.content
    })
    setMedia(getPresetMedia(editingPreset))
    setUploadError('')
  }, [editingPreset])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError('')

    try {
      const uploaded: PromptPresetMediaItem[] = []
      for (const file of Array.from(files)) {
        const asset = await storage.assets.upload(file)
        const mediaItem = createPromptMediaItem(asset)
        if (mediaItem) uploaded.push(mediaItem)
      }
      setMedia(current => [...current, ...uploaded])
    } catch (error) {
      console.error('Failed to upload prompt media:', error)
      setUploadError('上传失败。仅支持 PNG、JPEG、WebP 图片和 MP4、WebM 视频，单个文件不超过 200MB。')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    onSave({
      ...formData,
      category: formData.type,
      meta: withPresetMedia(editingPreset?.meta, media)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-900">
            {editingPreset ? t('editPrompt') : t('addPrompt')}
          </h2>
          <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={onCancel}>
            <i className="fa fa-times text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="type" className="mb-2 block text-sm font-medium text-gray-700">
              {t('type')} <span className="text-red-500">*</span>
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              required
            >
              {cardTypes.map(type => (
                <option key={type.type} value={type.type}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="label" className="mb-2 block text-sm font-medium text-gray-700">
              {t('promptName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="label"
              name="label"
              value={formData.label}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              placeholder={t('inputPromptName')}
              required
            />
          </div>

          <div>
            <label htmlFor="content" className="mb-2 block text-sm font-medium text-gray-700">
              {t('promptContent')} <span className="text-red-500">*</span>
            </label>
            <textarea
              id="content"
              name="content"
              value={formData.content}
              onChange={handleChange}
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              placeholder={t('inputPromptContent')}
              required
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-gray-700">媒体预览</label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200">
                <Upload className="h-4 w-4" />
                {uploading ? '上传中...' : '上传图片/视频'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    void handleUpload(event.target.files)
                    event.target.value = ''
                  }}
                />
              </label>
            </div>

            {uploadError && <p className="mb-2 text-sm text-red-600">{uploadError}</p>}

            <div className="space-y-2">
              {media.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500">
                      {item.kind === 'image' ? <Image className="h-4 w-4" /> : <PlaySquare className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{item.title || item.filename || item.assetId}</div>
                      <div className="text-xs text-gray-500">{item.kind === 'image' ? '图片' : '视频'} {formatMediaSize(item.size)}</div>
                    </div>
                  </div>
                  <button type="button" className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600" onClick={() => setMedia(current => current.filter(candidate => candidate.id !== item.id))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {media.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                  可选上传参考图片或视频，供预览模式查看。
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button type="button" className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition hover:bg-gray-200" onClick={onCancel}>
              {t('cancel')}
            </button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700" disabled={uploading}>
              {editingPreset ? t('saveChanges') : t('addPrompt')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PromptLibraryForm
