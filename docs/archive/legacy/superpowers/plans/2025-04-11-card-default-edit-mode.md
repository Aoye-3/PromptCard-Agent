# 卡片默认编辑模式实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修改卡片交互逻辑，所有卡片默认处于编辑模式，用户可以直接修改标题和内容，无需额外点击进入编辑状态。

**Architecture:**
- 调整CardComponent组件的默认渲染逻辑，优先使用编辑模式
- 修改卡片初始化时的默认mode属性为'edit'
- 保留原有编辑模式的所有功能：保存、取消、预制词选择、删除等
- 确保数据修改后正常同步到全局store

**Tech Stack:** React 18 + TypeScript + Zustand + TailwindCSS

---

### Task 1: 修改CardComponent组件默认渲染逻辑

**Files:**
- Modify: `src/components/CardComponent.tsx`

- [ ] **Step 1: 调整组件渲染优先级，默认返回编辑模式**

修改组件最后返回逻辑，将编辑模式作为默认渲染：

```tsx
// 移除原有的if (card.mode === 'edit')判断，直接渲染编辑模式
return (
  <div className={getCardWrapperClass()} data-type={card.type} data-mode="edit">
    <div className="flex items-center justify-between mb-3">
      <span className={`px-2 py-1 rounded text-xs font-medium ${getTagClass()}`}>
        {getTypeLabel()}
      </span>
      <div className="flex items-center gap-1">
              <span
                className="fa fa-check text-green-500 hover:text-green-600 cursor-pointer"
                title="保存"
                onClick={handleSaveClick}
              ></span>
              <span
                className="fa fa-times text-red-500 hover:text-red-600 cursor-pointer"
                title="取消"
                onClick={handleCancelClick}
              ></span>
            </div>
    </div>
    <div className="mb-3">
      <label className="block text-xs text-gray-500 mb-1">标题</label>
      <input
        type="text"
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-semibold"
      />
    </div>
    <div className="mb-3">
      <label className="block text-xs text-gray-500 mb-1">自定义内容</label>
      <textarea
        rows={3}
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
      />
    </div>
    <div className="flex gap-2">
      <button
        className={`flex-1 py-1.5 ${getTagClass()} rounded text-sm font-medium hover:opacity-80 transition`}
        onClick={(e) => {
          e.stopPropagation()
          setShowPresetModal(true)
        }}
      >
        🎯 选择预制提示词
      </button>
      <button
        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded text-sm font-medium transition"
        onClick={handleDeleteClick}
      >
        <i className="fa fa-trash"></i>
      </button>
    </div>

    {/* 预制选择弹窗 */}
    {showPresetModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => {
        e.stopPropagation()
        setShowPresetModal(false)
      }}>
        <div className="bg-white rounded-xl p-5 w-[500px] max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">选择预制提示词</h3>
            <i
              className="fa fa-times text-gray-400 hover:text-gray-600 cursor-pointer"
              onClick={() => setShowPresetModal(false)}
            ></i>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {presets.length > 0 ? (
              presets.map(preset => (
                <div
                  key={preset.id}
                  className="p-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition"
                  onClick={async () => {
                    setEditContent(preset.content)
                    setEditTitle(preset.label)
                    await incrementUsage(preset.id)
                    setShowPresetModal(false)
                  }}
                >
                  <div className="font-medium text-sm mb-1">{preset.label}</div>
                  <div className="text-xs text-gray-500 line-clamp-2">{preset.content}</div>
                  <div className="text-xs text-gray-400 mt-1">使用次数: {preset.usageCount}</div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                该类型暂无预制提示词
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
)
```

- [ ] **Step 2: 移除原有的浏览模式返回逻辑，删除不需要的view模式相关代码**
  删除原有的view模式return块，以及对应的handleCardClick、双击编辑等相关逻辑。

### Task 2: 调整卡片初始化默认mode为edit

**Files:**
- Modify: `src/stores/card.store.ts` (需要先确认文件路径)

- [ ] **Step 1: 查找创建卡片的逻辑，将默认mode设置为'edit'**
  找到addCard相关方法，确保新创建的卡片mode属性默认为'edit'

### Task 3: 验证交互功能正常

- [ ] **Step 1: 刷新页面，查看所有卡片是否默认显示为编辑状态**
  预期：所有卡片都显示标题输入框、内容文本框、底部操作按钮，和需求截图一致

- [ ] **Step 2: 测试修改功能**
  预期：修改标题和内容后点击保存按钮，数据正常保存；点击取消按钮，内容恢复为原始值

- [ ] **Step 3: 测试预制提示词选择功能**
  预期：点击「选择预制提示词」按钮，弹窗正常打开，选择后内容正常填充到输入框

- [ ] **Step 4: 测试删除功能**
  预期：点击删除按钮，卡片正常被移除

---

Plan complete and saved to `docs/superpowers/plans/2025-04-11-card-default-edit-mode.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?"**
