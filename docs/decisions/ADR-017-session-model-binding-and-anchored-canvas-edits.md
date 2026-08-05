# ADR-017: Bind Agent Models Per Conversation And Preserve Canvas Source Segments

## Status

Accepted

## Date

2026-08-05

## Context

The project Agent previously resolved only the global `chat.primary` model. This made model changes affect every conversation and did not preserve the actual model used by a durable turn. Canvas completion also appended one block at the end, while rewrite replaced existing user text. Neither behavior matched the intended review workflow: completion must add missing clauses at meaningful positions without changing source text, and rewrite must preserve the source as a comparable original.

The configured Volcengine credential is an inference API Key. The Ark Runtime SDK can invoke a caller-supplied model ID but does not expose an account model-discovery resource for that credential. Control-plane discovery would require separately managed AK/SK credentials, which are outside this product boundary.

## Decision

- Keep one keyring-backed inference API Key per Ark connection.
- Maintain a release-versioned official model catalog in Gateway. Each connection stores `agentChatModelIds`, a validated whitelist of chat models from the same provider. `chat.primary` is always included in its connection whitelist.
- Persist one nullable `modelBinding` on every project Agent conversation. Gateway validates changes against the current whitelist and connection readiness, then resolves that binding on every turn. The turn result stores the exact connection/provider/model/capability snapshot used by the first execution of its `requestId`.
- Upgrade PromptCard Storage to schema v9. Version 1 model state migrates to version 2 by adding the current `chat.primary` to its connection whitelist; existing conversations acquire the default binding when first used.
- Replace the new Canvas editing surface with one policy-locked tool, `emit_canvas_prompt_edit`. The model cannot choose a node ID or edit mode.
- In `complete`, the tool returns at most 16 exact insertion anchors. Applying the proposal preserves every original segment's characters, source, order, and color; it only splits an anchored segment when needed and inserts black `user` segments.
- In `rewrite`, the tool returns a complete `userText` for a derived node. Approval creates that node to the source node's right, while the source remains unchanged.
- Bind Canvas editing to immutable `canvas-prompt-editor` revision 3. Revisions 1 and 2 and their persisted proposals remain readable and approvable for compatibility.

## Alternatives Considered

### Discover Models Through The Inference SDK

Rejected because the pinned Ark Runtime client exposes invocation APIs, not account model discovery. Pretending otherwise would make configuration dependent on an endpoint the supplied credential cannot call.

### Add Ark Control-Plane AK/SK Credentials

Rejected for this phase because it introduces a second credential class, signing flow, permission model, and secret lifecycle only to populate a selector already served by a maintained product catalog.

### Store The Selected Model Only In Browser State

Rejected because reloads and retries would lose auditability, and Gateway could not safely reject a model removed from the whitelist.

### Append Completion At The End Or Rewrite The Source Node

Rejected because appending cannot express local prompt gaps, while destructive rewrite removes the user's comparison baseline. Exact anchors plus a derived rewrite node preserve authorship and review history.

## Consequences

- Model selection is conversation-specific and survives frontend, Gateway, and text-runtime restarts.
- Removing a model from the whitelist prevents new sends but does not erase old turn snapshots.
- Completion approval is atomic: one stale digest or invalid anchor rejects the whole proposal.
- Existing source segments remain visually attributable; Agent insertions are black user-owned segments.
- Rewrite consumes additional canvas space and requires title/layout collision handling, but preserves the original node exactly.
- Catalog changes ship with application releases. Adding account discovery later requires a separate ADR and explicitly modeled management credentials.

## Related Decisions

- [ADR-012: PI Text Agent And Ark Runtime](./ADR-012-pi-text-agent-and-ark-runtime.md)
- [ADR-016: Durable Text-Agent Conversations And Bounded Skills](./ADR-016-durable-text-agent-conversations-and-bounded-skills.md)
