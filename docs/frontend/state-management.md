# State and Storage

## Overview

PromptCard-Manager uses Zustand and React state for in-memory editing. The local storage service is the durable source for projects and Prompt Library presets; `localforage` is limited to UI-only cache, history, settings, templates, and legacy migration.

## Zustand Stores

### Card Workspace Store

`card.store` owns card workspace state:

- pages and current page
- active card and active preset selector card
- selected cards
- card CRUD and page switching
- workspace restore
- selected-card prompt assembly

Cards use the `ICard` schema and are grouped into pages from `card-initial-state`.

### Preset Store

`preset.store` owns Prompt library state:

- preset initialization
- legacy Free Canvas quick-message migration
- type filtering
- quick-message category filtering
- create, update, delete
- reorder by category/type
- usage count increments
- text search

The store preserves `IPreset` compatibility and persists changes through `storage.presets`.

Quick messages are stored as `IPreset` records with `category: "quick-message"` and `type: "custom"`.
They are not a new card type. The store migrates old `settings.meta.freeCanvasQuickTextPresets`
records once by preserving each legacy id in `meta.quickMessage.legacyId`.
Quick-message UI drafts contain only `name` and `body`; reference media remains in the preset
`meta.media` payload and old notes remain historical data only.

### Agent Store

`agent.store` owns frontend Agent runtime state:

- runtime, local browser-session, catalog, and model-assignment status
- per-surface pi thread IDs
- Agent messages and running state
- parsed pending Canvas text proposals
- pending Prompt Library create proposals

It delegates HTTP calls to `agent-runtime-service`.

Agent permission scope is enforced before proposals reach UI execution:

- `prompt-library-agent` is reserved for Prompt Library decomposition and additive create proposals.
- `workspace-chatbot-agent` is the Free Canvas text-writing surface. A selected text node permits only an exact-node update proposal; no selected text node permits only a create proposal.
- `media-analysis-agent` analyzes one explicitly selected image and cannot emit mutation proposals.
- The Agent dashboard is diagnostic and model-management oriented; it does not own Prompt Library or Canvas approval.

pi thread history is process-local. Reuse is valid only when `threadId`, `sessionKey`, `projectId`, and `mode` remain compatible.

## Storage Model

`src/utils/storage.ts` is the persistence facade. Project and Prompt Library writes go through the storage service and do not fall back to browser persistence.

Project autosave is idle-based and user-configurable from `我的 -> 设置 -> 自动保存`. Builder changes wait until the user has stopped editing for the configured delay before writing to storage; the default is 10 seconds. The UI should only enter the saving state when that delayed save actually starts. If autosave is disabled, the normal manual save action remains available.

### Autosave Concurrency Contract

Autosave responses must never replace the current in-memory project payload. A save request can complete after the user has already deleted or edited fields, especially in storyboard, three-stage, and free-canvas builders. Applying that older response wholesale can restore deleted content.

`App.tsx` tracks a per-project edit sequence and sends all project writes through `project-save-coordinator.ts`. Each request owns a complete project snapshot, and each project has at most one storage request in progress. Later edits replace the pending snapshot with the newest complete local state; partial metadata updates are never merged onto an older in-flight content snapshot.

- Initial creation is one queued `POST`; edits made while it is running are persisted by a later `PUT` using the returned revision.
- A `409` updates the coordinator revision and retries the newest local snapshot, up to three attempts.
- Network failure retains the newest unsaved snapshot. Local content is not rolled back and the next automatic or manual save retries it.
- Storage responses only acknowledge metadata. They never replace `storyboard`, `threeStage`, canvas nodes, media nodes, or card/page content.
- Save status and last-saved time are stored per project. A response for project A cannot change the visible state of project B.
- The UI displays `saved` only when the acknowledged edit sequence is still current and the coordinator has no in-flight, pending, or retained snapshot for that project.
- Autosave effects depend on editable content snapshots, not revision or save timestamps, so metadata acknowledgements do not create save loops.

Manual save for structured builders follows the same confirmation path. New project types or builder surfaces should reuse this split between content state and storage metadata instead of calling `replaceExistingProject()` from delayed save flows.

## Core Schemas

### `ICard`

`ICard` represents one PromptCard unit. Important fields are:

- `id`
- `type`
- `title`
- `content`
- `mode`
- `color`
- timestamps
- `meta`

Supported card types include subject, action, scene, style, camera, lighting, timing, audio, constraint, and custom.

### `IPreset`

`IPreset` is the Prompt library compatibility contract:

- `id`
- `type`
- `category`
- `label`
- `content`
- `usageCount`
- `meta`
- optional timestamps

Any Agent or UI feature that writes Prompt library data should preserve this contract.

Free Canvas quick messages use this same contract. The prompt body remains `content`, and
`meta.quickMessage.note` is treated only as a legacy field that new writes must not preserve.
Reference media is shared through `meta.media` for Prompt Library preview and is not inserted into
Free Canvas text nodes.

Prompt Library is the only UI surface allowed to approve Agent-generated writes to this contract. Builder chatboxes may select or reuse existing presets, but must not create, update, or archive presets. Prompt Library Agent approvals are additive only; they create new presets and never update, delete, archive, overwrite, or replace existing presets.

### `IPromptProject`

`IPromptProject` is the top-level project record:

- `id`
- `title`
- `type`: `card`, `storyboard`, `three-stage`, or `free-canvas`
- `pages`
- `currentPage`
- optional `storyboard`
- optional `threeStage`
- optional `freeCanvas`
- timestamps
- `meta`

Card projects mainly use `pages`; storyboard projects use `storyboard`; three-stage projects use `threeStage`; Free Canvas projects use `freeCanvas`.

### `IStoryboardProject`

`IStoryboardProject` contains:

- `aspectRatio`
- `sequences`
- selected sequence and row IDs
- `meta`
- deprecated legacy flat storyboard fields for migration support

Loading normalizes legacy flat storyboard data into the sequence model.

### `IThreeStageProject`

`IThreeStageProject` contains:

- `character`, `storyboard`, and `videoPrompt` structured sections
- `selectedStage` and `selectedFieldId` for the right-side field editor
- section-level `fields`, `focusedFieldId`, timestamps, and `meta`

Three-stage fields are stored as sparse string maps. Empty fields remain absent or empty and are not included in copied stage output.

### `IFreeCanvasProject`

`IFreeCanvasProject` contains:

- standalone `nodes` for text, image, and arrow content
- user-created `edges`
- optional viewport and selected node IDs
- `meta`

Text nodes split visible text into `preset` and `user` segments. Prompt/template text remains a red preset segment, while user-authored text defaults to black. Agent updates may only mutate user segments.

Image nodes may contain `annotations`, an array of image-local annotation records. These records are part of the image node payload rather than standalone canvas nodes:

- supported `kind` values are `text`, `rect`, `arrow`, `freehand`, and `shotNumber`
- `x`, `y`, `width`, and `height` are normalized to the image bounds
- `arrow.points` stores two normalized endpoints when available
- `freehand.points` stores the normalized path
- `shotNumber` is rendered as a square black sticker with editable white text

Project normalization must keep old image nodes without `annotations` loadable by defaulting to an empty array. Saving from the annotation editor replaces the full annotation array for that image node in one project update.

### `PromptLibraryWriteProposal`

`PromptLibraryWriteProposal` captures Agent-suggested Prompt library writes:

- proposal identity and runtime context
- Agent name
- operation: create, update, or archive
- target preset ID when applicable
- preset draft
- rationale
- pending/approved/rejected status
- creation timestamp

The proposal is not a preset until the user approves it.

### `AgentWorkspaceProposal`

`AgentWorkspaceProposal` is the shared parsed output shape for Agent-authored changes. The maintained pi runtime emits:

- `free_canvas_text_update`: replace or append only the user-text segment of the exact selected Free Canvas text node;
- `free_canvas_text_create`: create a new Free Canvas text node when no text node is selected;
- `prompt_library_write_proposal`: create a new Prompt Library preset after approval in Prompt Library scope.

All three remain pending until explicit Apply/Reject. Prompt Library proposals are filtered out of workspace scope, and Canvas proposals are not accepted in Prompt Library scope.

The TypeScript union and parser retain older `workspace_card_*`, `storyboard_update`, and `three_stage_field_update` shapes for compatibility. The focused pi runtime has no tools that emit them.

The Prompt Library page owns batch proposal approval. Selected pending create proposals are converted into `IPreset` drafts through `preset.store.addPreset()`, then marked approved. Batch rejection only marks proposals rejected; it does not mutate Prompt Library records.

## Merge and Normalization Behavior

After one-time legacy browser migration, project loading uses the storage service as the durable source. Loaded projects are sorted by `lastOpenedAt` and then `updatedAt`; browser project data is not merged back into the active project list.

Storyboard loading normalizes missing or legacy fields:

- missing sequences become a default sequence with one row
- legacy `rows`, `sequenceStyle`, and `sequenceConstraints` are converted into the sequence model
- selected sequence and row IDs fall back to valid existing records

Three-stage loading normalizes missing project data by creating empty `character`, `storyboard`, and `videoPrompt` sections with the default focused field.

Free Canvas loading normalizes missing project data by creating an empty `freeCanvas` payload. Legacy three-stage projects with `meta.builderTemplateId: "free-canvas"` are migrated into standalone Free Canvas projects; their form outputs become text nodes and their media nodes/valid edges are remapped.

## Roadmap / Not Yet Implemented

- There is no production server-side project database in the current frontend app.
- There is no schema migration framework beyond current normalization helpers.
- Agent proposal persistence is currently frontend store state, not an independent durable audit log.
- Script/storyboard decomposition proposal types are not part of the current pi tool surface.
