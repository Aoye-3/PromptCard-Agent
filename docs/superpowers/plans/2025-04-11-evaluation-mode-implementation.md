# 评估模式实现方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于官方Sora/Veo Prompt Guide知识库，实现Prompt智能评分、自动优化建议、一键应用等完整评估模式功能

**Architecture:** 三层解耦架构：
1. 知识层：将官方Prompt Guide文档结构化处理，构建本地知识库，支持RAG检索
2. 服务层：实现API服务层，对接大模型和知识库，提供智能评分、建议生成接口
3. 前端层：实现评估模式UI界面，评分可视化展示、优化建议列表、一键应用功能

**Tech Stack:** React + TypeScript + 本地RAG检索 + 大模型API对接 + TailwindCSS

---

## 任务列表

### Task 1: 官方Prompt Guide文档处理与知识库构建
**Files:**
- Create: `src\knowledge\prompt-guide-processor.ts`
- Create: `src\knowledge\prompt-guide-data.ts`
- Modify: `f:\.workSpace\IICL-CardInterface\NewVison\Prompt Guide\*.md`

- [ ] **Step 1: 提取veo3.1_prompting_guide.md结构化内容**
```typescript
// 提取官方指南的核心评分规则、最佳实践、常见问题等内容
export const PROMPT_GUIDE_KNOWLEDGE = {
  scoringRules: [
    { dimension: "完整性", weight: 25, criteria: "是否包含主体/动作/场景/风格/镜头/灯光/时序/音频/约束完整要素" },
    { dimension: "细节度", weight: 25, criteria: "描述是否具体，是否包含足够的细节和限定词" },
    { dimension: "合规性", weight: 20, criteria: "是否符合官方Prompt规范，是否包含违禁内容" },
    { dimension: "结构合理性", weight: 20, criteria: "结构是否清晰，要素顺序是否合理" },
    { dimension: "创新性", weight: 10, criteria: "是否有独特的创意和设计" }
  ],
  bestPractices: [/* 从指南提取的最佳实践列表 */],
  optimizationSuggestions: [/* 常见优化建议库 */]
}
```

- [ ] **Step 2: 提取video_prompt_library.md优秀案例库**
```typescript
export const EXCELLENT_PROMPT_EXAMPLES = [
  {
    category: "自然风景",
    content: "示例Prompt内容",
    score: 95,
    reason: "要素完整，细节丰富，结构合理"
  },
  // 更多优秀案例
]
```

- [ ] **Step 3: 构建本地RAG检索函数**
```typescript
// 实现基于关键词的本地知识库检索
export const searchKnowledge = (keyword: string, type: 'rule' | 'example' | 'suggestion') => {
  // 检索逻辑
  return matchedResults
}
```

---

### Task 2: 智能评分服务层实现
**Files:**
- Create: `src\services\evaluation-service.ts`
- Modify: `src\utils\promptScorer.ts`

- [ ] **Step 1: 实现基于知识库的智能评分函数**
```typescript
export interface EvaluationResult {
  totalScore: number
  dimensionScores: {
    completeness: { score: number, desc: string }
    detail: { score: number, desc: string }
    compliance: { score: number, desc: string }
    structure: { score: number, desc: string }
    innovation: { score: number, desc: string }
  }
  suggestions: {
    id: string
    type: 'add' | 'modify' | 'delete'
    title: string
    description: string
    applyContent?: string // 一键应用的内容
    cardType?: string // 对应的卡片类型
    priority: 'high' | 'medium' | 'low'
  }[]
  excellentSimilarExamples: any[]
}

export const evaluatePrompt = async (prompt: string, cards: any[]): Promise<EvaluationResult> => {
  // 1. 基于知识库规则评分
  // 2. 匹配优秀案例计算相似度
  // 3. 生成针对性优化建议
  return result
}
```

- [ ] **Step 2: 对接大模型API扩展评分能力（可选扩展）**
```typescript
// 预留API对接接口
export const evaluatePromptWithLLM = async (prompt: string): Promise<EvaluationResult> => {
  // 调用大模型API获取更专业的评分和建议
  // 本地规则和大模型结果融合
}
```

---

### Task 3: 评估模式前端UI实现
**Files:**
- Modify: `src\App.tsx`
- Create: `src\components\EvaluationPanel.tsx`

- [ ] **Step 1: 实现评分总览区域UI**
```tsx
// 总评分展示，进度条可视化，评分等级（优秀/良好/一般/较差）
const ScoreOverview = ({ score }: { score: number }) => {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-100">
      <div className="flex items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-4xl font-bold">
          {score}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-semibold mb-2">Prompt质量评分</h3>
          <p className="text-gray-600 mb-3">{getScoreLevel(score)}</p>
          {/* 一键优化按钮 */}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 实现维度评分展示区域**
```tsx
// 五个维度的评分进度条，每个维度的说明
const DimensionScores = ({ dimensionScores }: any) => {
  return (
    <div className="space-y-4 mt-6">
      <h4 className="font-medium text-gray-800">分维度评分</h4>
      {/* 每个维度的进度条+说明 */}
    </div>
  )
}
```

- [ ] **Step 3: 实现优化建议列表区域**
```tsx
// 每个建议包含标题、描述、优先级、一键应用按钮
const OptimizationSuggestions = ({ suggestions, onApply }: any) => {
  return (
    <div className="space-y-3 mt-6">
      <h4 className="font-medium text-gray-800">可优化建议</h4>
      {suggestions.map(suggestion => (
        <div key={suggestion.id} className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(suggestion.priority)}`}>
                  {getPriorityText(suggestion.priority)}
                </span>
                <h5 className="font-medium text-gray-800">{suggestion.title}</h5>
              </div>
              <p className="text-sm text-gray-600">{suggestion.description}</p>
            </div>
            <button 
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded text-sm font-medium transition"
              onClick={() => onApply(suggestion)}
            >
              一键应用
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

### Task 4: 一键应用功能实现
**Files:**
- Modify: `src\App.tsx`
- Modify: `src\stores\card.store.ts`

- [ ] **Step 1: 实现建议应用逻辑**
```typescript
const handleApplySuggestion = (suggestion: any) => {
  if (suggestion.type === 'add') {
    // 添加新卡片
    addCard(suggestion.cardType, suggestion.title, suggestion.applyContent)
  } else if (suggestion.type === 'modify') {
    // 修改现有卡片内容
    updateCard(suggestion.targetCardId, { content: suggestion.applyContent })
  } else if (suggestion.type === 'delete') {
    // 删除不必要的卡片
    removeCard(suggestion.targetCardId)
  }
  alert('已成功应用优化建议！')
}
```

- [ ] **Step 2: 实现一键优化全部功能**
```typescript
const handleOptimizeAll = () => {
  // 批量应用所有高优先级建议
  suggestions.filter(s => s.priority === 'high').forEach(s => handleApplySuggestion(s))
  alert('已应用全部高优先级优化建议！')
}
```

---

### Task 5: 集成与测试优化
**Files:**
- Modify: `src\App.tsx`
- Modify: `src\styles\global.css`

- [ ] **Step 1: 评估模式标签页集成**
- [ ] **Step 2: 切换标签页自动触发评分计算**
- [ ] **Step 3: 加载状态与错误处理**
- [ ] **Step 4: 响应式适配优化**
- [ ] **Step 5: 交互体验优化（评分动画、应用反馈等）**

---

## 执行选择
方案已全部规划完成，包含了从知识库构建到前端UI、功能实现的全流程。两种执行方式：
1. **Subagent-Driven（推荐）**：我会分配子任务给独立子agent开发，自动进行代码review，速度更快
2. **Inline Execution**：在当前会话逐步开发，每完成一个模块展示给你确认

选择哪种方式开发？
">