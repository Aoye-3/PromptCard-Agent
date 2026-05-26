# Prompt Library

## Overview

The Prompt library is the reusable preset data layer for PromptCard content. It is built around the `IPreset` interface and is used by the card builder, creative mode, three-stage builder, Prompt library management UI, and Agent proposal approval flow.

Do not confuse the Prompt library with the builder template library. Prompt Library stores reusable preset content (`IPreset`). Builder templates describe prompt-building modes and their module composition.

## Compatibility Contract

All presets must remain compatible with `IPreset`:

- `type` must be one of the supported card types.
- `category`, `label`, and `content` are required strings.
- `usageCount` tracks preset use.
- `meta` must remain an object for extensibility.

New features should extend `meta` instead of changing the top-level shape unless a migration is explicitly planned.

## Initialization

On first initialization, `preset.store` loads presets through `storage.presets.getAll()`. Durable seeding happens in the storage service when `data/prompt-library-presets.json` is empty. The frontend no longer creates or persists default presets.

## Current Operations

The preset store supports:

- filtering by card type
- adding a preset
- updating a preset
- deleting a preset
- multi-select move to Trash
- Trash restore
- permanent delete from Trash
- reordering presets
- incrementing usage count
- searching by label or content

UI features should call these store methods instead of writing storage directly.

## Management UI

The Prompt Library page provides:

- category filters with an embedded search field
- table filtering by preset label and content
- add Prompt
- edit Prompt
- copy Prompt content from the edit dialog
- move selected presets to Trash
- restore or permanently delete Trash entries
- drag reorder inside a concrete category
- move a preset to the top of the current concrete category

Existing presets open in a read-only edit dialog. Users must click **修改** before fields can be changed and saved. This prevents accidental edits while still allowing quick copy/review.

Reorder controls are intentionally hidden in all-category view, search results, and Trash because those views do not represent one stable category order.

`usageCount` currently means "applied through supported preset-application flows"; it is not a general view count. UI copy/review actions do not increment it.

## Refresh Contract

Prompt Library UI writes must go through `preset.store`. After a successful create, update, delete, trash, restore, usage increment, or reorder operation, the store must update its in-memory `presets` array so subscribed components repaint without a page reload.

Components that need preset lists should subscribe to `presets` and derive filtered lists with `useMemo` or local filtering. Subscribing only to helper functions such as `getByType` does not cause React to re-render when the `presets` array changes.

Reorder uses an optimistic UI update: the store applies the requested order immediately, persists it through `/storage-api/presets/reorder`, then replaces the list with the service response. If persistence fails, the store rolls back to the previous list and the UI should surface the failure.

Three-stage structured fields reuse this same store. Shot-related fields bind to existing `camera` presets in the right-side field editor, where users can append or replace the focused field and usage count is incremented through `incrementUsage()`.

Three-stage field metadata must not require a new preset shape. If a field needs reusable options, bind it to an existing preset `type` such as `camera` and keep field-specific behavior in UI configuration instead of changing `IPreset`.

## Modular Prompt Injection

Prompt injection UI must stay separate from builder-specific state. The shared injection layer owns preset filtering, search, category display, and action selection. Builder modes own the adapter that applies an action to their target state.

Current modular flow:

```text
IPreset -> prompt injection module -> mode adapter -> target state
```

Requirements:

- Shared injection components must not import card, storyboard, or three-stage stores directly.
- Builder adapters expose actions such as append, replace, create card, or copy.
- Mode-specific actions stay in adapter configuration, not in `IPreset`.
- New builder modes should reuse the injection module instead of copying `CreativeMode` or three-stage preset-list logic.

## Development File Endpoint

The primary durable API is `/storage-api/presets`. In development, Vite still exposes legacy helpers:

- `GET /__promptcard/presets`
- `PUT /__promptcard/presets`

The endpoint validates that incoming presets match the expected preset list shape before writing `data/prompt-library-presets.json`.

These endpoints are development conveniences. They are not the Prompt Library source of truth and do not provide live refresh notifications.

## Agent Write Safety

Agents may read a bounded Prompt library snapshot through the storage service and may propose changes. Direct write tools exist for approved workflows and require the current `revision`; normal model output should still use proposals.

The current safe write flow is:

1. Frontend sends the user request plus a Prompt library snapshot to the Agent Runtime.
2. Agent response may include `prompt_library_write_proposal` JSON.
3. Frontend parses proposals into `PromptLibraryWriteProposal`.
4. User approves or rejects each proposal.
5. Approval applies changes through existing preset store methods.
6. Rejection only marks the proposal rejected and leaves presets unchanged.

This keeps human confirmation between model output and durable Prompt library mutation.

## Proposal Draft Shape

Proposal drafts contain the preset fields needed to create or update an `IPreset`:

- `type`
- `category`
- `label`
- `content`
- optional `meta`

When approved, generated preset metadata should retain source information such as `source: "agent-runtime"` when available.

## Roadmap / Not Yet Implemented

- Direct Agent archive/update behavior depends on UI approval and preset store support; model output alone is not a write.
- Skill-generated Prompt library changes should use the same proposal pattern before becoming durable.
- A durable proposal audit log is not implemented yet.
