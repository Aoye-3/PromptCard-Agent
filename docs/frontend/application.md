# Frontend Application

## Overview

PromptCard-Manager is a Vite, React, TypeScript, Tailwind CSS, lucide-react, and Zustand single-page app. `src/App.tsx` coordinates navigation, project lifecycle, builder routing, persistence, history, and global dialogs. Large page surfaces live under `src/components/app/`.

Primary app areas:

- Projects: project home, template library, card builder, storyboard builder, and three-stage builder.
- Prompt Library: reusable `IPreset` management.
- Agent Dashboard: Agent Runtime status, model/tool/skill summaries, chat, and proposal approval.
- Me: local settings, language, export, and development server shutdown.

## Shell and Navigation

`AppShell` owns the top bar, bottom navigation, create-project button, template-library utility, and project Trash entry. The app uses `MainTab` for top-level areas and `ProjectMode` for project home versus active builder state.

The template library is a page inside Projects, not a modal. It keeps the shell visible and uses a two-column layout: fixed template list on the left and a full-width preview workspace on the right.

## Builder Template Library

Builder modes are registered in `src/domain/builder-templates/builder-templates.ts`. The same registry feeds:

- the template library page
- the create-project modal
- the project creation adapter in `src/App.tsx`

`BuilderModePreviewFrame` renders real builder screens in preview mode. Preview state is temporary:

- each template id owns its own in-memory snapshot while the template library is mounted
- clicking "create from this template" seeds the new project from that template snapshot
- leaving the template library drops the snapshots
- preview save actions are no-op and must not write project storage or prompt history
- Agent Runtime side-effect surfaces stay disabled in preview mode

## Project Builders

Supported project types:

- `card`: PromptCard pages and cards, edited through `CardBuilderScreen`
- `storyboard`: sequence/shot model, edited through `StoryboardBuilderScreen`
- `three-stage`: character, storyboard, and video prompt sections, edited through `ThreeStageBuilder`

Pure domain logic is kept outside presentation components:

- `src/domain/projects/project-normalization.ts`: project factories, normalization, merge, and sort
- `src/domain/storyboard/storyboard-operations.ts`: storyboard sequence/row operations
- `src/domain/three-stage/three-stage-definitions.ts`: three-stage field definitions and output builders
- `src/domain/prompt-injection/prompt-injection.ts`: reusable Prompt Library injection filtering/actions

## State and Storage

Zustand stores own runtime state:

- `card.store`: card workspace, pages, active cards, selected cards, and workspace restore
- `preset.store`: Prompt Library presets, refresh, create/update/delete, reorder, Trash, and usage count
- `agent.store`: Agent Runtime status, messages, proposals, and running state

`src/utils/storage.ts` is the frontend persistence facade. Projects and Prompt Library presets use the local storage service through `/storage-api/*`. `localforage` remains for UI cache data such as prompt history, settings, templates, and one-time migration markers.

Development helper endpoints still exist:

- `/__promptcard/presets`
- `/__promptcard/projects`
- `/__promptcard/dev-server/shutdown`

These are local development conveniences, not live-refresh sources of truth.

## Prompt Injection

Prompt injection UI is shared across builders. Shared components own preset filtering, search, category display, and action selection. Builder adapters decide how an action affects builder state.

Current adapters:

- card builder Creative Mode: copy, append, replace, and create card
- three-stage field editor: append or replace focused camera fields

## Design Guidance

The UI should stay dense, work-focused, and predictable. Use familiar icon buttons for compact actions, avoid nested card shells, and keep table/layout dimensions stable so labels and controls do not shift or create horizontal scrolling.

For builder pages, render the actual working surface first. Do not replace product workflows with marketing-style landing sections.

## Refactor Guidance

- Do not move persistence decisions into presentation components.
- Keep builder template definitions serializable and React-free.
- Keep Prompt Library presets separate from builder templates.
- When changing app state or storage flows, update tests and this document in the same change.
