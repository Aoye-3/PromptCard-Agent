# PromptCard-Manager

PromptCard-Manager is a local-first prompt building workspace for reusable PromptCards, Prompt Library presets, storyboard prompts, and three-stage video prompt drafting. It is a Vite, React, TypeScript app with a local storage service and an optional DeerFlow-derived Agent Runtime.

The maintained technical documentation starts at [docs/README.md](./docs/README.md).

## 未来远景

PromptCard-Manager 致力于成为 AIGC 编导的分镜头脚本工作台，通过 Prompt 管理与 AIGC 脚本宫格整合管理，缓解视频工作流中的信息过载问题。

产品将通过外部的管理整合层与画板能力，统一 Prompt 格式、分镜图与脚本，让创作者在进入视频生成或剪辑工具之前，先完成 Prompt、脚本、镜头与视觉参考的结构化组织。

口号：

```text
让视频制作画布与编导画布分割开来。
```

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

## 开发计划

| 方向 | 完成日期 |
| --- | --- |
| Prompt 管理与协作 Agent 改造 |  |
| 自由画布式改造 |  |
| 图片 API 置入 |  |
| 宫格分镜大师 |  |

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
