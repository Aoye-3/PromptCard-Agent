import { useState, useEffect } from 'react'
import type { IPreset } from '@/models/Card.model'
import { useI18n } from '@/i18n'

interface PromptLibraryFormProps {
  editingPreset: IPreset | null
  cardTypes: { type: string; label: string }[]
  onSave: (preset: Omit<IPreset, 'id' | 'usageCount' | 'meta'>) => void
  onCancel: () => void
}

import type { CardType } from '@/models/Card.model'

interface FormData {
  type: CardType
  label: string
  content: string
}

const PromptLibraryForm = ({ editingPreset, cardTypes, onSave, onCancel }: PromptLibraryFormProps) => {
  const { t } = useI18n()
  const [formData, setFormData] = useState<FormData>({
    type: 'subject',
    label: '',
    content: ''
  })

  // 初始化编辑数据
  useEffect(() => {
    if (editingPreset) {
      setFormData({
        type: editingPreset.type,
        label: editingPreset.label,
        content: editingPreset.content
      })
    }
  }, [editingPreset])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // 由于 IPreset 接口需要 category 字段，我们可以设置一个默认值
    const presetData = {
      ...formData,
      category: formData.type // 或者设置为默认值，如 'default'
    }
    onSave(presetData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {editingPreset ? t('editPrompt') : t('addPrompt')}
          </h2>
          <button
            className="text-gray-400 hover:text-gray-600"
            onClick={onCancel}
          >
            <i className="fa fa-times text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 类型选择 */}
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
              {t('type')} <span className="text-red-500">*</span>
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              {cardTypes.map(type => (
                <option key={type.type} value={type.type}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* 名称 */}
          <div>
            <label htmlFor="label" className="block text-sm font-medium text-gray-700 mb-2">
              {t('promptName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="label"
              name="label"
              value={formData.label}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('inputPromptName')}
              required
            />
          </div>

          {/* 内容 */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
              {t('promptContent')} <span className="text-red-500">*</span>
            </label>
            <textarea
              id="content"
              name="content"
              value={formData.content}
              onChange={handleChange}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('inputPromptContent')}
              required
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              onClick={onCancel}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
            >
              {editingPreset ? t('saveChanges') : t('addPrompt')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PromptLibraryForm
