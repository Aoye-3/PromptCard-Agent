# Frontend Application

## Overview

The frontend is a React single-page application with Vite, TypeScript, Tailwind CSS, lucide icons, and Zustand. The current app shell is centered in `src/App.tsx`, which coordinates navigation, project lifecycle actions, builder selection, persistence, and global UI actions.

Large UI surfaces are split under `src/components/app/`:

- `AppShell.tsx`: fixed left sidebar navigation, project search, persistent trash entry, capture-bar entry, and builder header.
- `ProjectHome.tsx`: project list, create/open/delete/rename entry points, and project-file save action.
- `CardBuilderScreen.tsx`: card workspace builder and embedded Agent collaboration rail.
- `StoryboardBuilderScreen.tsx`: storyboard sequence/shot editor.
- `MeScreen.tsx`: local profile/settings and dev server shutdown.
- `ProjectModals.tsx`: history, card type, create-project, and rename modals.
- `src/features/media/MediaScreen.tsx`: Recent Captures review surface for native screenshots and pasted images, including selection-only detail updates, explicit analysis editing, metadata-record removal, batch Prompt registration, and image placement on Free Canvas. Recording remains planned.
- `src/features/media/MediaAnalysisDialog.tsx`: non-persistent media collaboration dialog with bounded chat history, explicit structured Prompt preview, selection-scoped rewrite review, and explicit Prompt Library registration.
- `src/components/agent/AgentConversationMenu.tsx`: project Agent conversation switcher, history dialog, rename flow, and independent conversation Trash.
- `src/components/skills/SkillHubScreen.tsx`: searchable Skill registry list and read-only revision, trust, capability, reference, and Runtime-tool detail drawer.
- `src/features/capture/CaptureBarScreen.tsx`: Capture Bar control page for starting, closing, previewing, and planning toolbar modules.
- `src/features/capture/ScreenshotCaptureOverlay.tsx`: native-session selector rendered only by the hidden-preloaded `capture-selection` window; after activation it presents the gray drag surface, uploads a cropped PNG, and creates the Recent Capture.

`src/App.tsx` remains a meaningful orchestration surface. Treat it carefully during refactors: prefer extracting behavior into smaller components, domain helpers, or stores without changing persistence or navigation semantics in the same change.

## Application Shell

The desktop shell uses a fixed left sidebar for global navigation. In addition to Projects, Media, Capture Bar, Prompt Library, Agent Dashboard, and Me, the current navigation includes Files, SkillHub, and Updates. SkillHub is the read-only registry browser for local Agent Skills, revisions, trust state, capability bindings, references, and declared Runtime tool dependencies.

- **Projects**: project home, card builder, and storyboard builder.
- **Media**: `近期捕获` / Recent Captures review queue for metadata review, temporary Agent-assisted Prompt discussion, explicit preview and registration, and image placement on Free Canvas. Archive remains deferred.
- **Files**: local asset inventory and lifecycle management.
- **Capture Bar**: floating toolbar control page for starting and closing the capture toolbar, previewing the compact toolbar, and listing planned capture modules.
- **Prompt Library**: embedded Prompt library management UI.
- **SkillHub**: read-only registry inspection for Skill revisions, trust state, capability bindings, references, and Runtime tool dependencies.
- **Agent Dashboard**: unified Agent management page with DeepSeek model service configuration, default model, ToolUse visibility, skills, runtime status, diagnostics chat, and Prompt Library proposal review.
- **Updates**: local product update surface.
- **Me**: profile/settings area, export action, language setting, and development server shutdown.

The app uses `MainTab` for top-level navigation and `ProjectMode` for project home versus builder state.

The sidebar search input is enabled only on the Projects home view and filters the project list. Other top-level pages render the same input in a disabled state so it does not imply cross-app search.

The Projects utility area currently keeps **Trash** pinned in the left sidebar for every non-builder page. Clicking it calls the existing project-trash handler, returns to the Projects home flow, and opens the trash view. The direct **Template Library** sidebar entry is intentionally hidden for now and remains a planned navigation item rather than an active surface.

The Capture Bar is intentionally separate from Media. Capture Bar owns toolbar launch, close, preview, and module configuration; Media remains the results inbox for Recent Captures. In Media, selecting a row updates the right-hand detail panel, Edit opens a temporary Agent conversation, and Remove record deletes only Recent Capture metadata after confirmation. The dialog keeps messages and its draft preview only in component memory, so closing it discards that state. A user must explicitly request a structured preview and then explicitly register the edited preview in Prompt Library; ordinary chat never performs the write. The desktop shell does not create the floating capture toolbar at app startup. Users start it from the Capture Bar page when needed, and closing it destroys the toolbar window instead of merely hiding it.

Screenshot capture is a three-window desktop flow. The toolbar first shows a disabled preparation state and emits an intent. `App.tsx` asks Rust to reserve the session and preload `capture-selection` hidden. After the selector page signals readiness, Rust hides the toolbar, captures the source frame off the async runtime thread, and shows/focuses the gray drag surface. The selector is never rendered in the main window. Its ability to place a saved image on canvas is fixed when the session starts and is enabled only for an active Free Canvas project. Restore events reset the toolbar preparation state after cancellation, failure, close, or startup timeout.

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

## Project Agent Conversations

Project builder chatboxes share the persistent conversation contract while keeping Prompt Library assistance and Media analysis outside that history:

- The header menu creates, switches, and renames project conversations and opens the full history dialog.
- The history dialog pages active conversations and exposes an independent Agent Trash. Trash entries can be restored or permanently deleted after confirmation.
- Opening a conversation loads its stored messages and proposal states from PromptCard Storage. Browser storage keeps only the selected conversation ID; the current composer draft is component state, and neither is the transcript authority.
- External Skills are selected from the composer Skill panel for the next message only. The selection clears after sending. Built-in Canvas and Media Skills are bound by their feature entrypoints and are not user toggles.
- Proposal cards remain approval surfaces. Reloading a project restores pending, approved, and rejected status from the durable conversation record.

### Canvas node composer

The Free Canvas project Agent uses an attached-node composer instead of copying node bodies into the visible message field:

This interaction is maintained as the [Canvas Agent omnireference Prompt editing contract](./canvas-agent-reference-editing.md): one writable target, multiple read-only references, and atomic `@` relations.

- A text node is created with a stable project-local label such as `TXT-A1B2C3`. Its full label is always shown in gray at the node's upper-left edge. The selection toolbar can rename it to a unique, case-insensitive name of 1–32 characters that does not contain `@`.
- **补全** in the node context menu attaches that node as the sole target and selects the completion mode. **发送到 Agent** attaches it as a read-only reference. Reusing a node updates its role instead of duplicating the tag.
- The tag pool displays at most ten full labels, with the target pinned first and all other tags treated as references. Tags can be removed; a reference tag's context menu can make it the target and demote the old target.
- Typing `@` opens a keyboard- and pointer-accessible list containing only attached nodes. A mention is an atomic token bound to `nodeId`; it expresses the intended relationship but never changes node permissions.
- The bottom mode selector offers **补全** and **改写**. Completion appends a new user segment only. Rewrite replaces a valid selection in the current target's user part, or the complete user part when no selection exists. The preset/template part is always read-only.
- Every result appears as a diff proposal. Successful send clears the composer, node tags, selection snapshot, mode, and one-shot Skill selection; a failed request preserves them for retry. Project or conversation changes clear unsent Canvas composer state.

## SkillHub UI

SkillHub is a registry inspection surface, not a permission editor. The list supports text search and built-in/external source filtering. Selecting a Skill opens a detail drawer with its current immutable revision, digest, source, trust state, capability binding, references, and required Runtime tools.

The first release does not import packages, execute scripts, publish Skills to Codex, or grant tools. Skill availability is derived from the current Agent permission scope, and Gateway performs the authoritative dependency check when a message is sent.

## Settings and Dev Server Shutdown

The `Me` screen contains a settings panel. Current settings include language selection and a local development action: **Close development server**. The shutdown action calls `POST /__promptcard/dev-server/shutdown`, which exists only in the Vite dev server middleware.

This is intended for local app testing convenience. It is not a production API.

## Component Ownership

- `CardComponent`, `PromptComposer`, and `CreativeMode` support card editing and prompt composition.
- `ThreeStageBuilder` supports the three-stage structured input workflow, field-focused Prompt library assistance, and a right-rail Agent Chatbox while reusing definitions from `src/domain/three-stage/three-stage-definitions.ts`.
- `FreeCanvasBuilderScreen` supports standalone Free Canvas projects. It uses React Flow for canvas interactions and `src/domain/free-canvas/free-canvas-project.ts` for node, edge, migration, and Agent-safe text update rules. tldraw is reference-only and should not be added as a production dependency without a separate license decision.
- `PromptLibrary`, `PromptLibraryForm`, and `PromptLibraryTable` support preset management.
- `AgentDashboard` owns Agent runtime presentation, DeepSeek model configuration, ToolUse/skill visibility, diagnostics chat, and proposal review UI.
- `AgentConversationMenu` owns project conversation navigation and lifecycle UI; it does not store authoritative transcript data.
- `SkillHubScreen` owns Skill discovery and detail presentation; Storage and Gateway remain authoritative for revisions and runtime availability.
- `MediaAnalysisDialog` owns temporary media discussion and editable preview state; closing it intentionally destroys the conversation.
- `AISettingsPanel` is no longer the primary model configuration entry point. `EvaluationPanel` should read the unified DeepSeek runtime configuration for any AI-backed evaluation path, or stay rule-only when no runtime call is needed.

## Refactor Guidance

- Keep user-visible project and Prompt library behavior stable when extracting from `src/App.tsx`.
- Avoid moving persistence decisions into presentation components.
- Prefer domain helpers, store methods, or service-level helpers for cross-screen workflows.
- Preserve the left-sidebar navigation contract unless the product navigation model is intentionally changed.
