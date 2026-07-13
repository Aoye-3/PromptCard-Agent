# PromptCard-Manager Documentation

This is the single entry point for the maintained project documentation. Historical plans, extracted notes, and legacy assets live under `archive/` and `assets/`.

## Documentation Map

- [Project Overview](./00-project-overview.md)
- [Architecture](./architecture/README.md)
- [Data Storage And Update System](./architecture/data-storage-and-update-system.md)
- [Architecture Decisions](./decisions/README.md)
- [Tech Stack](./tech-stack/README.md)
- [API](./api/README.md)
- [Frontend](./frontend/README.md)
- [Backend](./backend/README.md)
- [Database and Storage](./database/README.md)
- [Operations](./operations/README.md)
- [Quality](./quality/README.md)
- [Maintenance](./maintenance/README.md)

## Current Project Shape

PromptCard-Manager is a local-first Vite, React, TypeScript application with an optional Python Agent Runtime under `agent-runtime/`. Project and Prompt Library durable data is owned by the local `promptcard-storage` service; the frontend only keeps runtime UI state and compatibility-only browser migration markers.

The Tauri desktop dev shell opens the same Vite app in a native window while keeping the source tree editable. Desktop runtime data defaults to the protected ignored profile under `logs/desktop-profile`, while legacy repository `data/` remains a compatibility seed source only. See [Desktop Dev Shell](./operations/desktop-dev-shell.md), [Local App Data Layout](./database/local-app-data-layout.md), and [ADR-004](./decisions/ADR-004-protected-profile-data-boundary.md).

## Product Vision

PromptCard-Manager is evolving into an AIGC director's storyboard-script workstation. The product direction is to integrate Prompt management, AIGC script grids, storyboard images, and script planning into an external management board that reduces video workflow information overload before work enters video production tools.

Slogan:

```text
让视频制作画布与编导画布分割开来。
```

Roadmap:

| Workstream | Target Completion |
| --- | --- |
| Prompt管理与协作Agent改造 | TBD |
| 自由画布式改造 | TBD |
| 图片API置入 | TBD |
| 宫格分镜大师 | TBD |

The root workspace `F:\.Agent-PromptCardManager` is not the project. The project repository is:

```text
F:\.Agent-PromptCardManager\PromptCard-Manager
```

## Maintenance Rule

When code changes, update the nearest documentation category in the same change. If the change touches storage, runtime integration, API routes, or user-visible workflows, also update the relevant verification checklist.

## Future Development Guardrails

- Keep PromptCard UI integrations on the PromptCard Runtime Boundary (`/agent-api/promptcard/runtime/*`); do not couple new frontend work directly to DeerFlow-native thread, run, auth, model, tool, skill, or agent routes.
- Preserve project-level Agent session isolation. New Chatbox surfaces need a stable `sessionKey`, their own message/proposal cache, and backend thread metadata validation before they reuse a DeerFlow `threadId`.
- Keep DeepSeek model configuration unified in the Agent panel and backend local config. Do not create another browser-local model settings source.
- Treat `workspaceContext.snapshot` as the per-request current workspace view. Do not use selected cards, current rows, or focused fields as the thread identity unless a future spec explicitly changes the product model.
- Keep permission scopes narrow: `prompt-library-agent` is the only Prompt Library write proposal surface; `workspace-chatbot-agent` is for project-local card, storyboard, and three-stage edits.
- Keep Free Canvas quick messages in the Prompt Library preset model (`category: "quick-message"`); see [ADR-001](./decisions/ADR-001-prompt-library-quick-messages.md).
- Keep user projects, Prompt Library data, media assets, backups, logs, and Agent Runtime state inside the protected profile boundary; see [ADR-004](./decisions/ADR-004-protected-profile-data-boundary.md).
- Any ToolUse expansion needs documentation of the visible UI affordance, runtime tool permission, and proposal or approval boundary.
- Update this README plus the closest architecture/API/frontend/backend docs whenever Agent routing, storage, model configuration, or project workflows change.
