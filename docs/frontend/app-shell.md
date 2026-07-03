# Frontend Application

## Overview

The frontend is a React single-page application with Vite, TypeScript, Tailwind CSS, lucide icons, and Zustand. The current app shell is centered in `src/App.tsx`, which coordinates navigation, project lifecycle actions, builder selection, persistence, and global UI actions.

Large UI surfaces are split under `src/components/app/`:

- `AppShell.tsx`: top bar, bottom navigation, and shell utilities.
- `ProjectHome.tsx`: project list, create/open/delete/rename entry points, and project-file save action.
- `CardBuilderScreen.tsx`: card workspace builder and embedded Agent collaboration rail.
- `StoryboardBuilderScreen.tsx`: storyboard sequence/shot editor.
- `MeScreen.tsx`: local profile/settings and dev server shutdown.
- `ProjectModals.tsx`: history, card type, create-project, and rename modals.
- `src/features/media/MediaScreen.tsx`: Recent Captures shell for captured screenshots and recordings before they are registered or placed on canvas.

`src/App.tsx` remains a meaningful orchestration surface. Treat it carefully during refactors: prefer extracting behavior into smaller components, domain helpers, or stores without changing persistence or navigation semantics in the same change.

## Application Shell

The bottom navigation exposes five primary areas:

- **Projects**: project home, card builder, and storyboard builder.
- **Media**: `近期捕获` / Recent Captures review queue for media intake, metadata review, media analysis dialog shell, and placeholder archive/register/place-on-canvas actions.
- **Prompt Library**: embedded Prompt library management UI.
- **Agent Dashboard**: unified Agent management page with DeepSeek model service configuration, default model, ToolUse visibility, skills, runtime status, diagnostics chat, and Prompt Library proposal review.
- **Me**: profile/settings area, export action, language setting, and development server shutdown.

The app uses `MainTab` for top-level navigation and `ProjectMode` for project home versus builder state.

## Project Screens

PromptCard-Manager supports four project types:

- **Card projects** use PromptCard pages and cards. They are edited through the card builder surface and assembled into a prompt with prompt parser utilities.
- **Storyboard projects** use a sequence/row model. They store shared sequence style/constraints and per-shot fields such as subject, action, scene, camera, timing, lighting, and audio.
- **Three-stage projects** use three parallel structured forms for character-board prompts, storyboard prompts, and final video-generation prompts. Each form has its own copyable output, while the right rail can switch between focused field editing/camera presets and the shared Agent Chatbox.
- **Free Canvas projects** use an independent `freeCanvas` payload. They open a React Flow canvas for free text, image, arrow, and edge nodes, keep the Agent Chatbox fixed on the right, and allow the board to be completely empty.

The project home screen creates, opens, deletes, and saves projects. Autosave updates project records after workspace changes.

Project-related pure logic is not owned by presentation components:

- `src/domain/projects/project-normalization.ts` owns project factories, normalization, merge, and sort behavior.
- `src/domain/storyboard/storyboard-operations.ts` owns storyboard sequence/row add, duplicate, delete, and move behavior.
- `src/domain/three-stage/three-stage-definitions.ts` owns three-stage field definitions and output builders.

## Prompt Library UI

The Prompt library UI is embedded in the main application through `PromptLibrary`. It works against the `preset.store` and preserves the `IPreset` data contract used by cards, creative mode, and Agent proposal approval.

Prompt library details are documented in [Prompt Library](./prompt-library.md).

## Agent Dashboard UI

`AgentDashboard` reads from `agent.store` and the preset store. It is the primary Agent configuration surface: a left menu selects `Model Service`, `Default Model`, `Tools / ToolUse`, `Skills`, or `Agent Session Diagnostics`, while the right pane shows the selected detail view.

The model service page is DeepSeek-only. It saves API base, API key, model name, temperature, and token limits through the backend model-config boundary; API keys stay on the backend and are returned only as masked previews. The diagnostics chat, card builder Chatbox, storyboard Chatbox, and three-stage Chatbox all use `agentRuntimeService.sendMessage()` and differ only by workspace context and `permissionScope`.

Agent integration details are documented in [Agent Runtime Boundary](../architecture/agent-runtime-boundary.md).

## Settings and Dev Server Shutdown

The `Me` screen contains a settings panel. Current settings include language selection and a local development action: **Close development server**. The shutdown action calls `POST /__promptcard/dev-server/shutdown`, which exists only in the Vite dev server middleware.

This is intended for local app testing convenience. It is not a production API.

## Component Ownership

- `CardComponent`, `PromptComposer`, and `CreativeMode` support card editing and prompt composition.
- `ThreeStageBuilder` supports the three-stage structured input workflow, field-focused Prompt library assistance, and a right-rail Agent Chatbox while reusing definitions from `src/domain/three-stage/three-stage-definitions.ts`.
- `FreeCanvasBuilderScreen` supports standalone Free Canvas projects. It uses React Flow for canvas interactions and `src/domain/free-canvas/free-canvas-project.ts` for node, edge, migration, and Agent-safe text update rules. tldraw is reference-only and should not be added as a production dependency without a separate license decision.
- `PromptLibrary`, `PromptLibraryForm`, and `PromptLibraryTable` support preset management.
- `AgentDashboard` owns Agent runtime presentation, DeepSeek model configuration, ToolUse/skill visibility, diagnostics chat, and proposal review UI.
- `AISettingsPanel` is no longer the primary model configuration entry point. `EvaluationPanel` should read the unified DeepSeek runtime configuration for any AI-backed evaluation path, or stay rule-only when no runtime call is needed.

## Refactor Guidance

- Keep user-visible project and Prompt library behavior stable when extracting from `src/App.tsx`.
- Avoid moving persistence decisions into presentation components.
- Prefer domain helpers, store methods, or service-level helpers for cross-screen workflows.
- Preserve the bottom navigation contract unless the product navigation model is intentionally changed.
