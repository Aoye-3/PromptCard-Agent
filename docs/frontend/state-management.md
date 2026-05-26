# State and Storage

## Overview

PromptCard-Manager uses Zustand for in-memory application state. The local storage service is the durable source of truth for projects and Prompt Library presets, reached from the frontend through `/storage-api/*`. `localforage` is still used for local UI cache data such as history, settings, cards, and the one-time browser-cache migration marker.

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

The complete card Prompt text is not stored as separate state. `src/utils/promptParser.ts` assembles it from card fields with fixed labels (`时长`, `主体`, `动作`, `场景`, `风格`, `镜头`, `灯光`, `音频`, `约束`, `自定义`) and standalone `//` page dividers. `src/utils/promptComposer.ts` parses edits in that structured text back into the corresponding card `content`, so editing a labeled Prompt segment follows the same data path as editing the card itself.

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

## Storage Model

`src/utils/storage.ts` is the persistence facade. It configures `localforage` using the `PromptCard` database name for local UI cache data and exposes logical groups such as projects, presets, workspace, history, and export behavior.

Project and Prompt Library persistence goes through the storage service. Development file storage is legacy compatibility only:

- Presets use `/__promptcard/presets`.
- Projects use `/__promptcard/projects`.

These development endpoints are not the live app source of truth and should not be used to reason about realtime UI refresh.

Prompt history is local UI cache, not durable project storage. It is stored in `localforage` under the `history` key, deduplicated by prompt content, and capped at 50 items. The Projects screen exposes the history list only when cached history exists; users can restore a snapshot, delete one item, or clear all cached history.

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
- `prompt_library_write_proposal`: create/update/archive a Prompt library preset after approval

In the card builder collaboration panel, card workspace proposals are applied immediately when `autoApplyWorkspaceChanges` is enabled. Prompt library proposals are still stored as pending records until the user approves them.

## Merge and Normalization Behavior

Project loading reads from the storage service after one-time browser-cache migration. Loaded projects are sorted by `lastOpenedAt` and then `updatedAt`.

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
