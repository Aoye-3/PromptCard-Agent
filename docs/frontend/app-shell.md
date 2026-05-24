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

`src/App.tsx` remains a meaningful orchestration surface. Treat it carefully during refactors: prefer extracting behavior into smaller components, domain helpers, or stores without changing persistence or navigation semantics in the same change.

## Application Shell

The bottom navigation exposes four primary areas:

- **Projects**: project home, card builder, and storyboard builder.
- **Prompt Library**: embedded Prompt library management UI.
- **Agent Dashboard**: runtime status, model/skill/tool summaries, Agent run panel, and Prompt library proposals.
- **Me**: profile/settings area, export action, language setting, and development server shutdown.

The app uses `MainTab` for top-level navigation and `ProjectMode` for project home versus builder state.

## Project Screens

PromptCard-Manager supports three project types:

- **Card projects** use PromptCard pages and cards. They are edited through the card builder surface and assembled into a prompt with prompt parser utilities.
- **Storyboard projects** use a sequence/row model. They store shared sequence style/constraints and per-shot fields such as subject, action, scene, camera, timing, lighting, and audio.
- **Three-stage projects** use three parallel structured forms for character-board prompts, storyboard prompts, and final video-generation prompts. Each form has its own copyable output, while the right rail edits the currently focused field and exposes camera presets for shot-related fields.

The project home screen creates, opens, deletes, and saves projects. Autosave updates project records after workspace changes.

Project-related pure logic is not owned by presentation components:

- `src/domain/projects/project-normalization.ts` owns project factories, normalization, merge, and sort behavior.
- `src/domain/storyboard/storyboard-operations.ts` owns storyboard sequence/row add, duplicate, delete, and move behavior.
- `src/domain/three-stage/three-stage-definitions.ts` owns three-stage field definitions and output builders.

## Prompt Library UI

The Prompt library UI is embedded in the main application through `PromptLibrary`. It works against the `preset.store` and preserves the `IPreset` data contract used by cards, creative mode, and Agent proposal approval.

Prompt library details are documented in [Prompt Library](./prompt-library.md).

## Agent Dashboard UI

`AgentDashboard` reads from `agent.store` and the preset store. It displays runtime health/auth/model/tool/skill status, sends Agent prompts, renders responses, and lets users approve or reject Prompt library write proposals.

Agent integration details are documented in [Agent Runtime Boundary](../architecture/agent-runtime-boundary.md).

## Settings and Dev Server Shutdown

The `Me` screen contains a settings panel. Current settings include language selection and a local development action: **Close development server**. The shutdown action calls `POST /__promptcard/dev-server/shutdown`, which exists only in the Vite dev server middleware.

This is intended for local app testing convenience. It is not a production API.

## Component Ownership

- `CardComponent`, `PromptComposer`, and `CreativeMode` support card editing and prompt composition.
- `ThreeStageBuilder` supports the three-stage structured input workflow and field-focused Prompt library assistance while reusing definitions from `src/domain/three-stage/three-stage-definitions.ts`.
- `PromptLibrary`, `PromptLibraryForm`, and `PromptLibraryTable` support preset management.
- `AgentDashboard` owns Agent runtime presentation and proposal review UI.
- `AISettingsPanel` and `EvaluationPanel` remain part of the existing evaluation/AI support surface.

## Refactor Guidance

- Keep user-visible project and Prompt library behavior stable when extracting from `src/App.tsx`.
- Avoid moving persistence decisions into presentation components.
- Prefer domain helpers, store methods, or service-level helpers for cross-screen workflows.
- Preserve the bottom navigation contract unless the product navigation model is intentionally changed.
