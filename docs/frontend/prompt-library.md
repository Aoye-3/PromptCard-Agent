# Prompt Library

## Overview

The Prompt library is the reusable preset layer for PromptCard content. It is built around the `IPreset` interface and is used by the card builder, creative mode, three-stage builder, Prompt library management UI, and Agent proposal approval flow.

## Compatibility Contract

All presets must remain compatible with `IPreset`:

- `type` must be one of the supported card types.
- `category`, `label`, and `content` are required strings.
- `usageCount` tracks preset use.
- `meta` must remain an object for extensibility.

New features should extend `meta` instead of changing the top-level shape unless a migration is explicitly planned.

## Initialization

On first initialization, `preset.store` loads presets through `storage.presets.getAll()`. During first SQLite creation, the service imports legacy Prompt JSON or seeds an otherwise empty database from the bundled preset file.

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

Three-stage structured fields reuse this same store. Shot-related fields bind to existing `camera` presets in the right-side field editor, where users can append or replace the focused field and usage count is incremented through `incrementUsage()`.

Three-stage field metadata must not require a new preset shape. If a field needs reusable options, bind it to an existing preset `type` such as `camera` and keep field-specific behavior in UI configuration instead of changing `IPreset`.

## Preview Surfaces

Prompt Library preview UI is shared by the full Prompt Library page and the Free Canvas side panel.

- `PromptLibraryPreviewMode` / `PromptLibraryPreviewPanel` render the reusable preview list.
- The compact panel variant is safe for narrow sidebars and keeps the same category, search, stats, media count, and preset card behavior.
- Preview cards expose a copy control that copies only `preset.content`.
- Selecting a preset opens the shared `PromptPresetPreviewDialog`.
- Preview mode must not expose management-only actions such as edit mode, add-to-library, Trash, or Agent ingestion.
- Embedded preview surfaces must not mutate the canvas or auto-fill an Agent input unless a separate explicit insertion workflow is designed later.

## Preset Preview Dialog

`PromptPresetPreviewDialog` is the single preview dialog used by Prompt Library and embedded preview panels.

- Desktop layout is fixed-size and two-column: media preview on the left, prompt text on the right.
- Mobile layout may stack the same sections.
- The left column always renders a media region. If a preset has no media, it shows the empty state `暂无媒体`.
- Images use contained rendering; videos keep native controls.
- The right column shows `preset.content` in a scrollable prompt area and preserves line breaks.
- The dialog copy button copies only the full prompt body, not title, type, category, or media metadata.
- The dialog does not update usage count by itself; usage count should be incremented only by flows that actually apply a preset.

## Development File Endpoint

The primary durable API is `/storage-api/presets`. In development, Vite still exposes legacy helpers:

- `GET /__promptcard/presets`
- `PUT /__promptcard/presets` returns `410 Gone`

The legacy endpoint exists only to inspect migration source data. Prompt Library writes use `/storage-api/presets`; whole-library replacements use one atomic batch transaction.

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

## Verification

```powershell
npm.cmd test -- BuilderModePreviewFrame.test.tsx --run
npm.cmd test -- PromptPresetPreviewDialog.test.tsx --run
npm.cmd run test:e2e -- free-canvas-image-crop.spec.ts
npm.cmd run build
```

Manual checks should cover the full Prompt Library preview dialog, Free Canvas side-panel Prompt Library preview, prompt copy buttons in both list and dialog surfaces, and confirming that embedded preview mode does not expose management controls.
