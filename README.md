<p align="center">
  <img src="./public/promptcard-manager-icon.png" alt="PromptCard-Manager icon" width="180" />
</p>

<h1 align="center">PromptCard-Manager</h1>

<p align="center"><strong>面向 AIGC 视频创作者的跨平台复制、粘贴、存储工作台</strong></p>

PromptCard-Manager 不做视频生成，也不试图替代 Runway、可灵、即梦、豆包、ComfyUI、LTX、Sora 或剪辑工具。它专注解决 AIGC 视频创作者在多个生成平台之间来回复制、粘贴、试错时最容易丢失的东西：**灵感参考图、分镜头、Prompt、Negative Prompt、生成参数、平台链接、生成结果与复盘经验**。

产品的核心角色是所有生成工具之前和之后的本地导演资料台：**把参考图、分镜、提示词和生成结果沉淀为可复制、可粘贴、可检索、可归档、可交付的镜头级资产。**

The maintained technical documentation starts at [docs/README.md](./docs/README.md).

## 当前 MVP 方向

当前最小功能闭环优先建设：

```text
媒体 / 近期捕获前端页面
  -> 悬浮采集工具栏
  -> 截图选区并保存到近期捕获
  -> 在近期捕获中补充 Prompt、备注、来源和分类
  -> 注册到 Prompt 库，或放置到当前画布
  -> 再加入录屏为视频资产
```

底部导航中的正式分类名是 **媒体**；进入该页面后，页面大标题显示 **近期捕获**。它和项目、Prompt 库、设置属于同一级页面。

近期捕获是 raw media inbox：截图、录屏、粘贴媒体会先进入这里，供用户批量浏览、补充信息、归档或注册。Prompt 库是 curated knowledge base：只有用户明确注册后的内容才进入 Prompt 库，并成为 Agent 可读取的提示词与参考资料。

详细计划见 [Plan 001](./docs/Plan/001-cross-platform-clipboard-asset-workbench.md) 和 [Plan 002](./docs/Plan/002-floating-capture-video-asset-mvp.md)。

## 核心定位

生成平台通常强在模型能力、在线生成、云端协作和平台内素材管理。PromptCard-Manager 选择解决另一类更长期的问题：

**当创作者跨平台复制 Prompt、粘贴参考图、保存结果、反复改镜头时，如何让这些生产资料不再散落、丢失和断链。**

四个核心价值：

1. **跨平台剪贴：复制、粘贴、保存成为产品主路径。** 文本、Prompt、参考图、截图、视频结果和平台链接都能快速进入项目。
2. **镜头级归档：每个分镜头都有自己的生产资料袋。** 画面描述、镜头语言、Prompt、参考图、生成平台、参数、结果和备注被绑定在同一个镜头卡中。
3. **灵感图资产化：参考图不只是文件。** 角色、场景、道具、构图、光影、色彩、风格和情绪都可以成为可复用的视觉资产。
4. **经验可追溯：生成失败和成功都要沉淀。** 每次试错留下平台、参数、结果、问题、修改方向和下一版 Prompt。

## 核心工作流

```text
灵感 / 剧本 / 分镜想法
  -> 粘贴参考图、文本、截图或平台链接
  -> 整理为角色、场景、道具、风格与镜头资产
  -> 建立镜头卡 Shot Card
  -> 绑定 Prompt、Negative Prompt、参考图、平台和参数
  -> 粘贴生成结果并记录复盘
  -> 导出分镜表、Prompt 包、资产包和剪辑交接资料
```

镜头卡是核心生产单元，可承载剧情描述、画面描述、镜头语言、Prompt、Negative Prompt、角色、场景、风格参考、目标平台、生成参数、状态、输出文件、失败原因、复盘备注与版本记录。

## 差异化优势

### 1. 跨平台复制粘贴中枢

- 从生成平台、网页、聊天工具、文件夹和剪辑软件中复制文本、图片、视频或链接
- 粘贴后按内容类型沉淀为灵感参考图、角色图、场景图、分镜图、生成结果或 Prompt
- 保留来源、平台、时间、备注和所属镜头，减少跨平台搬运时的信息损耗

### 2. 灵感参考图存储

- 将参考图归类为角色、场景、道具、构图、光影、色彩、风格和情绪
- 同一张图可以同时服务多个镜头、多个 Prompt 或多个项目
- 参考图与生成结果分开存储，避免灵感素材被一次生成任务消耗掉

### 3. 分镜头和提示词绑定存储

Prompt 不再是孤立文本，而是与分镜头、视觉参考、目标平台、生成参数、生产状态和输出结果建立关系的可执行镜头资产。

### 4. 生成前准备和生成后复盘

- 生成前整理镜头意图、参考图、Prompt、参数和平台格式
- 生成后粘贴结果，记录是否可用、失败原因、修改建议和下一版 Prompt
- 让每一次试错都成为可复用经验，而不是聊天记录或平台历史里的碎片

### 5. 本地项目主权

- 本地项目库、素材索引、Prompt、分镜、版本快照和导出包
- 敏感创意、客户资料和未发布 IP 无需强制上传云端
- 可选同步而非强制上云，项目资产不被平台格式锁死

### 6. 多平台中立

PromptCard-Manager 不替代视频生成、图像生成或剪辑工具，而是为它们提供统一的资料沉淀层。生成平台会变化，但灵感、分镜、Prompt、参考图、结果和经验始终属于创作者。

### 7. 可导出的生产交付件

- 导出分镜表、镜头清单、Prompt 清单、参考图索引、生成结果索引和复盘备注
- 为生成平台、剪辑师、美术、客户或团队生成不同版本的工作包
- 一键形成包含镜头编号、Prompt、参考图、资产目录、平台信息和版本说明的项目包

## 与云端产品的侧重点

| 云端产品通常强调 | PromptCard-Manager 重点建设 |
| --- | --- |
| 平台内生成、模型能力和云端历史 | 跨平台复制、粘贴、存储和归档 |
| 在线协作、实时同步、多人评论 | 本地项目主权与可选同步 |
| 平台内素材共享与查看 | 灵感图、分镜、Prompt、结果的镜头级绑定 |
| 自动生成完整视频 | 生成前准备和生成后复盘 |
| 平台内保存 | 可导出、可交付、可迁移的项目包 |

## Current Architecture

- Frontend: Vite, React, TypeScript, Tailwind, Zustand.
- Durable app data: local `promptcard-storage` service writing JSON files under `data/`.
- Agent Runtime: Python service under `agent-runtime/`, exposed to the frontend only through `/agent-api/promptcard/runtime/*`.
- Model service: DeepSeek-only runtime configuration managed from the Agent panel.
- Agent Chatbox isolation: each Agent surface has its own `sessionKey` and DeerFlow `threadId`.

Key docs:

- [System Architecture](./docs/architecture/system-architecture.md)
- [Agent Runtime Boundary](./docs/architecture/agent-runtime-boundary.md)
- [Agent Runtime API](./docs/api/agent-runtime-api.md)
- [Frontend Application](./docs/frontend/app-shell.md)
- [Agent Runtime Backend](./docs/backend/agent-runtime.md)

## Free Canvas Builder Direction

Free Canvas Builder is the top project-building mode for the next construction surface. The production canvas stack is React Flow (`@xyflow/react`) plus a lightweight PromptCard-owned media layer. tldraw remains a design reference for shape/store ideas only; it is not a production dependency because its production license does not match the current local-first distribution plan.

Phase 1 keeps durable business data in the existing three-stage project model and stores canvas-specific view/media data in project JSON metadata:

- Three-stage forms are projected into React Flow nodes for character, storyboard, and video-prompt editing.
- Storyboard and video-prompt forms remain a bound pair and are represented by a canvas edge.
- Node positions are stored in form `meta.canvas.position`.
- Media nodes are stored under `threeStage.meta.freeCanvas.mediaNodes`.
- Planned media node kinds are `imageAsset`, `textOverlay`, `arrowAnnotation`, and `mediaGroup`.
- Image API results should become `imageAsset` canvas nodes and must not write directly to Prompt Library.
- The fixed right-side Agent Chatbox still uses the PromptCard Runtime Boundary with `workspace-chatbot-agent` permission scope.

The self-owned media layer is intentionally small in Phase 1: it persists image placement, crop metadata, text annotations, arrow annotations, grouping metadata, and future generation provenance (`assetId`, `imagePrompt`, `sourceNodeId`, `generatedFromAgent`) without implementing a full pixel editor.

## Main Commands

```powershell
npm.cmd run dev
npm.cmd run dev:with-agent
npm.cmd run agent:dev
npm.cmd run agent:check
npm.cmd test -- --run
npm.cmd run build
```

Backend Agent Runtime tests:

```powershell
cd agent-runtime/backend
$env:UV_CACHE_DIR='F:\.Agent-PromptCardManager\.uv-cache'
uv run pytest tests/test_promptcard_runtime_boundary.py tests/test_model_config.py
```

## Agent Runtime Rules

- Frontend code should call the PromptCard Runtime Boundary, not DeerFlow internals.
- DeepSeek config is stored backend-side; API keys must not be stored in browser localStorage or returned in plaintext.
- Agent panel diagnostics, Prompt Library Agent, Card Builder, Storyboard Builder, and Three-stage Builder must not share chat state.
- Required session keys:
  - `diagnostics:agent-panel`
  - `prompt-library:global`
  - `workspace:card:<projectId>`
  - `workspace:storyboard:<projectId>`
  - `workspace:three-stage:<projectId>`
- Existing DeerFlow `threadId` reuse must pass backend metadata checks for `sessionKey`, `projectId`, and `permissionScope`.
- Workspace Chatboxes use `workspace-chatbot-agent`; Prompt Library uses `prompt-library-agent`.

## 产品能力主线

| 层级 | 建设方向 | 代表能力 |
| --- | --- | --- |
| 1. 媒体 / 近期捕获 | 建立截图、录屏、粘贴媒体的中间层 | 底部导航媒体页、近期捕获列表、Prompt/备注/来源/分类补充、批量浏览 |
| 2. 跨平台剪贴入口 | 让复制、粘贴、保存成为主路径 | 文本、Prompt、Negative Prompt、图片、视频、截图、平台链接快速入库 |
| 3. 灵感参考图资产库 | 把视觉灵感变成可复用资料 | 角色、场景、道具、构图、光影、色彩、风格、情绪标签与检索 |
| 4. 镜头级资料袋 | 把分镜头和提示词绑定存储 | Shot Card、画面描述、镜头语言、Prompt、参考图、平台、参数、状态 |
| 5. 生成结果与复盘 | 沉淀生成后的经验 | 结果文件、失败原因、可用版本、修改建议、下一版 Prompt、版本记录 |
| 6. 导出分发 | 形成专业交付与跨平台流转能力 | 分镜表、Prompt 包、参考图包、生成结果索引、剪辑交接包、项目归档包 |

Keep future work inside the current ownership boundaries:

- Add new project builders by creating a new workspace context builder, a stable project-level session key, and explicit proposal validation before connecting to `AIChatbotBox`.
- Extend Agent capabilities through the PromptCard Runtime Boundary first; avoid coupling UI code directly to DeerFlow thread/run/auth routes.
- Keep Agent configuration unified in the Agent panel. Do not reintroduce a second browser-local AI model settings path.
- Treat DeerFlow `threadId` as runtime storage, not product identity. PromptCard project identity must remain `projectId` plus `sessionKey`.
- Expand ToolUse by visibility and permission review first. Tool permissions should remain narrower than the UI affordance.
- Preserve proposal approval boundaries: Prompt Library writes are additive and user-approved; workspace Chatboxes may only propose or apply workspace-local edits.
- Update docs in the same change whenever API routes, storage behavior, runtime session logic, model config, ToolUse, or user-visible Agent workflows change.

Recommended verification for Agent-related changes:

```powershell
npm.cmd test -- --run src/stores/agent.store.test.ts src/services/agent-runtime-service.test.ts src/utils/agent-workspace.test.ts
npm.cmd run build
npm.cmd run agent:check
cd agent-runtime/backend
uv run pytest tests/test_promptcard_runtime_boundary.py tests/test_model_config.py
```

## Repository Boundary

The repository root is `PromptCard-Manager`. The parent folder is a workspace container and may contain local-only reference materials or secrets, such as `API-Key.txt`. Do not move those files into this repository.
