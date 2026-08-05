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
| 补全 | `complete` | `append`：只追加新的用户段，不改已有内容 |
| 改写（产品文案也称“重写”） | `rewrite` | 有有效选区时 `rewrite_selection`；否则 `rewrite_all` |
| Prompt 库调取 | `prompt-library` | 只读搜索 Prompt 及其 `meta.media` 关联信息，不产生 Canvas 提案 |

6. Agent 返回差异提案。用户确认前不修改画布。发送成功后，输入、节点标签、选区、模式和一次性 Skill 自动清空；请求失败时保留，便于重试。

## Attachment roles and mentions

节点角色是真正的权限边界：

- `targetNodeId`：最多一个，是本轮唯一可写节点；
- `referenceNodeIds`：最多九个，只能读取；
- `mentions`：只能引用已挂载节点，用于解释语义关系，不能提升权限、改变目标或扩大工具范围；
- 没有目标时可以进行普通讨论，但不能产生 Canvas 写入提案。

画布右键菜单提供两条不同的入口语义：“补全”是快捷操作，会直接把节点挂载为被修改对象并切换到补全模式；“发送到 Agent”只把节点加入参考池，因此不会隐式赋予写权限。

前端不会把节点正文拼进可见消息。它只发送用户可见文本、节点 ID、角色、名称、模式、mentions 和可选选区元数据。Gateway 从当前项目的 `workspaceContext.snapshot` 按 ID 解析真实节点内容，并重新校验节点类型、项目归属和角色关系。

## Prompt Library lookup mode

普通 Agent 对话、补全和改写不会隐式注入或检索 Prompt Library。只有用户在输入框下方显式选择 **Prompt 库调取** 后，前端才把 Prompt 快照随本轮请求发送，并把 `canvasNodeContext.mode` 设为 `prompt-library`。

该模式遵守以下只读边界：

- 进入模式时清空被修改对象和文本选区；当前已挂载节点只能作为只读参考；
- 请求的 `targetNodeId` 必须为 `null`，Runtime 不开放 Canvas 写入工具，也不接受 Canvas 创建或更新提案；
- 前端最多发送 200 条 Prompt，保留 `id`、`type`、`category`、`label`、`content` 和 `meta`；Runtime 只使用前 100 条；
- `search_prompt_library` 只匹配随请求提供的 Prompt，并可把 `meta.media` 中的素材关联作为回答依据；它不会读取未随请求提供的库记录，也不会写入 Prompt Library。

对话历史区是独立的纵向滚动容器，不会随底部编辑器一起滚动。用户消息右对齐，Agent 消息左对齐；发送或收到新消息时历史区滚动到最新消息。Runtime 校验失败时，编辑器上方显示错误摘要：Prompt 条目超限会显示实际数量和上限，其他原始校验错误会压缩空白并截断为最多 240 个字符，便于定位请求边界问题。

## Selection rewrite

局部重写只允许作用于目标节点的 `userText`：

- 选区必须完整落在用户段内，不能跨越模板段或来自其他节点；
- 偏移采用浏览器 UTF-16 字符索引，Gateway 使用相同语义校验，包括 emoji 等代理对字符；
- 请求携带 `start`、`end`、`selectedText` 和 `baseContentDigest`；
- 选区失效、正文变化或摘要不一致时，Gateway 拒绝请求并要求重新选择。

## Proposal and apply boundary

Canvas Agent 继续使用统一的 `free_canvas_text_update` 提案：

```ts
{
  kind: "free_canvas_text_update"
  editMode: "append" | "rewrite_all" | "rewrite_selection"
  userText: string
  selection?: { start: number; end: number; selectedText: string }
  baseNodeRevision: number
  templateDigest: string
  baseContentDigest: string
}
```

模型工具 schema 不接受任意节点 ID、模板内容或编辑模式。Gateway 根据已校验请求注入目标和 `editMode`，并移除模型伪造的节点、模式、revision、选区和摘要。

应用提案前，前端再次检查：

- 目标节点仍存在且仍为文本节点；
- `baseNodeRevision` 未变化；
- `templateDigest` 未变化；
- `baseContentDigest` 未变化；
- 局部重写的选区原文仍完全一致。

任一检查失败都不会写入，也不会把提案误标为已批准。

## Skill binding

Free Canvas 提示词编辑入口确定性绑定第一方 `canvas-prompt-editor` revision 2。该 Skill 描述补全、整段重写和选区重写三种契约，并明确模板与参考节点只读。

Skill 只提供受限 instructions/references，不执行脚本，也不能授予工具、改变目标、绕过 Gateway 校验或跳过用户确认。实际运行使用的 Skill ID、revision 和 digest 会随持久化项目会话记录，便于审计。

## Related documentation

- [Free Canvas Workspace](./free-canvas.md)
- [Application Shell](./app-shell.md)
- [Frontend State Management](./state-management.md)
- [Agent Runtime API](../api/agent-runtime-api.md)
- [Skills And Tools](../backend/skills-and-tools.md)
- [ADR-016: Durable Text-Agent Conversations And Bounded Skills](../decisions/ADR-016-durable-text-agent-conversations-and-bounded-skills.md)
