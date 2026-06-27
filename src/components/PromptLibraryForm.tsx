import { useEffect, useState } from 'react'
import { Image as ImageIcon, PlaySquare, Trash2, Upload, X } from 'lucide-react'
import type { CardType, IPreset } from '@/models/Card.model'
import { useI18n } from '@/i18n'
import {
  createPromptMediaItem,
  formatMediaSize,
  getPresetMedia,
  withPresetMedia,
  type PromptPresetMediaItem
} from '@/domain/prompt-media/prompt-media'
import {
  QUICK_MESSAGE_CATEGORY,
  createQuickMessagePresetInput,
  isQuickMessagePreset
} from '@/domain/prompt-library/quick-messages'
import { storage } from '@/utils/storage'

export type PromptLibraryFormSave = Pick<IPreset, 'type' | 'category' | 'label' | 'content' | 'meta'>

interface PromptLibraryFormProps {
  editingPreset: IPreset | null
  cardTypes: { type: string; label: string }[]
  activeCategory: string
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

const PromptLibraryForm = ({ editingPreset, cardTypes, activeCategory, onSave, onCancel }: PromptLibraryFormProps) => {
  const { t } = useI18n()
  const [formData, setFormData] = useState<FormData>(emptyFormData)
  const [media, setMedia] = useState<PromptPresetMediaItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const isQuickMessageMode = activeCategory === QUICK_MESSAGE_CATEGORY || Boolean(editingPreset && isQuickMessagePreset(editingPreset))
  const title = isQuickMessageMode
    ? editingPreset ? '编辑快捷消息' : '新增快捷消息'
    : editingPreset ? t('editPrompt') : t('addPrompt')

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
    } catch {
      setUploadError('上传失败。仅支持 PNG、JPEG、WebP 图片和 MP4、WebM 视频，单个文件不超过 200MB。')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (isQuickMessageMode) {
      onSave(createQuickMessagePresetInput({
        name: formData.label,
        body: formData.content
      }, {
        meta: withPresetMedia(editingPreset?.meta, media)
      }))
      return
    }

    onSave({
      type: formData.type,
      category: formData.type,
      label: formData.label,
      content: formData.content,
      meta: withPresetMedia(editingPreset?.meta, media)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4 py-6">
      <div
        data-prompt-library-form
        className="grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[8px] bg-white shadow-2xl"
        style={{
          width: 'min(1040px, calc(100vw - 32px))',
          height: 'min(720px, calc(100vh - 48px))'
        }}
      >
        <div className="shrink-0 border-b border-gray-100 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wide text-gray-400">
                {isQuickMessageMode ? 'QUICK-MESSAGE' : 'PROMPT'}
              </div>
              <h2 className="mt-1 break-words text-xl font-black text-gray-950">{title}</h2>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-950"
              onClick={onCancel}
              aria-label="关闭表单"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid min-h-0 grid-rows-[minmax(260px,0.9fr)_minmax(360px,1.1fr)] overflow-y-auto md:grid-cols-[minmax(0,1fr)_420px] md:grid-rows-none md:overflow-hidden"
        >
          <section data-prompt-library-form-media className="flex min-h-0 min-w-0 flex-col border-b border-gray-100 bg-gray-50 md:border-b-0 md:border-r">
            <div className="shrink-0 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-black text-gray-950">
                  <ImageIcon className="h-4 w-4 text-gray-500" />
                  媒体预览
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-3 py-2 text-xs font-black text-gray-700 transition hover:bg-gray-200">
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
              {uploadError && <p className="mt-2 text-sm font-semibold text-red-600">{uploadError}</p>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {media.length === 0 ? (
                <div className="flex h-full min-h-[220px] items-center justify-center rounded-[8px] border border-dashed border-gray-200 bg-white text-center text-sm font-semibold text-gray-400">
                  可选上传参考图片或视频，供预览模式查看。
                </div>
              ) : (
                <div className="space-y-4">
                  {media.map(item => (
                    <figure key={item.id} className="overflow-hidden rounded-[8px] border border-gray-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-sm">
                        <div className="flex min-w-0 items-center gap-2 font-semibold text-gray-800">
                          {item.kind === 'image' ? <ImageIcon className="h-4 w-4 text-gray-500" /> : <PlaySquare className="h-4 w-4 text-gray-500" />}
                          <span className="truncate">{item.title || item.filename || item.assetId}</span>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                          onClick={() => setMedia(current => current.filter(candidate => candidate.id !== item.id))}
                          aria-label="删除媒体"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {item.kind === 'image' ? (
                        <img
                          src={storage.assets.url(item.assetId)}
                          alt={item.title || item.filename || formData.label || 'Prompt media'}
                          className="max-h-[34vh] w-full bg-gray-950 object-contain"
                        />
                      ) : (
                        <video
                          src={storage.assets.url(item.assetId)}
                          controls
                          className="max-h-[34vh] w-full bg-gray-950"
                        />
                      )}
                      {formatMediaSize(item.size) && (
                        <figcaption className="border-t border-gray-100 px-4 py-2 text-xs font-semibold text-gray-400">
                          {item.kind === 'image' ? '图片' : '视频'} {formatMediaSize(item.size)}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 min-w-0 flex-col bg-white">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5">
              {!isQuickMessageMode && (
                <div className="shrink-0">
                  <label htmlFor="type" className="mb-2 block text-sm font-bold text-gray-950">
                    {t('type')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full rounded-[8px] border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-950 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                    required
                  >
                    {cardTypes.map(type => (
                      <option key={type.type} value={type.type}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="shrink-0">
                <label htmlFor="label" className="mb-2 block text-sm font-bold text-gray-950">
                  {isQuickMessageMode ? '提示词名称' : t('promptName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="label"
                  name="label"
                  value={formData.label}
                  onChange={handleChange}
                  className="w-full rounded-[8px] border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-950 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  placeholder={isQuickMessageMode ? '请输入名称' : t('inputPromptName')}
                  required
                />
              </div>

              <label htmlFor="content" className="flex min-h-0 flex-1 flex-col">
                <span className="mb-2 block text-sm font-bold text-gray-950">
                  {isQuickMessageMode ? '模板正文' : t('promptContent')} <span className="text-red-500">*</span>
                </span>
                <textarea
                  data-prompt-library-form-content
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={handleChange}
                  className="min-h-[220px] flex-1 resize-none overflow-y-auto rounded-[8px] border border-gray-200 bg-gray-50 px-4 py-4 text-sm leading-7 text-gray-900 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
                  placeholder={isQuickMessageMode ? '请输入模板正文' : t('inputPromptContent')}
                  required
                />
              </label>
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                className="rounded-[8px] bg-gray-100 px-5 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-200"
                onClick={onCancel}
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="rounded-[8px] bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                disabled={uploading}
              >
                {isQuickMessageMode ? '保存' : editingPreset ? t('saveChanges') : t('addPrompt')}
              </button>
            </div>
          </section>
        </form>
      </div>
    </div>
  )
}

export default PromptLibraryForm
