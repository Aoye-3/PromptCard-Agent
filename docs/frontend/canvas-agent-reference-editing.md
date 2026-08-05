# Canvas Agent Omnireference Prompt Editing

## Purpose

“全能参考式提示词辅助编辑”把图片生成中的“一个主目标、多个参考”的交互方式应用到 Free Canvas 文本节点。用户不再把大段节点正文复制到对话框，而是挂载带稳定身份的节点标签，再用自然语言和原子化 `@节点` 描述它们之间的关系。

这一能力解决两个问题：

- 用户可以明确指出 Agent 唯一允许修改的目标，同时提供多个只读参考；
- 模板、已有用户内容和参考节点不会因为自然语言指令含糊而被静默覆盖。

## User workflow

1. 文本节点创建后显示稳定默认名称，例如 `TXT-A1B2C3`。用户可在节点顶部工具栏重命名；名称长度为 1–32 个字符、项目内忽略大小写后唯一，并且不能包含 `@`。
2. 在节点右键菜单选择 **补全**，把它加入 Agent 并设为唯一目标；选择 **发送到 Agent**，则把它加入为只读参考。
3. Agent 输入区把“被修改对象”和参考标签分开显示。被修改对象默认空置；点击选择器可从当前已挂载节点中选择唯一目标。切换目标时原目标自动降为参考，清空目标也只会把节点恢复为参考，不会删除标签。最多挂载 10 个节点，参考标签可以删除或通过右键切换为新目标。
4. 输入 `@` 后（无需在前面输入空格），只列出当前已挂载节点。选择后插入绑定 `nodeId` 的原子标签。用户可以表达“以 `@角色设定` 为目标，参考 `@材质规范` 与 `@镜头要求` 补全”等关系。
5. 在输入框下方选择本轮模式：

| 界面模式 | Runtime 模式 | 允许的结果 |
| --- | --- | --- |
| 补全 | `complete` | 在原节点内部按精确锚点穿插黑色 `user` 段，原段不变 |
| 改写（产品文案也称“重写”） | `rewrite` | 在原节点右侧创建完整派生文本节点，原节点不变 |
| Prompt 库调取 | `prompt-library` | 只读搜索 Prompt 及其 `meta.media` 关联信息，不产生 Canvas 提案 |

6. Agent 返回差异提案。用户确认前不修改画布。发送成功后，输入、节点标签、选区、模式和一次性 Skill 自动清空；请求失败时保留，便于重试。

## Attachment roles and mentions

节点角色是真正的权限边界：

- `targetNodeId`：最多一个，是本轮唯一可写节点；
- `referenceNodeIds`：最多九个，只能读取；
- `mentions`：只能引用已挂载节点，用于解释语义关系，不能提升权限、改变目标或扩大工具范围；
- 没有目标时可以进行普通讨论，但不能产生 Canvas 写入提案。

画布右键菜单提供两条不同的入口语义：“补全”是快捷操作，会直接把节点挂载为被修改对象并切换到补全模式；“发送到 Agent”只把节点加入参考池，因此不会隐式赋予写权限。

前端不会把节点正文拼进可见消息。它只发送用户可见文本、节点 ID、角色、名称、模式和 mentions。Gateway 从当前项目的 `workspaceContext.snapshot` 按 ID 解析真实节点与分段，并重新校验节点类型、项目归属和角色关系。文本选区不再参与新版改写。

## Prompt Library lookup mode

普通 Agent 对话、补全和改写不会隐式注入或检索 Prompt Library。只有用户在输入框下方显式选择 **Prompt 库调取** 后，前端才把 Prompt 快照随本轮请求发送，并把 `canvasNodeContext.mode` 设为 `prompt-library`。

该模式遵守以下只读边界：

- 进入模式时清空被修改对象和文本选区；当前已挂载节点只能作为只读参考；
- 请求的 `targetNodeId` 必须为 `null`，Runtime 不开放 Canvas 写入工具，也不接受 Canvas 创建或更新提案；
- 前端最多发送 200 条 Prompt，保留 `id`、`type`、`category`、`label`、`content` 和 `meta`；Runtime 只使用前 100 条；
- `search_prompt_library` 只匹配随请求提供的 Prompt，并可把 `meta.media` 中的素材关联作为回答依据；它不会读取未随请求提供的库记录，也不会写入 Prompt Library。

对话历史区是独立的纵向滚动容器，不会随底部编辑器一起滚动。用户消息右对齐，Agent 消息左对齐；发送或收到新消息时历史区滚动到最新消息。Runtime 校验失败时，编辑器上方显示错误摘要：Prompt 条目超限会显示实际数量和上限，其他原始校验错误会压缩空白并截断为最多 240 个字符，便于定位请求边界问题。

## Proposal and apply boundary

新版 Canvas Agent 使用统一工具 `emit_canvas_prompt_edit`，但 Gateway 按本轮模式提供不同参数 schema。模型不能提交 `nodeId` 或自行改变模式。

补全返回 `free_canvas_text_insertions`：

```ts
{
  kind: "free_canvas_text_insertions"
  nodeId: string
  insertions: Array<{
    text: string
    reason: string
    anchor:
      | { type: "segment"; segmentId: string; position: "before" | "after" }
      | { type: "text"; segmentId: string; text: string; position: "before" | "after" }
  }>
  baseNodeRevision: number
  templateDigest: string
  baseSegmentsDigest: string
  rationale: string
}
```

一次最多 16 个插入项。文本锚点必须同时指定 `segmentId` 和 `text`：前端只在该目标分段内查找该子串，且出现次数必须恰好为 1；`before`/`after` 分别在子串字符边界的前后插入。段边缘继续使用 segment 锚点。任一锚点无效时整份提案拒绝。应用可以拆分被锚定的原分段，但不能改变任何原字符、顺序、来源或颜色；新增段固定为 `source: "user"`、`color: "#111827"`。字符串按原始 UTF-16 边界切片，因此中文、emoji 和换行均保留原顺序与内容。预览先渲染完整红黑交错结果，并列出每处插入理由。

改写返回扩展的 `free_canvas_text_create`：

```ts
{
  kind: "free_canvas_text_create"
  sourceNodeId: string
  userText: string
  basis: {
    baseNodeRevision: number
    templateDigest: string
    baseSegmentsDigest: string
  }
  rationale: string
}
```

批准后使用现有避碰布局在源节点右侧创建新节点，继承宽度与字号，正文为黑色用户段，标题采用 `源名称 · 改写` 并自动去重。新节点 `meta` 记录来源节点、基准 revision、模型和 Skill provenance。

应用提案前，前端再次检查：

- 目标节点仍存在且仍为文本节点；
- `baseNodeRevision` 未变化；
- `templateDigest` 未变化；
- `baseSegmentsDigest` 未变化；
- 所有插入锚点仍精确有效，或改写的源节点仍与基准一致。

任一检查失败都不会写入，也不会把提案误标为已批准。

旧持久化 `free_canvas_text_update` 提案仍可按 revision 1/2 的旧逻辑预览、批准或拒绝，但新版会话不再生成 `append`、`rewrite_all` 或 `rewrite_selection`。

## Skill binding

Free Canvas 提示词编辑入口确定性绑定第一方 `canvas-prompt-editor` revision 3。该 Skill 要求补全先识别缺口并选择精确锚点，禁止无理由统一追加到末尾；改写只能创建完整派生节点。模板段、目标原段和参考节点全部只读。Revision 1/2 保留用于历史审计。

Skill 只提供受限 instructions/references，不执行脚本，也不能授予工具、改变目标、绕过 Gateway 校验或跳过用户确认。实际运行使用的 Skill ID、revision 和 digest 会随持久化项目会话记录，便于审计。

## Related documentation

- [Free Canvas Workspace](./free-canvas.md)
- [Application Shell](./app-shell.md)
- [Frontend State Management](./state-management.md)
- [Agent Runtime API](../api/agent-runtime-api.md)
- [Skills And Tools](../backend/skills-and-tools.md)
- [ADR-016: Durable Text-Agent Conversations And Bounded Skills](../decisions/ADR-016-durable-text-agent-conversations-and-bounded-skills.md)
