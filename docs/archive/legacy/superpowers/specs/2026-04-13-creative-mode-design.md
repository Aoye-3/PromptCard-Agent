# 创意模式页面设计文档

## 项目概述

**项目名称：** PromptCard学习系统 V4
**页面：** 创意模式页面
**设计日期：** 2026-04-13
**版本：** 1.0

## 设计目标

完善创意模式页面功能，改变预制提示词选择交互逻辑，从弹窗改为页面内交互。

## 设计方法

### 布局方案：分栏式布局（推荐）

**结构：**
- **左侧（30%宽度）：预制提示词选择器** - 按卡片类型分类显示预制提示词
- **中间（40%宽度）：卡片编辑区域** - 显示当前选中的卡片，支持编辑和选择预制提示词
- **右侧（30%宽度）：示例Prompt窗口** - 显示与当前卡片类型相关的优秀示例

**优势：**
- 清晰的信息架构
- 直观的操作流程
- 同时展示选择、编辑和参考内容
- 提高使用效率

## 组件设计

### 1. 创意模式主体组件 (CreativeMode.tsx)

**职责：** 管理创意模式页面的整体布局和状态

**功能：**
- 布局分栏结构
- 卡片激活状态管理
- 类型导航和搜索
- 预制提示词和示例的应用逻辑

**核心代码：**
```typescript
import React, { useState, useMemo } from 'react'
import PresetSelector from './PresetSelector'
import ExamplePromptWindow from './ExamplePromptWindow'
import CardComponent from '../components/CardComponent'
import { useCardStore } from '../stores/card.store'

const CreativeMode: React.FC = () => {
  const { activeCardId, pages, currentPage } = useCardStore()
  const currentCards = pages[currentPage]?.cards || []
  const activeCard = activeCardId ? currentCards.find(c => c.id === activeCardId) : null

  const [selectedType, setSelectedType] = useState(activeCard?.type || 'subject')

  const handlePresetSelect = (preset: PresetItem) => {
    if (activeCard) {
      const { updateCard } = useCardStore.getState()
      const newContent = activeCard.content
        ? `${activeCard.content}\n${preset.content}`
        : preset.content
      updateCard(activeCard.id, { content: newContent })
    }
  }

  const handleExampleSelect = (content: string) => {
    if (activeCard) {
      const { updateCard } = useCardStore.getState()
      updateCard(activeCard.id, { content })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 页面标题 */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">🎨 创意模式</h2>
        <p className="text-sm text-gray-500 mt-1">
          在左侧选择预制提示词，右侧查看优秀示例
        </p>
      </div>

      {/* 主体内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：预制提示词选择器 */}
        <div className="w-1/3 border-r border-gray-200">
          <PresetSelector
            onPresetSelect={handlePresetSelect}
            selectedType={selectedType}
            onTypeSelect={setSelectedType}
          />
        </div>

        {/* 中间：卡片编辑区域 */}
        <div className="w-1/3 border-r border-gray-200">
          {activeCard ? (
            <div className="p-4">
              <CardComponent card={activeCard} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              请点击左侧卡片组件库中的卡片以开始编辑
            </div>
          )}
        </div>

        {/* 右侧：示例Prompt窗口 */}
        <div className="w-1/3">
          <ExamplePromptWindow
            cardType={selectedType}
            onExampleSelect={handleExampleSelect}
          />
        </div>
      </div>
    </div>
  )
}

export default CreativeMode
```

### 2. 预制提示词选择器组件 (PresetSelector.tsx)

**职责：** 显示和筛选预制提示词

**功能：**
- 类型导航菜单
- 搜索和筛选功能
- 预制提示词列表
- 选中状态管理

**核心代码：**
```typescript
import React, { useState, useMemo } from 'react'
import { usePresetStore } from '../stores/preset.store'

interface PresetSelectorProps {
  onPresetSelect: (preset: PresetItem) => void
  selectedType: string
  onTypeSelect: (type: string) => void
}

const CARD_TYPES = ['subject', 'action', 'scene', 'style', 'camera', 'lighting', 'timing', 'audio', 'constraint', 'custom']

const PresetSelector: React.FC<PresetSelectorProps> = ({
  onPresetSelect,
  selectedType,
  onTypeSelect
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const { getByType: getPresetsByType } = usePresetStore()

  const presets = selectedType ? getPresetsByType(selectedType) : []
  const filteredPresets = useMemo(() =>
    presets.filter(preset =>
      preset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      preset.content.toLowerCase().includes(searchTerm.toLowerCase())
    ), [presets, searchTerm]
  )

  const getTypeLabel = (type: string) => {
    const labelMap: Record<string, string> = {
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
    return labelMap[type] || type
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 */}
      <div className="p-4 border-b border-gray-200">
        <input
          type="text"
          placeholder="搜索预制提示词..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 类型导航 */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">卡片类型</h3>
        <div className="space-y-1">
          {CARD_TYPES.map(type => (
            <button
              key={type}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedType === type
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              onClick={() => onTypeSelect(type)}
            >
              {getTypeLabel(type)}
            </button>
          ))}
        </div>
      </div>

      {/* 预制提示词列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          预制提示词 ({filteredPresets.length})
        </h3>
        <div className="space-y-2">
          {filteredPresets.map(preset => (
            <div
              key={preset.id}
              className="p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-400 cursor-pointer transition-colors"
              onClick={() => onPresetSelect(preset)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-gray-800">{preset.name}</span>
                <span className="text-xs text-gray-500">{preset.usageCount}次使用</span>
              </div>
              <p className="text-xs text-gray-600 line-clamp-2">{preset.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PresetSelector
```

### 3. 示例Prompt窗口组件 (ExamplePromptWindow.tsx)

**职责：** 显示优秀示例Prompt

**功能：**
- 按质量评分排序示例
- 显示示例分类和评分
- 支持点击示例直接应用

**核心代码：**
```typescript
import React, { useMemo } from 'react'
import { VIDPROM_EXCELLENT_EXAMPLES } from '../knowledge/vidprom-examples'

interface ExamplePromptWindowProps {
  cardType: string
  onExampleSelect: (content: string) => void
}

interface ExampleItem {
  id: string
  content: string
  category: string
  score: number
  tags: string[]
}

const ExamplePromptWindow: React.FC<ExamplePromptWindowProps> = ({
  cardType,
  onExampleSelect
}) => {
  const examples = useMemo(() => {
    // 根据卡片类型过滤示例
    const filtered = VIDPROM_EXCELLENT_EXAMPLES.filter(example =>
      example.tags.includes(cardType)
    )

    // 按评分排序
    return filtered.sort((a, b) => b.score - a.score)
  }, [cardType])

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">
          优秀示例 ({examples.length})
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          点击示例可直接应用到卡片
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {examples.map((example, index) => (
            <div
              key={index}
              className="p-3 bg-white rounded-lg border border-gray-200 hover:border-green-400 cursor-pointer transition-colors"
              onClick={() => onExampleSelect(example.content)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                  {example.score}分
                </span>
                <span className="text-xs text-gray-500">{example.category}</span>
              </div>
              <p className="text-xs text-gray-600 line-clamp-3">{example.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ExamplePromptWindow
```

### 4. 卡片组件修改 (CardComponent.tsx)

**职责：** 卡片编辑功能

**修改：**
- 移除弹窗交互
- 优化按钮文字和功能
- 保持编辑功能不变

**核心代码修改：**
```typescript
// CardComponent.tsx
const CardComponent: React.FC<CardComponentProps> = ({ card }) => {
  // ... 其他功能保持不变

  return (
    <div className={getCardWrapperClass()} onClick={() => setActiveCard(card.id)}>
      {/* 卡片内容编辑区域 */}
      <div className="mb-4">
        <input
          type="text"
          value={editTitle}
          onChange={handleTitleChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold"
        />
      </div>

      <div className="mb-4">
        <textarea
          rows={4}
          value={editContent}
          onChange={handleContentChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {/* 交互按钮 */}
      <div className="flex gap-2">
        <button
          className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition"
          onClick={(e) => {
            e.stopPropagation()
            alert('请在左侧预制提示词选择器中选择要应用的提示词')
          }}
        >
          🎯 选择预制提示词
        </button>
        <button
          className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition"
          onClick={handleDeleteClick}
        >
          <i className="fa fa-trash"></i>
        </button>
      </div>
    </div>
  )
}
```

## 状态管理增强

### preset.store.ts 增强

**新增功能：**
- 搜索功能
- 按使用次数排序
- 分类获取预制提示词

```typescript
// src/stores/preset.store.ts
import { create } from 'zustand'
import { VIDPROM_PRESET_OPTIONS } from '../knowledge/vidprom-preset-options'

interface PresetItem {
  id: string
  name: string
  content: string
  type: string
  category: string
  usageCount: number
  tags: string[]
}

interface PresetStore {
  presets: PresetItem[]
  init: () => void
  getByType: (type: string) => PresetItem[]
  incrementUsage: (id: string) => void
  search: (term: string, type?: string) => PresetItem[]
  getMostUsed: (limit: number) => PresetItem[]
  getByCategory: (category: string) => PresetItem[]
}

export const usePresetStore = create<PresetStore>((set, get) => ({
  presets: [],

  init: () => {
    const items: PresetItem[] = []
    Object.entries(VIDPROM_PRESET_OPTIONS).forEach(([type, presets]) => {
      presets.forEach(preset => {
        items.push({
          id: `${type}-${preset.name}`,
          name: preset.name,
          content: preset.content,
          type,
          category: preset.category || '通用',
          usageCount: preset.usageCount || 0,
          tags: preset.tags || []
        })
      })
    })

    set({ presets: items })
  },

  getByType: (type: string) => {
    return get().presets.filter(p => p.type === type)
  },

  incrementUsage: (id: string) => {
    set(state => ({
      presets: state.presets.map(p =>
        p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p
      )
    }))
  },

  search: (term: string, type?: string) => {
    let results = get().presets

    if (type) {
      results = results.filter(p => p.type === type)
    }

    if (term) {
      const lowerTerm = term.toLowerCase()
      results = results.filter(p =>
        p.name.toLowerCase().includes(lowerTerm) ||
        p.content.toLowerCase().includes(lowerTerm)
      )
    }

    return results
  },

  getMostUsed: (limit: number) => {
    return get().presets
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit)
  },

  getByCategory: (category: string) => {
    return get().presets.filter(p => p.category === category)
  }
}))
```

### example.store.ts 新增

**功能：** 管理示例数据

```typescript
// src/stores/example.store.ts
import { create } from 'zustand'
import { VIDPROM_EXCELLENT_EXAMPLES } from '../knowledge/vidprom-examples'

interface ExampleItem {
  id: string
  content: string
  category: string
  score: number
  tags: string[]
}

interface ExampleStore {
  examples: ExampleItem[]
  init: () => void
  getByType: (type: string) => ExampleItem[]
  getTopRated: (type: string, limit: number) => ExampleItem[]
  search: (term: string, type?: string) => ExampleItem[]
}

export const useExampleStore = create<ExampleStore>((set, get) => ({
  examples: [],

  init: () => {
    const items: ExampleItem[] = VIDPROM_EXCELLENT_EXAMPLES.map(example => ({
      id: example.id,
      content: example.content,
      category: example.category,
      score: example.score,
      tags: example.tags || []
    }))

    set({ examples: items })
  },

  getByType: (type: string) => {
    return get().examples.filter(e => e.tags.includes(type))
  },

  getTopRated: (type: string, limit: number) => {
    return get().examples
      .filter(e => e.tags.includes(type))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  },

  search: (term: string, type?: string) => {
    let results = get().examples

    if (type) {
      results = results.filter(e => e.tags.includes(type))
    }

    if (term) {
      const lowerTerm = term.toLowerCase()
      results = results.filter(e =>
        e.content.toLowerCase().includes(lowerTerm)
      )
    }

    return results
  }
}))
```

## 数据模型

### PresetItem 预制提示词类型

```typescript
interface PresetItem {
  id: string                 // 唯一标识符
  name: string               // 名称
  content: string            // 内容
  type: string               // 卡片类型
  category: string           // 分类
  usageCount: number         // 使用次数
  tags: string[]             // 标签
}
```

### ExampleItem 示例类型

```typescript
interface ExampleItem {
  id: string                 // 唯一标识符
  content: string            // 内容
  category: string           // 分类
  score: number              // 评分（0-100）
  tags: string[]             // 标签
}
```

## 实现计划

### 第一阶段：基础架构

1. 创建 `CreativeMode.tsx` 主组件
2. 创建 `PresetSelector.tsx` 组件
3. 创建 `ExamplePromptWindow.tsx` 组件
4. 修改 `CardComponent.tsx` 交互逻辑
5. 在 `App.tsx` 中集成创意模式页面

### 第二阶段：功能实现

1. 实现类型导航和搜索功能
2. 实现预制提示词筛选和应用
3. 实现示例展示和应用功能
4. 增强状态管理
5. 优化响应式设计

### 第三阶段：优化完善

1. 优化搜索和筛选算法
2. 添加加载状态和错误处理
3. 优化动画和过渡效果
4. 增加键盘快捷键支持
5. 完善测试和文档

## 技术要点

### 响应式设计

使用 Tailwind CSS 实现自适应布局：

```css
/* 基础布局 */
.flex { display: flex }
.flex-col { flex-direction: column }
.h-full { height: 100% }
.overflow-hidden { overflow: hidden }
.w-1/3 { width: 33.3333% }
.border-r { border-right-width: 1px }

/* 卡片样式 */
.bg-white { background-color: #ffffff }
.rounded-lg { border-radius: 0.5rem }
.border { border-width: 1px }
.border-gray-200 { border-color: #e5e7eb }
.hover:border-blue-400 { border-color: #60a5fa }
.p-3 { padding: 0.75rem }
.cursor-pointer { cursor: pointer }

/* 响应式断点 */
@media (max-width: 1024px) {
  .w-1/3 { width: 50% }
}

@media (max-width: 768px) {
  .w-1/3 { width: 100% }
}
```

### 性能优化

1. **使用 React.memo 优化组件**：
   ```typescript
   export default React.memo(CardComponent)
   ```

2. **使用 useMemo 优化计算**：
   ```typescript
   const filteredPresets = useMemo(() =>
     presets.filter(preset =>
       preset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
       preset.content.toLowerCase().includes(searchTerm.toLowerCase())
     ), [presets, searchTerm]
   )
   ```

3. **懒加载组件**：
   ```typescript
   const CreativeMode = React.lazy(() => import('./CreativeMode'))
   ```

### 错误处理

```typescript
// 组件内部错误处理
const CreativeMode: React.FC = () => {
  const [error, setError] = useState<string | null>(null)

  try {
    // 组件逻辑
  } catch (err) {
    setError(err instanceof Error ? err.message : '未知错误')
  }

  if (error) {
    return (
      <div className="p-4 text-red-700 bg-red-50 rounded-lg">
        <h3 className="font-semibold mb-2">加载失败</h3>
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm"
        >
          重试
        </button>
      </div>
    )
  }

  // 正常渲染
  return <div>...</div>
}
```

## 测试计划

### 单元测试

```typescript
// tests/CreativeMode.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import CreativeMode from '../src/components/CreativeMode'

test('渲染创意模式页面', () => {
  render(<CreativeMode />)
  expect(screen.getByText('🎨 创意模式')).toBeInTheDocument()
})

test('类型导航功能', () => {
  render(<CreativeMode />)
  fireEvent.click(screen.getByText('主体'))
  expect(screen.getByText('主体')).toBeInTheDocument()
})

test('搜索功能', () => {
  render(<CreativeMode />)
  const searchInput = screen.getByPlaceholderText('搜索预制提示词...')
  fireEvent.change(searchInput, { target: { value: '风景' } })
  expect(searchInput).toHaveValue('风景')
})
```

### 集成测试

```typescript
// tests/integration.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../src/App'

test('从编辑模式切换到创意模式', async () => {
  render(<App />)

  // 点击创意模式标签
  fireEvent.click(screen.getByText('创意模式'))

  // 验证创意模式页面是否显示
  expect(await screen.findByText('🎨 创意模式')).toBeInTheDocument()
})

test('预制提示词选择和应用', async () => {
  render(<App />)

  // 激活创意模式
  fireEvent.click(screen.getByText('创意模式'))

  // 选择主体类型
  fireEvent.click(screen.getByText('主体'))

  // 等待预制提示词加载
  await waitFor(() => {
    expect(screen.getByText('风景')).toBeInTheDocument()
  })

  // 点击风景预制提示词
  fireEvent.click(screen.getByText('风景'))

  // 验证是否添加到卡片内容中
  expect(screen.getByText('风景')).toBeInTheDocument()
})
```

## 总结

本设计文档详细说明了创意模式页面的完善方案，包括：

1. 分栏式布局的整体架构
2. 三个主要组件的设计和功能
3. 状态管理和数据模型
4. 实现计划和技术要点
5. 测试计划

该方案提供了清晰的视觉层次、直观的交互流程和完整的功能实现，能够满足用户对创意模式页面的需求，提高了操作效率和用户体验。
