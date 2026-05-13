# Prompt 库功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开发一个 Prompt 库子页面，允许用户通过图形界面管理 PromptCard 中的提示词配置，实现新增、删除、修改、查询等功能。

**Architecture:** 
- 在首页导航栏添加 Prompt 库按钮，实现页面切换功能
- 开发独立的 Prompt 库子页面，使用表格展示所有预制提示词
- 直接与现有的 `usePresetStore` 存储系统集成，确保数据同步
- 提供完整的 CRUD 操作接口，用户可以管理自己的提示词库

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand + localForage

---

## 文件结构规划

**新增文件:**
- `src/components/PromptLibrary.tsx` - Prompt 库子页面组件
- `src/components/PromptLibraryForm.tsx` - 新增/编辑 Prompt 表单组件
- `src/components/PromptLibraryTable.tsx` - Prompt 表格组件

**修改文件:**
- `src/App.tsx` - 添加页面切换导航和状态管理
- `src/stores/preset.store.ts` - 增强预设存储管理功能
- `src/utils/storage.ts` - 添加预设数据管理方法
- `src/models/Card.model.ts` - 可能需要扩展类型定义

---

## Task 1: 创建 Prompt 库子页面组件

**Files:**
- Create: `src/components/PromptLibrary.tsx` - Prompt 库主页面组件

- [ ] **Step 1: 创建 PromptLibrary 组件框架**

```tsx
import { useState } from 'react'
import { usePresetStore } from '@/stores/preset.store'
import PromptLibraryTable from './PromptLibraryTable'
import PromptLibraryForm from './PromptLibraryForm'
import type { IPreset } from '@/models/Card.model'

const PromptLibrary = () => {
  const { presets, addPreset, updatePreset, deletePreset } = usePresetStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<IPreset | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // 过滤搜索结果
  const filteredPresets = presets.filter(preset => 
    preset.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    preset.content.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 处理新增/编辑
  const handleSavePreset = async (presetData: Omit<IPreset, 'id' | 'usageCount' | 'meta'>) => {
    if (editingPreset) {
      // 编辑模式
      await updatePreset(editingPreset.id, presetData)
    } else {
      // 新增模式
      await addPreset(presetData)
    }
    setIsFormOpen(false)
    setEditingPreset(null)
  }

  // 处理编辑
  const handleEditPreset = (preset: IPreset) => {
    setEditingPreset(preset)
    setIsFormOpen(true)
  }

  // 处理删除
  const handleDeletePreset = async (id: string) => {
    if (confirm('确定要删除这个预制提示词吗？')) {
      await deletePreset(id)
    }
  }

  // 卡片类型选项
  const cardTypes = [
    { type: 'subject', label: '主体' },
    { type: 'action', label: '动作' },
    { type: 'scene', label: '场景' },
    { type: 'style', label: '风格' },
    { type: 'camera', label: '镜头' },
    { type: 'lighting', label: '灯光' },
    { type: 'timing', label: '时序' },
    { type: 'audio', label: '音频' },
    { type: 'constraint', label: '约束' },
    { type: 'custom', label: '自定义' }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Prompt 库</h1>
              <p className="text-sm text-gray-600">管理您的预制提示词配置</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索提示词..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <i className="fa fa-search"></i>
                </div>
              </div>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                onClick={() => setIsFormOpen(true)}
              >
                <i className="fa fa-plus"></i>
                新增 Prompt
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主体内容 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 统计信息 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-500 p-3 rounded-lg">
                <i className="fa fa-database text-white text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">总数量</p>
                <p className="text-2xl font-bold text-gray-900">{presets.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-500 p-3 rounded-lg">
                <i className="fa fa-puzzle-piece text-white text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">卡片类型</p>
                <p className="text-2xl font-bold text-gray-900">{cardTypes.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-purple-500 p-3 rounded-lg">
                <i className="fa fa-search text-white text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">搜索结果</p>
                <p className="text-2xl font-bold text-gray-900">{filteredPresets.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-yellow-500 p-3 rounded-lg">
                <i className="fa fa-star text-white text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">常用 Prompt</p>
                <p className="text-2xl font-bold text-gray-900">
                  {presets.filter(p => p.usageCount > 0).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Prompt 表格 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <PromptLibraryTable
            presets={filteredPresets}
            onEdit={handleEditPreset}
            onDelete={handleDeletePreset}
          />
        </div>
      </div>

      {/* 新增/编辑表单 */}
      {isFormOpen && (
        <PromptLibraryForm
          editingPreset={editingPreset}
          cardTypes={cardTypes}
          onSave={handleSavePreset}
          onCancel={() => {
            setIsFormOpen(false)
            setEditingPreset(null)
          }}
        />
      )}
    </div>
  )
}

export default PromptLibrary
```

- [ ] **Step 2: 导出组件**
- [ ] **Step 3: 验证组件结构**

---

## Task 2: 创建 Prompt 库表格组件

**Files:**
- Create: `src/components/PromptLibraryTable.tsx` - 表格组件

- [ ] **Step 1: 创建表格组件**

```tsx
import type { IPreset } from '@/models/Card.model'

interface PromptLibraryTableProps {
  presets: IPreset[]
  onEdit: (preset: IPreset) => void
  onDelete: (id: string) => void
}

const PromptLibraryTable = ({ presets, onEdit, onDelete }: PromptLibraryTableProps) => {
  // 获取卡片类型标签
  const getTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      subject: '主体',
      action: '动作',
      scene: '场景',
      style: '风格',
      camera: '镜头',
      lighting: '灯光',
      timing: '时序',
      audio: '音频',
      constraint: '约束',
      custom: '自定义'
    }
    return typeMap[type] || type
  }

  // 获取类型对应的颜色
  const getTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      subject: 'bg-blue-100 text-blue-700',
      action: 'bg-green-100 text-green-700',
      scene: 'bg-purple-100 text-purple-700',
      style: 'bg-orange-100 text-orange-700',
      camera: 'bg-red-100 text-red-700',
      lighting: 'bg-yellow-100 text-yellow-700',
      timing: 'bg-amber-100 text-amber-700',
      audio: 'bg-teal-100 text-teal-700',
      constraint: 'bg-purple-100 text-purple-700',
      custom: 'bg-gray-100 text-gray-700'
    }
    return colorMap[type] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              类型
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              名称
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              内容
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              分类
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              使用次数
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {presets.map((preset) => (
            <tr key={preset.id} className="hover:bg-gray-50 transition">
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeColor(preset.type)}`}>
                  {getTypeLabel(preset.type)}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{preset.label}</div>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-gray-900 max-w-md line-clamp-2">
                  {preset.content}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500">{preset.category || '-'}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-500">
                  <i className="fa fa-eye mr-1"></i> {preset.usageCount}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button
                  className="text-blue-600 hover:text-blue-900 mr-3"
                  onClick={() => onEdit(preset)}
                >
                  <i className="fa fa-edit mr-1"></i>编辑
                </button>
                <button
                  className="text-red-600 hover:text-red-900"
                  onClick={() => onDelete(preset.id)}
                >
                  <i className="fa fa-trash mr-1"></i>删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {presets.length === 0 && (
        <div className="text-center py-12">
          <i className="fa fa-search text-4xl text-gray-300 mb-4"></i>
          <p className="text-gray-500 text-lg">未找到匹配的 Prompt</p>
        </div>
      )}
    </div>
  )
}

export default PromptLibraryTable
```

- [ ] **Step 2: 导出组件**
- [ ] **Step 3: 验证表格功能**

---

## Task 3: 创建 Prompt 库表单组件

**Files:**
- Create: `src/components/PromptLibraryForm.tsx` - 表单组件

- [ ] **Step 1: 创建表单组件**

```tsx
import { useState, useEffect } from 'react'
import type { IPreset } from '@/models/Card.model'

interface PromptLibraryFormProps {
  editingPreset: IPreset | null
  cardTypes: { type: string; label: string }[]
  onSave: (preset: Omit<IPreset, 'id' | 'usageCount' | 'meta'>) => void
  onCancel: () => void
}

interface FormData {
  type: string
  category: string
  label: string
  content: string
}

const PromptLibraryForm = ({ editingPreset, cardTypes, onSave, onCancel }: PromptLibraryFormProps) => {
  const [formData, setFormData] = useState<FormData>({
    type: 'subject',
    category: 'scene',
    label: '',
    content: ''
  })

  // 初始化编辑数据
  useEffect(() => {
    if (editingPreset) {
      setFormData({
        type: editingPreset.type,
        category: editingPreset.category || 'scene',
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
    onSave(formData)
  }

  const categories = [
    { value: 'scene', label: '场景' },
    { value: 'lens', label: '镜头' },
    { value: 'style', label: '风格' },
    { value: 'subject', label: '主体' },
    { value: 'action', label: '动作' }
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {editingPreset ? '编辑 Prompt' : '新增 Prompt'}
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
              卡片类型 <span className="text-red-500">*</span>
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

          {/* 分类选择 */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
              分类
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {categories.map(category => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          {/* 名称 */}
          <div>
            <label htmlFor="label" className="block text-sm font-medium text-gray-700 mb-2">
              Prompt 名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="label"
              name="label"
              value={formData.label}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="输入 Prompt 名称"
              required
            />
          </div>

          {/* 内容 */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
              Prompt 内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="content"
              name="content"
              value={formData.content}
              onChange={handleChange}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="输入 Prompt 内容..."
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
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
            >
              {editingPreset ? '保存修改' : '新增 Prompt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PromptLibraryForm
```

- [ ] **Step 2: 导出组件**
- [ ] **Step 3: 验证表单功能**

---

## Task 4: 增强预设存储管理功能

**Files:**
- Modify: `src/stores/preset.store.ts` - 增强功能
- Modify: `src/utils/storage.ts` - 添加管理方法

- [ ] **Step 1: 修改 storage.ts 添加删除和更新方法**

```typescript
// 在 src/utils/storage.ts 中添加以下方法

export const storage = {
  // ... 现有方法
  presets: {
    async getAll(): Promise<IPreset[]> {
      return (await localforage.getItem<IPreset[]>('presets')) || []
    },
    async saveAll(presets: IPreset[]): Promise<void> {
      await localforage.setItem('presets', presets)
    },
    async incrementUsage(id: string): Promise<void> {
      const presets = await this.getAll()
      const updated = presets.map(p => p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p)
      await this.saveAll(updated)
    },
    // 新增更新方法
    async update(id: string, updates: Partial<IPreset>): Promise<void> {
      const presets = await this.getAll()
      const updated = presets.map(p => 
        p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
      )
      await this.saveAll(updated)
    },
    // 新增删除方法
    async delete(id: string): Promise<void> {
      const presets = await this.getAll()
      await this.saveAll(presets.filter(p => p.id !== id))
    },
    // 新增查找方法
    async getById(id: string): Promise<IPreset | undefined> {
      const presets = await this.getAll()
      return presets.find(p => p.id === id)
    }
  },
  // ... 其他存储方法
}
```

- [ ] **Step 2: 修改 preset.store.ts 增强功能**

```typescript
import { create } from 'zustand'
import type { ICard, IPreset } from '@/models/Card.model'
import { storage } from '@/utils/storage'
import { VIDPROM_PRESET_OPTIONS } from '@/knowledge/vidprom-preset-options'

interface PresetState {
  presets: IPreset[]
  loading: boolean
  init: () => Promise<void>
  getByType: (type: ICard['type']) => IPreset[]
  addPreset: (preset: Omit<IPreset, 'id' | 'usageCount' | 'meta'>) => Promise<void>
  updatePreset: (id: string, updates: Partial<IPreset>) => Promise<void> // 新增
  deletePreset: (id: string) => Promise<void> // 新增
  incrementUsage: (id: string) => Promise<void>
  searchPresets: (searchTerm: string) => IPreset[]
}

export const usePresetStore = create<PresetState>((set, get) => ({
  presets: [],
  loading: false,

  init: async () => {
    set({ loading: true })
    try {
      // 每次初始化都重新创建完整的预制数据，确保包含最新的 VIDPROM_PRESET_OPTIONS
      let presets = defaultPresets.map((p, index) => ({
        ...p,
        id: `preset-${index}`,
        usageCount: 0
      }))
      
      // 添加 VidProM 数据集的预制选项
      let vidpromPresetCount = defaultPresets.length
      for (const [, options] of Object.entries(VIDPROM_PRESET_OPTIONS)) {
        options.forEach(option => {
          presets.push({
            ...option,
            id: `vidprom-preset-${vidpromPresetCount++}`,
            usageCount: 0,
            meta: option.meta || {}
          })
        })
      }
      
      await storage.presets.saveAll(presets)
      set({ presets })
    } catch (e) {
      console.error('加载预制数据失败:', e)
    } finally {
      set({ loading: false })
    }
  },

  getByType: (type: ICard['type']) => {
    return get().presets.filter(p => p.type === type)
  },

  addPreset: async (preset) => {
    const newPreset: IPreset = {
      ...preset,
      id: `preset-${Date.now()}`,
      usageCount: 0,
      meta: {}
    }
    const updated = [...get().presets, newPreset]
    set({ presets: updated })
    await storage.presets.saveAll(updated)
  },

  // 新增更新方法
  updatePreset: async (id, updates) => {
    const updated = get().presets.map(p => 
      p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
    )
    set({ presets: updated })
    await storage.presets.update(id, updates)
  },

  // 新增删除方法
  deletePreset: async (id) => {
    const updated = get().presets.filter(p => p.id !== id)
    set({ presets: updated })
    await storage.presets.delete(id)
  },

  incrementUsage: async (id: string) => {
    const updated = get().presets.map(p => 
      p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p
    )
    set({ presets: updated })
    await storage.presets.incrementUsage(id)
  },

  searchPresets: (searchTerm: string) => {
    return get().presets.filter(p => 
      p.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.content.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }
}))
```

- [ ] **Step 3: 验证存储功能**

---

## Task 5: 集成到主应用和导航

**Files:**
- Modify: `src/App.tsx` - 添加页面切换功能

- [ ] **Step 1: 修改 App.tsx 添加页面状态管理**

```tsx
import { useEffect, useState } from 'react'
import CardComponent from './components/CardComponent'
import EvaluationPanel from './components/EvaluationPanel'
import CreativeMode from './components/CreativeMode'
import PromptLibrary from './components/PromptLibrary' // 新增
import { useCardStore } from './stores/card.store'
import { usePresetStore } from './stores/preset.store'
import { useExampleStore } from './stores/example.store'
import { assemblePrompt, getCardDefaultTitle } from './utils/promptParser'
import { LEARNING_CONTENT } from './data/learningContent'
import type { LearningContent } from './data/learningContent'
import type { OptimizationSuggestion } from './services/evaluation-service'
import type { IPreset } from './models/Card.model'

function App() {
  const { pages, currentPage, addCard, updateCard, activeCardId, activePresetCardId, setActivePresetCardId, addPage, switchPage, removePage, selectedCards, getCombinedPrompt, clearSelection } = useCardStore()
  const { init: initPresets, getByType: getPresetsByType, incrementUsage } = usePresetStore()
  const { init: initExamples } = useExampleStore()
  
  // 新增页面状态
  const [activePage, setActivePage] = useState<'home' | 'library'>('home')
  const [activeTab, setActiveTab] = useState<'edit' | 'evaluate'>('edit')
  const [selectedLearningCard, setSelectedLearningCard] = useState<LearningContent>(LEARNING_CONTENT[0])
  const [activeEditMode, setActiveEditMode] = useState<'learn' | 'creative'>('learn')
  const currentCards = pages[currentPage]?.cards || []
  const currentPrompt = assemblePrompt(pages)

  // ... 现有代码

  // 如果是 Prompt 库页面，直接渲染
  if (activePage === 'library') {
    return <PromptLibrary />
  }

  // 首页渲染
  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部导航栏 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">PromptCard <span className="text-indigo-600">V4</span></h1>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">学习版</span>
          </div>
          <div className="flex items-center gap-4">
              <button 
                className={`px-4 py-2 rounded-lg text-white font-medium transition ${
                  activePage === 'home' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActivePage('home')}
              >
                <span className="fa fa-home mr-2"></span>首页
              </button>
              <button 
                className={`px-4 py-2 rounded-lg text-white font-medium transition ${
                  activePage === 'library' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActivePage('library')}
              >
                <span className="fa fa-database mr-2"></span>Prompt 库
              </button>
              <button className="px-4 py-2 rounded-lg text-white font-medium transition primary-btn" onClick={handleSave}>
                <span className="fa fa-save mr-2"></span>保存
              </button>
            </div>
        </div>
      </header>

      {/* ... 现有首页内容 */}
    </div>
  )
}

export default App
```

- [ ] **Step 2: 验证页面切换功能**
- [ ] **Step 3: 测试导航栏样式**

---

## Task 6: 完善类型定义

**Files:**
- Modify: `src/models/Card.model.ts` - 完善 IPreset 类型

- [ ] **Step 1: 扩展类型定义**

```typescript
export interface IPreset {
  id: string
  type: ICard['type']
  category: string
  label: string
  content: string
  usageCount: number
  meta?: any
  createdAt?: number
  updatedAt?: number
}
```

---

## Task 7: 运行构建和验证

**Files:**
- Run: 构建和验证命令

- [ ] **Step 1: 安装项目依赖**

```bash
cd f:\.workSpace\IICL-CardInterface\promptcard-v4.2
npm install
```

- [ ] **Step 2: 构建项目**

```bash
npm run build
```

- [ ] **Step 3: 检查构建结果**

- [ ] **Step 4: 运行开发服务器**

```bash
npm run dev
```

- [ ] **Step 5: 验证功能**

1. 访问首页，点击 "Prompt 库" 按钮
2. 测试新增 Prompt 功能
3. 测试编辑 Prompt 功能  
4. 测试删除 Prompt 功能
5. 测试搜索功能
6. 测试页面切换功能

---

## 测试检查点

**功能测试:**
- ✅ 页面导航功能正常
- ✅ Prompt 列表展示正常
- ✅ 新增 Prompt 功能正常
- ✅ 编辑 Prompt 功能正常  
- ✅ 删除 Prompt 功能正常
- ✅ 搜索功能正常
- ✅ 数据存储和同步正常

**界面测试:**
- ✅ 响应式设计适配
- ✅ 表格布局美观
- ✅ 表单验证提示
- ✅ 操作反馈动画

**数据测试:**
- ✅ 本地存储操作正常
- ✅ 数据同步机制正常
- ✅ 错误处理机制正常
