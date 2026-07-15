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

The Tauri desktop dev shell opens the same Vite app in a native window while keeping the source tree editable. During editable development, projects, Prompt presets, Recent Captures, and media use the ignored repository `data/` directory as their single durable root. Runtime logs and desktop metadata remain under `logs/`. See [Desktop Dev Shell](./operations/desktop-dev-shell.md), [Local App Data Layout](./database/local-app-data-layout.md), and [ADR-007](./decisions/ADR-007-repository-data-root-for-editable-development.md).

The floating toolbar's screenshot loop is a Windows-first native `xcap` capture session: the full display frame remains in memory, while only the user-selected PNG enters Recent Captures. See [Native Screenshot Capture](./architecture/native-screenshot-capture.md) and [ADR-005](./decisions/ADR-005-native-screenshot-session.md).

Capture Bar also imports WeChat/QQ-style clipboard images. Recent Captures can explicitly register one or many reviewed items into Prompt Library, or place image captures on Free Canvas, while all three consumers reuse one physical `assetId`. See [Recent Capture To Prompt Registration](./architecture/recent-capture-prompt-registration.md), [ADR-006](./decisions/ADR-006-explicit-capture-registration-and-shared-asset-identity.md), and [Storage Service API](./api/storage-service-api.md).

Free Canvas includes a provider-neutral project Image Generation Agent. The first adapter is Doubao Seedream 5.0 Pro; credentials stay in the operating-system keyring, successful results become local assets and Recent Captures, and schema v4 keeps project conversations, immutable runs, and durable canvas placements after node or project deletion. Legacy generator nodes are read-only. See [Image Generation And Model Management](./architecture/image-generation-and-model-management.md), [ADR-008](./decisions/ADR-008-provider-neutral-image-generation.md), [ADR-009](./decisions/ADR-009-capability-driven-image-model-readiness.md), [ADR-010](./decisions/ADR-010-project-image-generation-conversations.md), and the [current implementation status](./Plan/005-seedream-image-node-frontend-implementation-status.md).

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
- Keep model catalog, connections, and `chat.primary`/`image.primary` assignments unified through Agent Runtime Model Management. Deprecated DeepSeek model-config routes are migration compatibility only.
- Keep model credentials in the operating-system keyring and provider SDK calls behind Agent Runtime adapters. The browser may manage connections but must never persist or call a provider with a credential.
- Keep image-generation conversations, runs, and placements in PromptCard Storage schema v4. Do not embed runs in project JSON or delete run/output references when a project or node is removed.
- Treat `workspaceContext.snapshot` as the per-request current workspace view. Do not use selected cards, current rows, or focused fields as the thread identity unless a future spec explicitly changes the product model.
- Keep permission scopes narrow: `prompt-library-agent` is the only Prompt Library write proposal surface; `workspace-chatbot-agent` is for project-local card, storyboard, and three-stage edits.
- Keep Free Canvas quick messages in the Prompt Library preset model (`category: "quick-message"`); see [ADR-001](./decisions/ADR-001-prompt-library-quick-messages.md).
- Keep editable-development projects, Prompt Library data, and media assets inside the protected ignored `data/` root; keep runtime logs/configuration under `logs/`; see [ADR-007](./decisions/ADR-007-repository-data-root-for-editable-development.md).
- Any ToolUse expansion needs documentation of the visible UI affordance, runtime tool permission, and proposal or approval boundary.
- Update this README plus the closest architecture/API/frontend/backend docs whenever Agent routing, storage, model configuration, or project workflows change.
