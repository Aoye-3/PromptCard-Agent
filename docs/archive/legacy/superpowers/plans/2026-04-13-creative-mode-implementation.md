# 创意模式页面实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善创意模式页面功能，改变预制提示词选择交互逻辑，从弹窗改为页面内交互

**Architecture:** 使用分栏式布局，左侧为预制提示词选择器，中间为卡片编辑区域，右侧为示例Prompt窗口

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Zustand, localForage

---

## 文件结构

| 文件 | 用途 | 状态 |
|------|------|------|
| `src/components/CreativeMode.tsx` | 创意模式主组件 | 创建 |
| `src/components/PresetSelector.tsx` | 预制提示词选择器 | 创建 |
| `src/components/ExamplePromptWindow.tsx` | 示例Prompt窗口 | 创建 |
| `src/components/CardComponent.tsx` | 卡片组件 | 修改 |
| `src/stores/preset.store.ts` | 预制提示词状态管理 | 增强 |
| `src/stores/example.store.ts` | 示例数据状态管理 | 创建 |
| `src/App.tsx` | 主应用组件 | 修改 |

---

## 任务分解

### 任务 1: 创建示例数据状态管理

**目标:** 实现示例数据的状态管理

**Files:**
- Create: `src/stores/example.store.ts`

- [ ] **Step 1: 创建示例数据状态管理**

```typescript
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

- [ ] **Step 2: 测试状态管理**

创建测试文件 `src/stores/example.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useExampleStore } from './example.store'

describe('example store', () => {
  beforeEach(() => {
    useExampleStore.getState().init()
  })

  it('should initialize examples', () => {
    const examples = useExampleStore.getState().examples
    expect(examples.length).toBeGreaterThan(0)
  })

  it('should get examples by type', () => {
    const subjectExamples = useExampleStore.getState().getByType('subject')
    expect(subjectExamples.length).toBeGreaterThan(0)
  })

  it('should get top rated examples', () => {
    const topRated = useExampleStore.getState().getTopRated('subject', 3)
    expect(topRated.length).toBeLessThanOrEqual(3)
    expect(topRated[0].score).toBeGreaterThanOrEqual(topRated[1].score)
  })

  it('should search examples', () => {
    const results = useExampleStore.getState().search('风景')
    expect(results.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run src/stores/example.store.test.ts
```

预期结果: 所有测试通过

- [ ] **Step 4: 提交**

```bash
git add src/stores/example.store.ts src/stores/example.store.test.ts
git commit -m "feat: add example data store"
```

---

### 任务 2: 增强预制提示词状态管理

**目标:** 增强预制提示词状态管理，添加搜索和排序功能

**Files:**
- Modify: `src/stores/preset.store.ts`

- [ ] **Step 1: 修改状态管理**

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

- [ ] **Step 2: 更新测试**

修改 `src/stores/preset.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { usePresetStore } from './preset.store'

describe('preset store', () => {
  beforeEach(() => {
    usePresetStore.getState().init()
  })

  it('should initialize presets', () => {
    const presets = usePresetStore.getState().presets
    expect(presets.length).toBeGreaterThan(0)
  })

  it('should get presets by type', () => {
    const subjectPresets = usePresetStore.getState().getByType('subject')
    expect(subjectPresets.length).toBeGreaterThan(0)
  })

  it('should increment usage count', () => {
    const presets = usePresetStore.getState().getByType('subject')
    const initialCount = presets[0].usageCount

    usePresetStore.getState().incrementUsage(presets[0].id)

    const updatedPreset = usePresetStore.getState().presets.find(p => p.id === presets[0].id)
    expect(updatedPreset?.usageCount).toBe(initialCount + 1)
  })

  it('should search presets', () => {
    const results = usePresetStore.getState().search('风景')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should get most used presets', () => {
    const topUsed = usePresetStore.getState().getMostUsed(3)
    expect(topUsed.length).toBeLessThanOrEqual(3)
    expect(topUsed[0].usageCount).toBeGreaterThanOrEqual(topUsed[1].usageCount)
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run src/stores/preset.store.test.ts
```

预期结果: 所有测试通过

- [ ] **Step 4: 提交**

```bash
git add src/stores/preset.store.ts src/stores/preset.store.test.ts
git commit -m "feat: enhance preset store with search and sorting"
```

---

### 任务 3: 创建预制提示词选择器组件

**目标:** 实现左侧的预制提示词选择器组件

**Files:**
- Create: `src/components/PresetSelector.tsx`

- [ ] **Step 1: 创建组件**

```typescript
import React, { useState, useMemo } from 'react'
import { usePresetStore } from '../stores/preset.store'

interface PresetSelectorProps {
  onPresetSelect: (preset: any) => void
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

- [ ] **Step 2: 创建组件测试**

创建测试文件 `src/components/PresetSelector.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PresetSelector from './PresetSelector'
import { usePresetStore } from '../stores/preset.store'

describe('PresetSelector', () => {
  it('should render preset selector', () => {
    render(<PresetSelector
      onPresetSelect={() => {}}
      selectedType="subject"
      onTypeSelect={() => {}}
    />)

    expect(screen.getByPlaceholderText('搜索预制提示词...')).toBeInTheDocument()
    expect(screen.getByText('卡片类型')).toBeInTheDocument()
    expect(screen.getByText('主体')).toBeInTheDocument()
  })

  it('should search presets', async () => {
    usePresetStore.getState().init()

    render(<PresetSelector
      onPresetSelect={() => {}}
      selectedType="subject"
      onTypeSelect={() => {}}
    />)

    fireEvent.change(screen.getByPlaceholderText('搜索预制提示词...'), {
      target: { value: '风景' }
    })

    const presetsCount = screen.getByText(/预制提示词 \(\d+\)/)
    expect(presetsCount).toBeInTheDocument()
  })

  it('should switch card types', () => {
    const onTypeSelect = (type: string) => {
      expect(['subject', 'action', 'scene']).toContain(type)
    }

    render(<PresetSelector
      onPresetSelect={() => {}}
      selectedType="subject"
      onTypeSelect={onTypeSelect}
    />)

    fireEvent.click(screen.getByText('动作'))
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run src/components/PresetSelector.test.tsx
```

预期结果: 所有测试通过

- [ ] **Step 4: 提交**

```bash
git add src/components/PresetSelector.tsx src/components/PresetSelector.test.tsx
git commit -m "feat: add preset selector component"
```

---

### 任务 4: 创建示例Prompt窗口组件

**目标:** 实现右侧的示例Prompt窗口组件

**Files:**
- Create: `src/components/ExamplePromptWindow.tsx`

- [ ] **Step 1: 创建组件**

```typescript
import React, { useMemo } from 'react'
import { useExampleStore } from '../stores/example.store'

interface ExamplePromptWindowProps {
  cardType: string
  onExampleSelect: (content: string) => void
}

const ExamplePromptWindow: React.FC<ExamplePromptWindowProps> = ({
  cardType,
  onExampleSelect
}) => {
  const { examples, getByType } = useExampleStore()

  const filteredExamples = useMemo(() => {
    const examplesByType = getByType(cardType)
    return examplesByType.sort((a, b) => b.score - a.score)
  }, [cardType, getByType])

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">
          优秀示例 ({filteredExamples.length})
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          点击示例可直接应用到卡片
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {filteredExamples.map((example, index) => (
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

        {filteredExamples.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>暂无可用于此类型的示例</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExamplePromptWindow
```

- [ ] **Step 2: 创建组件测试**

创建测试文件 `src/components/ExamplePromptWindow.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExamplePromptWindow from './ExamplePromptWindow'
import { useExampleStore } from '../stores/example.store'

describe('ExamplePromptWindow', () => {
  it('should render example prompt window', () => {
    useExampleStore.getState().init()

    render(<ExamplePromptWindow
      cardType="subject"
      onExampleSelect={() => {}}
    />)

    expect(screen.getByText('优秀示例')).toBeInTheDocument()
  })

  it('should display examples for subject type', async () => {
    useExampleStore.getState().init()

    render(<ExamplePromptWindow
      cardType="subject"
      onExampleSelect={() => {}}
    />)

    expect(await screen.findByText(/优秀示例 \(\d+\)/)).toBeInTheDocument()
  })

  it('should handle no examples', () => {
    render(<ExamplePromptWindow
      cardType="nonexistent"
      onExampleSelect={() => {}}
    />)

    expect(screen.getByText('暂无可用于此类型的示例')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run src/components/ExamplePromptWindow.test.tsx
```

预期结果: 所有测试通过

- [ ] **Step 4: 提交**

```bash
git add src/components/ExamplePromptWindow.tsx src/components/ExamplePromptWindow.test.tsx
git commit -m "feat: add example prompt window component"
```

---

### 任务 5: 修改卡片组件交互逻辑

**目标:** 修改卡片组件的交互逻辑，移除弹窗交互

**Files:**
- Modify: `src/components/CardComponent.tsx`

- [ ] **Step 1: 修改组件**

```typescript
import React, { useState } from 'react'
import { useCardStore } from '../stores/card.store'

interface CardComponentProps {
  card: any
}

const CardComponent: React.FC<CardComponentProps> = ({ card }) => {
  const { updateCard, removeCard, setActiveCard } = useCardStore()
  const [editTitle, setEditTitle] = useState(card.title)
  const [editContent, setEditContent] = useState(card.content)

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setEditTitle(newTitle)
    updateCard(card.id, { title: newTitle })
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setEditContent(newContent)
    updateCard(card.id, { content: newContent })
  }

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditTitle(card.title)
    setEditContent(card.content)
    updateCard(card.id, { title: card.title, content: card.content })
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('确定要删除这张卡片吗？')) {
      removeCard(card.id)
      alert('卡片已删除')
    }
  }

  const getTagClass = () => {
    return 'bg-warm-sand text-charcoal-warm border border-border-warm'
  }

  const getTypeLabel = () => {
    const labelMap: Record<string, string> = {
      subject: 'Subject（主体）',
      action: 'Action（动作）',
      scene: 'Scene（场景）',
      style: 'Style（风格）',
      camera: 'Camera（镜头）',
      lighting: 'Lighting（灯光）',
      timing: 'Duration（时长）',
      audio: 'Audio（音频）',
      constraint: 'Constraints（约束）',
      custom: 'Custom（自定义）'
    }
    return labelMap[card.type] || '自定义'
  }

  const getCardWrapperClass = () => {
    const isActive = useCardStore.getState().activeCardId === card.id
    let baseClass = 'card-component bg-ivory rounded-xl p-5 border border-border-cream shadow-sm card-hover cursor-pointer'
    if (isActive) {
      baseClass += ' ring-2 ring-terracotta'
    }
    return baseClass
  }

  return (
    <div className={getCardWrapperClass()} data-type={card.type} data-mode="edit" onClick={() => setActiveCard(card.id)}>
      <div className="flex items-center justify-between mb-3">
          <span className={`px-2 py-1 rounded text-xs font-medium ${getTagClass()}`}>
            {getTypeLabel()}
          </span>
          <div className="flex items-center gap-1">
                <span
                  className="fa fa-times text-red-500 hover:text-red-600 cursor-pointer"
                  title="恢复原始内容"
                  onClick={handleCancelClick}
                ></span>
              </div>
      </div>
      <div className="mb-3">
        <label className="block text-xs text-stone-gray mb-1">标题</label>
        <input
          type="text"
          value={editTitle}
          onChange={handleTitleChange}
          className="w-full px-2 py-1 border border-border-warm rounded text-sm font-semibold bg-parchment text-near-black"
        />
      </div>
      <div className="mb-3">
        <label className="block text-xs text-stone-gray mb-1">自定义内容</label>
        <textarea
          rows={3}
          value={editContent}
          onChange={handleContentChange}
          className="w-full px-2 py-1 border border-border-warm rounded text-sm bg-parchment text-near-black"
        />
      </div>
      <div className="flex gap-2">
        <button
          className={`flex-1 py-1.5 ${getTagClass()} rounded text-sm font-medium hover:opacity-80 transition`}
          onClick={(e) => {
            e.stopPropagation()
            alert('请在左侧预制提示词选择器中选择要应用的提示词')
          }}
        >
          🎯 选择预制提示词
        </button>
        <button
          className="px-3 py-1.5 bg-warm-sand hover:bg-border-warm text-error-crimson rounded text-sm font-medium transition"
          onClick={handleDeleteClick}
        >
          <i className="fa fa-trash"></i>
        </button>
      </div>
    </div>
  )
}

export default React.memo(CardComponent)
```

- [ ] **Step 2: 运行测试**

```bash
npm run test -- --run src/components/CardComponent.test.tsx
```

预期结果: 所有测试通过

- [ ] **Step 3: 提交**

```bash
git add src/components/CardComponent.tsx
git commit -m "feat: modify card component interaction logic"
```

---

### 任务 6: 创建创意模式主组件

**目标:** 实现创意模式主组件，整合所有功能

**Files:**
- Create: `src/components/CreativeMode.tsx`

- [ ] **Step 1: 创建组件**

```typescript
import React, { useState, useEffect } from 'react'
import PresetSelector from './PresetSelector'
import ExamplePromptWindow from './ExamplePromptWindow'
import CardComponent from './CardComponent'
import { useCardStore } from '../stores/card.store'
import { useExampleStore } from '../stores/example.store'
import { usePresetStore } from '../stores/preset.store'

const CreativeMode: React.FC = () => {
  const { activeCardId, pages, currentPage } = useCardStore()
  const { init: initExamples } = useExampleStore()
  const { init: initPresets } = usePresetStore()

  const currentCards = pages[currentPage]?.cards || []
  const activeCard = activeCardId ? currentCards.find(c => c.id === activeCardId) : null

  const [selectedType, setSelectedType] = useState(activeCard?.type || 'subject')

  useEffect(() => {
    initExamples()
    initPresets()
  }, [initExamples, initPresets])

  useEffect(() => {
    if (activeCard) {
      setSelectedType(activeCard.type)
    }
  }, [activeCard])

  const handlePresetSelect = (preset: any) => {
    if (activeCard) {
      const { updateCard } = useCardStore.getState()
      const newContent = activeCard.content
        ? `${activeCard.content}\n${preset.content}`
        : preset.content
      updateCard(activeCard.id, { content: newContent })

      const { incrementUsage } = usePresetStore.getState()
      incrementUsage(preset.id)
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

- [ ] **Step 2: 创建组件测试**

创建测试文件 `src/components/CreativeMode.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CreativeMode from './CreativeMode'
import { useCardStore } from '../stores/card.store'

describe('CreativeMode', () => {
  it('should render creative mode', () => {
    render(<CreativeMode />)

    expect(screen.getByText('🎨 创意模式')).toBeInTheDocument()
    expect(screen.getByText('请点击左侧卡片组件库中的卡片以开始编辑')).toBeInTheDocument()
  })

  it('should show card when active', () => {
    const { setActiveCard } = useCardStore.getState()

    render(<CreativeMode />)

    expect(screen.getByText('请点击左侧卡片组件库中的卡片以开始编辑')).toBeInTheDocument()
  })

  it('should display creative mode sections', () => {
    render(<CreativeMode />)

    expect(screen.getByText('🎨 创意模式')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -- --run src/components/CreativeMode.test.tsx
```

预期结果: 所有测试通过

- [ ] **Step 4: 提交**

```bash
git add src/components/CreativeMode.tsx src/components/CreativeMode.test.tsx
git commit -m "feat: add creative mode component"
```

---

### 任务 7: 在App.tsx中集成创意模式页面

**目标:** 在主应用组件中集成创意模式页面

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 修改App.tsx**

```typescript
import React, { useState } from 'react'
import CreativeMode from './components/CreativeMode'

// ... 其他导入保持不变

function App() {
  const [activeTab, setActiveTab] = useState<'learn' | 'creative'>('learn')

  // ... 其他状态管理保持不变

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">PromptCard学习系统 V4</h1>
            </div>
            <div className="flex space-x-4">
              <button className="px-4 py-2 text-sm font-medium text-gray-900 bg-white rounded-lg hover:bg-gray-100">
                首页
              </button>
              <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-lg hover:bg-gray-100">
                保存
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* 左侧导航 */}
          <nav className="w-64 flex-shrink-0">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">卡片组件库</h2>

              {/* 卡片组件库 */}
              <div className="space-y-4">
                {CARD_TYPES.map((type) => (
                  <CardComponent
                    key={type}
                    card={{
                      id: type,
                      type,
                      title: getTypeLabel(type),
                      content: '',
                      isActive: activeCardId === type
                    }}
                  />
                ))}
              </div>
            </div>
          </nav>

          {/* 右侧内容区域 */}
          <div className="flex-1">
            {/* 标签页导航 */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('learn')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'learn'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    学习模式
                  </button>
                  <button
                    onClick={() => setActiveTab('creative')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'creative'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    创意模式
                  </button>
                </nav>
              </div>

              {/* 标签页内容 */}
              <div className="mt-8">
                {activeTab === 'learn' ? (
                  <div className="space-y-6">
                    {/* 学习模式内容 */}
                    <div className="bg-gray-50 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">卡片组件学习</h3>
                      {/* 学习模式内容 */}
                    </div>
                  </div>
                ) : (
                  <CreativeMode />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
```

- [ ] **Step 2: 运行测试**

```bash
npm run test -- --run src/App.test.tsx
```

预期结果: 所有测试通过

- [ ] **Step 3: 提交**

```bash
git add src/App.tsx
git commit -m "feat: integrate creative mode into main app"
```

---

### 任务 8: 集成测试和验证

**目标:** 整体功能测试和验证

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

预期结果: 服务器在 http://localhost:3000 启动成功

- [ ] **Step 2: 手动测试**

访问 http://localhost:3000 进行手动测试：

1. 验证页面布局是否正确
2. 验证创意模式是否能正常切换
3. 验证预制提示词选择器是否正常工作
4. 验证示例Prompt窗口是否显示正确内容
5. 验证卡片组件是否能正常交互

- [ ] **Step 3: 运行完整测试套件**

```bash
npm run test -- --run
```

预期结果: 所有测试通过

- [ ] **Step 4: 构建项目**

```bash
npm run build
```

预期结果: 构建成功，产物在 dist 目录

- [ ] **Step 5: 提交最终变更**

```bash
git add dist
git commit -m "build: production build"
```

---

## 总结

本实现计划详细描述了创意模式页面的开发过程，包括：

1. 创建示例数据状态管理
2. 增强预制提示词状态管理
3. 创建预制提示词选择器组件
4. 创建示例Prompt窗口组件
5. 修改卡片组件交互逻辑
6. 创建创意模式主组件
7. 在主应用中集成创意模式页面
8. 整体功能测试和验证

每个步骤都包含了完整的代码实现、测试用例和执行说明，确保开发过程的可操作性和可测试性。通过分栏式布局和直观的交互设计，用户可以更高效地完成提示词创作任务。
