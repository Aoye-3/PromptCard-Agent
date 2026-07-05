# Plan 003: Agent Positioning And Harness Engineering

## Status

Paused

## Date

2026-07-05

## Timezone

Europe/London

## Start Trigger

Start this plan after the core product loop in Plans 001 and 002 is usable end to end:

```text
Collect prompt/reference material
  -> curate it in Prompt Library or Recent Captures
  -> use it in card/storyboard/three-stage workspaces
  -> export or copy results to external generation platforms
  -> bring generated results and learning back into the app
```

Until that loop is complete, Agent work should stay focused on supporting the product loop instead of expanding into a general-purpose agent platform.

## Context

PromptCard-Manager already contains an embedded Agent Runtime based on DeerFlow/LangGraph. That runtime has many traits of an Agent Harness: agent loop, tools, memory, sandboxing, subagents, runtime controls, and a PromptCard-owned boundary API.

The current PromptCard product layer is intentionally safer and narrower. The Agent mainly returns structured proposals that the frontend parses and presents to the user. This is a good safety boundary, but it still reads more like an advisory layer than a first-class PromptCard business harness.

After the feature loop is closed, the next direction is to strengthen the product's Agent identity and treat Harness engineering as a first-class product capability.

## Thesis

The next Agent milestone is:

> Move from an advisory proposal layer to a controlled PromptCard business harness, where the Agent can use explicit domain tools, dry-run changes, request approval, apply approved writes through storage, and verify the result deterministically.

This should not make PromptCard-Manager a generic coding-agent clone. The harness should be specialized for Prompt Library, Recent Captures, card workspaces, storyboard workspaces, three-stage workspaces, and future canvas workflows.

## Non-Goals

- Do not let the Agent silently mutate user projects.
- Do not bypass the PromptCard Runtime Boundary.
- Do not expose DeerFlow internals directly to new frontend features.
- Do not turn workspace chatboxes into Prompt Library write paths.
- Do not add broad autonomous behavior before dry-run, approval, and verification are in place.
- Do not prioritize generic agent features over PromptCard-specific workflow quality.

## Phase 1: Harness Contract And Product Positioning

**Goal:** Make the Agent Harness boundary explicit for future contributors and agents.

**Scope:**

- Define the PromptCard Agent Harness contract in docs.
- Map the product harness to four runtime requirements:
  - agent loop;
  - tool interface;
  - active context management;
  - controls, verification, and deterministic handlers.
- Separate the product label:
  - PromptCard-Manager is the creative prompt/workspace product;
  - Agent Runtime is the embedded harness;
  - PromptCard Runtime Boundary is the product adapter that constrains the harness.
- Document which Agent surfaces are global, project-scoped, and media-item-scoped.

**Acceptance Criteria:**

- [ ] A contributor can explain whether a new Agent feature belongs in frontend state, PromptCard Runtime Boundary, DeerFlow internals, or storage.
- [ ] Docs include the difference between proposal-only behavior and approved tool execution.
- [ ] Docs identify which Agent surfaces can read Prompt Library, Recent Captures, and workspace snapshots.

**Verification:**

- [ ] Architecture docs link to this plan.
- [ ] Agent Runtime Boundary docs remain the source of truth for frontend integration.

## Phase 2: First-Class PromptCard Business Tools

**Goal:** Give the Agent explicit domain tools instead of relying mainly on model-written JSON proposals.

**Scope:**

- Prompt Library search/read tools:
  - search presets by text, category, tags, media metadata, and usage context;
  - read selected preset details and related media references.
- Project/workspace read tools:
  - read current card workspace snapshot;
  - read storyboard sequences and rows;
  - read three-stage fields;
  - read selected Recent Capture dossier.
- Draft tools:
  - create card draft;
  - create prompt preset draft;
  - create storyboard update draft;
  - create three-stage field update draft.
- Domain tool outputs should be structured, typed, and small enough for context reuse.

**Acceptance Criteria:**

- [ ] The Agent can inspect relevant PromptCard state through tools rather than only through a large prompt snapshot.
- [ ] Tool outputs are permission-scoped and project-scoped.
- [ ] Workspace chatboxes cannot call Prompt Library write tools.
- [ ] Prompt Library Agent cannot mutate project workspaces.

**Verification:**

- [ ] Unit tests cover tool permission scopes.
- [ ] Unit tests cover unknown project/session rejection.
- [ ] Manual check: Agent can search Prompt Library and cite selected records in a workspace suggestion.

## Phase 3: Dry-Run, Approval, And Apply

**Goal:** Convert safe proposals into a controlled write pipeline.

**Scope:**

- Add dry-run apply for each supported proposal kind:
  - prompt library create;
  - workspace card create;
  - workspace card update;
  - storyboard update;
  - three-stage field update.
- Show the user a diff or structured preview before writing.
- Apply only after explicit user approval.
- Route writes through the storage service, not through ad hoc frontend mutation.
- Preserve current proposal safety rules as the minimum gate.

**Acceptance Criteria:**

- [ ] Every write-capable Agent action has a dry-run result.
- [ ] Every write-capable Agent action requires user approval.
- [ ] Approved writes go through one storage pathway.
- [ ] Rejected proposals leave no persistent change.

**Verification:**

- [ ] Tests prove dry-run does not write.
- [ ] Tests prove approved apply writes the expected storage payload.
- [ ] Tests prove rejected or invalid proposals do not write.

## Phase 4: Deterministic Verification And Audit Trail

**Goal:** Make the Agent's claims checkable by ordinary code.

**Scope:**

- After approved writes, re-read storage and verify the expected state changed.
- Record tool calls, dry-run results, approval decisions, apply results, and verification results.
- Surface a compact Agent activity trail in the UI.
- Record why proposals were rejected:
  - invalid schema;
  - wrong permission scope;
  - unknown project;
  - unknown card/sequence/row/stage/field;
  - duplicate or unsafe Prompt Library write.

**Acceptance Criteria:**

- [ ] The UI can show what the Agent read, proposed, applied, and verified.
- [ ] The backend can report deterministic verification failures separately from model failures.
- [ ] Agent success is based on verified storage state, not only assistant text.

**Verification:**

- [ ] Tests cover post-apply verification.
- [ ] Tests cover audit records for accepted and rejected proposals.
- [ ] Manual check: reload app after an approved Agent write and confirm the verified state remains.

## Phase 5: Harness Evaluation Set

**Goal:** Measure product-level Agent behavior with repeatable tasks.

**Scope:**

- Create a small local evaluation set for PromptCard workflows:
  - classify and improve Prompt Library entries;
  - create card workspace drafts;
  - update existing cards without touching unknown IDs;
  - update storyboard rows safely;
  - fill three-stage fields;
  - refuse Prompt Library writes from workspace chatboxes;
  - reject cross-session thread reuse.
- Measure trajectory quality, proposal quality, verification success, and rejection correctness.

**Acceptance Criteria:**

- [ ] Eval tasks run locally without external project copies.
- [ ] Each task has input fixtures and expected structured outcomes.
- [ ] Failures distinguish model output errors, tool errors, policy errors, and verification errors.

**Verification:**

- [ ] A local command runs the harness evaluation set.
- [ ] CI or release checklist includes the evaluation command when Agent behavior changes.

## Open Questions

- Which storage API should become the single approved write path for Agent-applied changes?
- Should dry-run live in the PromptCard Runtime Boundary, the storage service, or both?
- How much of the Agent audit trail should be persisted versus kept per session?
- Should Prompt Library search use the existing JSON payloads first, or introduce a small indexed retrieval layer?
- Which Agent surfaces should support streaming tool traces in the UI?

