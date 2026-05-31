# State and Storage

## Overview

PromptCard-Manager uses Zustand for in-memory application state and `localforage` for browser persistence. In development, Vite middleware provides optional file-backed persistence for projects and Prompt library presets.

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
- type filtering
- create, update, delete
- reorder by category/type
- usage count increments
- text search

The store preserves `IPreset` compatibility and persists changes through `storage.presets`.

### Agent Store

`agent.store` owns frontend Agent runtime state:

- runtime and auth status
- current user
- models, skills, tools, built-in tool names, and subagent flag
- active thread ID
- Agent messages
- running state
- parsed Agent workspace proposals
- Prompt library write proposals

It delegates HTTP calls to `agent-runtime-service`.

Agent permission scope is enforced before proposals reach UI execution:

- `prompt-library-agent` is reserved for the Prompt Library page, where Prompt decomposition, additive write proposals, and approval live.
- `workspace-chatbot-agent` is used by builder AIChatbotBox surfaces. It can apply current-workspace changes such as card and storyboard updates, but Prompt Library write proposals are filtered out and cannot be approved there.
- The Agent dashboard is diagnostic; it does not own Prompt Library write approval.

## Storage Model

`src/utils/storage.ts` is the persistence facade. It configures `localforage` using the `PromptCard` database name and exposes logical groups such as projects, presets, workspace, history, and export behavior.

Browser storage is the primary persistence layer. Development file storage is opportunistic:

- Presets use `/__promptcard/presets`.
- Projects use `/__promptcard/projects`.
- If dev file endpoints are unavailable, storage falls back to browser persistence.

Project autosave is idle-based and user-configurable from `我的 -> 设置 -> 自动保存`. Builder changes wait until the user has stopped editing for the configured delay before writing to storage; the default is 10 seconds. The UI should only enter the saving state when that delayed save actually starts. If autosave is disabled, the normal manual save action remains available.

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

Prompt Library is the only UI surface allowed to approve Agent-generated writes to this contract. Builder chatboxes may select or reuse existing presets, but must not create, update, or archive presets. Prompt Library Agent approvals are additive only; they create new presets and never update, delete, archive, overwrite, or replace existing presets.

### `IPromptProject`

`IPromptProject` is the top-level project record:

- `id`
- `title`
- `type`: `card`, `storyboard`, or `three-stage`
- `pages`
- `currentPage`
- optional `storyboard`
- optional `threeStage`
- timestamps
- `meta`

Card projects mainly use `pages`; storyboard projects use `storyboard`; three-stage projects use `threeStage`.

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

`AgentWorkspaceProposal` is the shared parsed output shape for Agent-authored changes. Current supported kinds are:

- `workspace_card_update`: update existing card titles and/or content by real `cardId`
- `workspace_card_create`: add a new card to the current card workspace
- `storyboard_update`: update storyboard sequence or row fields
- `prompt_library_write_proposal`: create a new Prompt library preset after approval in Prompt Library scope

In builder AIChatbotBox surfaces, card workspace proposals are applied immediately when `autoApplyWorkspaceChanges` is enabled. Prompt library proposals are filtered out in workspace scope and can only be approved from the Prompt Library page.

The Prompt Library page owns batch proposal approval. Selected pending create proposals are converted into `IPreset` drafts through `preset.store.addPreset()`, then marked approved. Batch rejection only marks proposals rejected; it does not mutate Prompt Library records.

## Merge and Normalization Behavior

Project loading merges browser projects with dev file projects by ID. If both sources contain the same ID, the record with the newer `updatedAt` wins. Loaded projects are sorted by `lastOpenedAt` and then `updatedAt`.

Storyboard loading normalizes missing or legacy fields:

- missing sequences become a default sequence with one row
- legacy `rows`, `sequenceStyle`, and `sequenceConstraints` are converted into the sequence model
- selected sequence and row IDs fall back to valid existing records

Three-stage loading normalizes missing project data by creating empty `character`, `storyboard`, and `videoPrompt` sections with the default focused field.

## Roadmap / Not Yet Implemented

- There is no production server-side project database in the current frontend app.
- There is no schema migration framework beyond current normalization helpers.
- Agent proposal persistence is currently frontend store state, not an independent durable audit log.
- Auto-applied card workspace changes rely on normal project/workspace autosave; there is no separate durable Agent action audit log yet.
