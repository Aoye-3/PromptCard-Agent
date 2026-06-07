<p align="center">
  <img src="./public/promptcard-manager-icon.png" alt="PromptCard-Manager icon" width="180" />
</p>

<h1 align="center">PromptCard-Manager</h1>

<p align="center"><strong>面向 AIGC 视频创作者的视频生成前本地制片准备工作台</strong></p>

PromptCard-Manager 不是云端协作文档，也不只是单一的 Prompt 管理器。它帮助创作者在进入视频生成和剪辑工具之前，把**剧本、分集、分镜、镜头、Prompt、视觉参考、角色、场景、资产与生成参数**统一组织成结构化、可追溯、可导出、可交付的生产准备资产。

产品不绑定某个生成平台，而是作为所有生成工具之前的本地编导准备层：**把剧本拆成镜头，把镜头变成 Prompt，把 Prompt 绑定资产，最终导出为可分发的生产工作包。**

The maintained technical documentation starts at [docs/README.md](./docs/README.md).

## 核心定位

云端产品通常强在在线协作、实时同步、多人评论与云端素材共享。PromptCard-Manager 选择解决另一类问题：

**进入视频生成工具之前，如何在本地完成全部准备工作，并让准备成果能够离开软件、跨平台流转和长期归档。**

四个核心价值：

1. **本地化：创意资产不被云端锁定。** 剧本、Prompt、参考图、角色设定和项目资料都可以在本地组织。
2. **结构化：把剧本拆成可执行的镜头卡。** 从分集脚本、分镜宫格到镜头 Prompt，形成清晰的生产颗粒度。
3. **资产化：每个镜头绑定 Prompt、参考图、角色和生成参数。** 资产不再是散乱文件，而是与剧本结构关联的生产资料。
4. **可分发：把准备成果导出为真正的交付件。** 面向生成工具、剪辑师、客户或团队提供不同版本的工作包。

## 核心工作流

```text
想法 / 剧本
  -> 分集与场景拆解
  -> 分镜宫格
  -> 镜头卡 Shot Card
  -> Prompt、视觉参考与生成参数绑定
  -> 单集 / 单场资产整理
  -> 项目导出包与生产交接
```

镜头卡是核心生产单元，可承载剧情描述、画面描述、镜头语言、Prompt、Negative Prompt、角色、场景、风格参考、生成参数、状态、输出文件、备注与版本记录。

## 差异化优势

### 1. 本地项目主权

- 本地项目库、素材索引、脚本、Prompt、分镜与版本快照
- 敏感创意、客户资料和未发布 IP 无需强制上传云端
- 可选同步而非强制上云，项目资产不被平台格式锁死

### 2. 可导出的生产交付件

- 导出分集脚本表、分镜宫格表、镜头清单和 Prompt 清单
- 导出角色、场景、视觉参考、资产索引和生成参数
- 为生成工具、剪辑师、美术、客户或团队生成不同版本
- 一键形成包含脚本、分镜、Prompt、参考图、资产目录、镜头编号和版本说明的项目包

### 3. 镜头级 Prompt 管理

Prompt 不再是孤立文本，而是与集、场、镜头、角色、场景、视觉参考、生成平台、生产状态和输出结果建立关系的可执行视频生成单元。

### 4. 分集脚本与分镜宫格

通过分集、场景和镜头层级把文本剧本转化为可视化生产格子，让创作者从大纲进入分集，从分集进入场景，从场景进入镜头，再从镜头进入 Prompt。

### 5. 单集资产分析整理

按集、场和镜头整理角色、场景、道具、视觉参考、关键镜头、Prompt、生成结果、待补素材与风格约束，使资产始终绑定在剧本结构中。

### 6. 多平台中立

PromptCard-Manager 不替代视频生成、图像生成或剪辑工具，而是为它们提供统一的准备层。生成平台会变化，但前期准备资产始终属于创作者。

### 7. 版本与追溯

围绕 Prompt、镜头、分镜、角色设定、参考图、生成结果、导出包和项目快照保留版本记录，帮助团队理解某个镜头为何以当前方式生成。

## 与云端产品的侧重点

| 云端产品通常强调 | PromptCard-Manager 重点建设 |
| --- | --- |
| 在线协作、实时同步、多人评论 | 本地项目主权与可选同步 |
| 云端素材共享与平台内查看 | 剧本结构中的生产资产关联 |
| 文档、章节和轻量编辑 | 分集、场景、镜头与 Shot Card |
| 平台内生成与平台生态 | 多平台中立的生成前准备层 |
| 平台内保存 | 可导出、可交付、可归档的项目包 |

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
| 1. Prompt 管理 | 作为产品入口与基础能力 | Prompt 卡片、分类标签、模板、版本、参数管理 |
| 2. 剧本拆解 | 从 Prompt 工具走向编导工作台 | 剧本导入、分集 / 场 / 镜头拆分、角色与场景提取 |
| 3. 分镜宫格工作台 | 建立最有辨识度的生产界面 | 分集宫格、镜头卡、画面描述、Prompt、参考图、状态与结果占位 |
| 4. 资产分析整理 | 建立前期生产资产管理能力 | 角色、场景、道具、风格、参考图与生成结果资产 |
| 5. 导出分发 | 形成专业交付与跨平台流转能力 | 分镜表、Prompt 包、资产包、客户提案、剪辑交接包、平台格式与项目归档包 |

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
