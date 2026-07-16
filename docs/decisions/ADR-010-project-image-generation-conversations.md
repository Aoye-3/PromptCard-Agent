# ADR-010: Project Image Generation Conversations And Durable Canvas Placements

- Status: Accepted
- Date: 2026-07-15
- Owners: PromptCard frontend, PromptCard Storage, and Agent Runtime

## Context

The first Seedream UI bound generation to a mutable `image-generator` canvas node. That made the right rail behave like an Inspector, mixed project conversation history with node state, and made project switching and crash recovery depend on the currently selected node. It also made ordinary generated images look like executable workflow nodes, creating an unacceptable risk of implicit provider calls during selection, connection, restore, or property changes.

Users instead need a project-level image creation surface that resembles an Agent conversation while preserving a strict rule: every send is a complete, independent image API request. History is for browsing and explicit reuse, not hidden provider context.

## Decision

1. Free Canvas exposes three peer right-rail tabs: `Agent`, `图片生成`, and `Prompt库`. Image Generation is a project-scoped task Agent UI backed directly by the image Runtime and does not invoke the text LLM.
2. A blank conversation is frontend-only. The first queued run and its conversation row are created in one Storage transaction. Conversation messages are projections of immutable run request/result snapshots; chat text is not duplicated.
3. Runtime accepts `conversationId` without `nodeId`, retains `nodeId` only for legacy compatibility, and requires at least one. It compiles only the current request. Conversation/project mismatch returns a sanitized not-found response before provider access.
4. Schema v4 permanently stores conversations, nullable run ownership, and canvas placements. Old runs are deterministically grouped by project/node without creating migration placements. Schema v5 subsequently adds original/derived image relationships without changing conversation or placement semantics.
5. Every successful conversation run creates one `pending` placement. The active source project creates an ordinary image node only if no node already carries the run ID, persists it, then advances the placement to `placed`. Placement never moves backward and has no delete endpoint.
6. Canvas text/image selection becomes input only through an explicit user action. Ordinary generated image nodes expose manual secondary-creation actions that prefill a blank draft. No canvas selection, edge, restore, or node mutation may invoke the provider.
7. Existing `image-generator` nodes remain readable but are non-connectable, non-executable previews with one manual continuation action.

## Consequences

- Project switching can immediately clear visible drafts and abort history reads while allowing the source project's provider request to finish safely in the background.
- Returning to a project resumes pending placement without duplicating a node. Deleting a placed node is respected because placement remains terminal.
- Conversation and run history survives project/node deletion and has no ordinary delete path. Storage capacity, backup, and compliance erasure remain separate operational concerns.
- Frontend retry, edit, and reuse actions copy immutable snapshots into the composer and always require another explicit Generate click.
- Code rollback cannot downgrade Storage below schema v5.

## Alternatives considered

### Keep the node Inspector as the primary creation surface

Rejected because generation lifecycle, history, and project switching remain coupled to mutable canvas selection.

### Treat previous turns as automatic multimodal context

Rejected because it changes provider requests invisibly, increases cost and input limits, and makes replay nondeterministic.

### Create result nodes directly from an in-memory completion callback

Rejected as the only mechanism because a closed or switched project would lose placement. Durable pending placements provide crash and project-switch recovery.

### Recreate deleted result nodes from permanent history

Rejected because user deletion is an explicit canvas decision. A terminal `placed` record prevents resurrection.

## Follow-up

- Core real Runtime + SQLite + provider-DI E2E coverage now exercises explicit canvas input, independent repeated requests, permanent history, automatic ordinary-image placement, and manual secondary creation without an implicit provider call. Extend it with two projects generating concurrently and placement recovery after a full process restart.
- Complete Windows Credential Locker and live Ark smoke tests for text-to-image, multi-reference, smart edit, point, and bounding-box workflows.
- Design a separate privileged compliance-erasure process if permanent history later needs regulated deletion.
