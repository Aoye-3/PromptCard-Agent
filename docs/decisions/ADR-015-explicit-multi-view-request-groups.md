# ADR-015: Treat Multi-View As An Explicit Group Of Independent Image Requests

## Status

Accepted

## Date

2026-07-24

## Context

The contextual image toolbar needs a multi-view workflow for deriving several views of the same subject. The current image runtime and Seedream adapter expose individual image edit requests; they do not expose a provider-neutral grouped-output or exact 3D reconstruction contract.

The product must therefore make request count, billing/rate implications, partial failure, retry, and lineage visible without coupling the domain model to Seedream or mutating the existing right-side Agent / Image Generation / Prompt Library workspace.

## Decision

- One click on the multi-view dialog's explicit Generate action authorizes exactly the displayed number of independent image requests.
- Create a stable operation group ID and one immutable item ID, view specification, run ID, recipe snapshot, and canvas placeholder per requested view before invoking any provider.
- Preserve the user's selected view order when arranging placeholders and displaying group status.
- Persist the complete placeholder canvas first, then atomically prepare every queued member run in one Storage transaction. Failure in either phase authorizes zero provider calls.
- After preparation succeeds, submit members through the existing provider-neutral image generation request boundary with concurrency one. Preparation is not a native provider batch operation and must not be presented as one.
- Derive group state from durable member run snapshots and canvas-node metadata. `partial` means that terminal member states are mixed, or that completed members coexist with queued/running members.
- Bind a retry to the clicked failed canvas `nodeId`, its group/item/view tuple, its original/canvas/provider source identities, and its source node identity. It cannot be redirected to another failed member or another source before persistence or provider execution.
- A valid retry assigns a new run to that same canvas node and preserves node ID, position, width and height. It never rewrites the historical failed run or resubmits successful views.
- Reconcile reloads and project switches by both run ID and canvas node ID. Queued authorized members resume sequentially from immutable snapshots, running members poll, and terminal members hydrate the existing node without duplicate placement or submission.
- Multi-view output is an AI-inferred viewpoint variation, not precise 3D reconstruction. The workbench and result group must retain this limitation.
- Contextual multi-view work is scoped to image nodes. It must not switch the right workspace tab, replace an Agent draft, inject into the image-generation conversation, or change Prompt Library state.
- Do not add Seedream-specific fields to operation recipes, request groups, canvas-node metadata, or frontend state. Seedream remains one adapter and evaluation target.

## Alternatives Considered

### Present one multi-output request

- Advantage: a simpler progress indicator and potentially one provider call.
- Rejected: the official capability contract currently supports individual requests only. Presenting a grouped request would be an empty product promise and would hide per-view failure and cost.

### Store the request group as a new document node

- Advantage: the group could have a dedicated canvas container.
- Rejected: it would mix document-node and image-node state domains. The group is a derived relationship among image result nodes, not editable document content.

### Reuse the right-side image-generation conversation

- Advantage: existing conversation progress and retry UI could be reused.
- Rejected: contextual image editing must preserve the active right workspace tab and draft. It also has different multi-member confirmation and status semantics.

## Consequences

Multi-view can partially succeed, and the UI must show every member independently. The current implementation uses concurrency one to protect current storage and provider limits. Atomic preparation ensures the group is durably authorized before any provider work, while immutable failed runs preserve audit history even when their canvas node is reused for a retry. A future adapter may optimize transport only if its official documentation and catalog capability declare grouped output; the domain request-group semantics, strict retry identity and per-member lineage remain unchanged.

## Relationship to ADR-013

[ADR-013](./ADR-013-recoverable-image-generation-placeholders.md) defines the one-run/one-placeholder lifecycle for a project Image Generation conversation turn. This ADR does not change that conversation contract. It governs contextual multi-view groups, where one explicit confirmation creates several independent members and a failed member may keep its canvas node while a retry receives a new run ID. The distinction keeps conversation placement recovery separate from multi-view member authorization and retry history.
