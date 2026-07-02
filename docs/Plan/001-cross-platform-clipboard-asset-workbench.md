# Plan 001: Minimal Cross-Platform Prompt Asset Loop

## Status

Active

## Date

2026-07-02

## Review Cadence

Review after each MVP phase. This plan is time-sensitive and should be updated when the minimum closed loop changes.

## Context

PromptCard-Manager's new direction is not to become a video generation platform. The minimum useful product should help AIGC video creators move between generation platforms while keeping prompts, media references, shot notes, generated results, and lessons learned from becoming scattered.

The first product loop should be small, concrete, and usable:

```text
Collect prompt/reference material
  -> manage and reuse it through Prompt Library and Agent help
  -> paste it into shot/canvas work
  -> copy it to external generation platforms
  -> paste generated results back
  -> export deliverables and preserve experience
```

## MVP Thesis

The first closed loop is:

> Prompt Library + prompt-reading Agent + quick templates + media paste + cross-platform copy/paste storage + exportable assets + experience notes.

If this loop works, the product becomes useful even before any video generation API integration.

## Non-Goals

- Do not build video generation in this MVP.
- Do not build a full novel-to-video pipeline.
- Do not require external platform API integrations.
- Do not build cloud collaboration as the main value.
- Do not let workspace Agents write reusable Prompt Library entries without explicit user approval.

## Phase 1: Prompt Library As The Entry Point

**Goal:** Make Prompt Library the user's durable base for reusable prompt material.

**Scope:**

- Prompt card storage and editing.
- Prompt categories, tags, and search.
- Prompt media paste: attach inspiration images, reference images, screenshots, or short videos to a prompt record.
- Quick message templates for repeated prompt-writing and prompt-review actions.

**Acceptance Criteria:**

- [ ] A user can create and edit a prompt record.
- [ ] A user can attach pasted or uploaded media to a prompt record.
- [ ] A user can save quick message templates for repeated prompt operations.
- [ ] A user can search prompt records by text, tag, and media metadata.

**Verification:**

- [ ] Prompt Library persistence tests pass.
- [ ] Manual check: create prompt, paste media, save template, reload app, confirm data remains.
- [ ] `npm.cmd run build` succeeds.

## Phase 2: Prompt Reading And Management Agent

**Goal:** Add an Agent-assisted layer for reading, organizing, and improving prompt assets without taking ownership away from the user.

**Scope:**

- Prompt-reading Agent that can summarize, classify, compare, and suggest improvements for selected Prompt Library entries.
- Agent proposal flow for creating new prompt records only after user approval.
- Prompt Library context snapshot sent through the existing Agent Runtime Boundary.
- Clear separation between global Prompt Library Agent and workspace Chatboxes.

**Acceptance Criteria:**

- [ ] The Agent can read selected prompt records and return structured suggestions.
- [ ] The Agent can propose a new prompt record, but the user must approve before storage.
- [ ] The Agent cannot silently overwrite, delete, or replace existing prompt records.
- [ ] Prompt Library Agent messages do not leak into workspace Agent sessions.

**Verification:**

- [ ] Agent store/service tests cover proposal approval boundaries.
- [ ] Manual check: ask Agent to classify prompts, approve one new prompt, reject another.
- [ ] `npm.cmd run agent:check` succeeds when runtime is available.

## Phase 3: Agent Instruction Prompt Management And Quick Buttons

**Goal:** Give users controllable instruction prompts and one-click actions for common production tasks.

**Scope:**

- Manage Agent instruction prompts for prompt reading, prompt polishing, reference analysis, shot prompt creation, and result review.
- Add quick buttons that invoke saved instruction prompts against selected content.
- Keep quick buttons visible only where their target context exists.
- Keep instruction prompt editing separate from reusable Prompt Library content.

**Acceptance Criteria:**

- [ ] A user can view and edit Agent instruction prompts.
- [ ] A user can trigger quick actions from selected prompt/media/shot context.
- [ ] Quick buttons produce reviewable output, not silent destructive changes.
- [ ] Instruction prompts are stored and restored across sessions.

**Verification:**

- [ ] Unit tests cover instruction prompt persistence.
- [ ] Manual check: edit instruction prompt, trigger quick button, reload, confirm instruction remains.
- [ ] `npm.cmd run build` succeeds.

## Phase 4: Cross-Platform Copy, Paste, And Inspiration Storage

**Goal:** Make external platform movement the core habit: copy from PromptCard-Manager, paste into a generator, paste results back.

**Scope:**

- Copy-ready prompt blocks for external platforms.
- Paste intake for text, images, screenshots, video files, and platform links.
- Inspiration reference storage with categories: character, scene, prop, composition, lighting, color, style, mood, and other.
- Source metadata: platform, source URL, capturedAt, original filename, and user note.

**Acceptance Criteria:**

- [ ] A user can copy a prompt block from a prompt record or shot.
- [ ] A user can paste external results back into the app.
- [ ] Inspiration references are stored separately from generated results.
- [ ] Pasted assets keep source metadata when available.

**Verification:**

- [ ] Domain tests cover paste metadata normalization.
- [ ] Manual check: copy prompt to external platform, paste generated image/result back, confirm it is linked.
- [ ] `npm.cmd run build` succeeds.

## Phase 5: Shot-Level Storage And Result Experience

**Goal:** Bind prompts and pasted results to shots so each shot becomes a small production dossier.

**Scope:**

- Shot Card fields for prompt, negative prompt, target platform, references, generation parameters, output assets, result status, and review notes.
- Result statuses: unreviewed, usable, needs revision, rejected, archived.
- Experience fields: failure reason, revision instruction, next prompt, selected result.
- Version history for prompt/result attempts.

**Acceptance Criteria:**

- [ ] A shot can store prompt, references, platform, parameters, results, and notes.
- [ ] A user can mark a result as usable, needs revision, or rejected.
- [ ] A failed result can produce a next-prompt note without overwriting the original prompt.
- [ ] The shot history remains understandable after save and reload.

**Verification:**

- [ ] Storyboard/free-canvas domain tests cover shot-level result metadata.
- [ ] Manual check: attach reference, copy prompt, paste result, mark status, create next prompt.
- [ ] `npm.cmd run build` succeeds.

## Phase 6: Asset Export, Delivery, And Experience Archive

**Goal:** Convert stored material into deliverables that can leave PromptCard-Manager.

**Scope:**

- Export prompt package.
- Export inspiration reference package.
- Export shot list with prompt, platform, result status, and review notes.
- Export generated result index.
- Export production handoff package for editor, client, or teammate.

**Acceptance Criteria:**

- [ ] A project can export a readable prompt package.
- [ ] A project can export asset indexes for references and generated results.
- [ ] A project can export shot-level review notes and next-step instructions.
- [ ] Exported files can be used without opening PromptCard-Manager.

**Verification:**

- [ ] Export tests cover package contents.
- [ ] Manual check: open exported files outside the app and confirm they describe the project.
- [ ] `npm.cmd run build` succeeds.

## MVP Checkpoints

### Checkpoint 1: Prompt Asset Base

- [ ] Prompt records persist.
- [ ] Prompt media paste works.
- [ ] Quick message templates persist.
- [ ] Prompt-reading Agent can inspect Prompt Library content.

### Checkpoint 2: Cross-Platform Loop

- [ ] Copy prompt from PromptCard-Manager.
- [ ] Paste into external generation platform manually.
- [ ] Paste generated result back into PromptCard-Manager.
- [ ] Link result to prompt or shot.

### Checkpoint 3: Delivery Loop

- [ ] Export prompt package.
- [ ] Export reference/result asset index.
- [ ] Export shot notes and experience archive.
- [ ] A teammate can understand the production state from exported files.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| MVP grows into video generation | High | Treat external generation platforms as manual copy/paste targets first. |
| Prompt Library and workspace assets become mixed up | High | Keep Prompt Library reusable assets separate from shot/project result assets. |
| Agent actions feel unsafe | High | Keep Agent writes proposal-based and user-approved. |
| Clipboard APIs vary across browser/desktop environments | Medium | Provide upload/import buttons for every paste path. |
| Export format becomes too complex | Medium | Start with Markdown, JSON, and asset folders before custom platform exporters. |

## Open Questions

- Should pasted assets first land in an inbox, active prompt, active shot, or active canvas?
- Which quick buttons should ship first: polish prompt, classify reference, create shot prompt, review result, or summarize experience?
- Should Agent instruction prompts be global, project-scoped, or both?
- Should export start as Markdown plus asset folder, JSON package, CSV tables, or zip package?
