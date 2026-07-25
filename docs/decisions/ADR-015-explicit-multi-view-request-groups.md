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
- Submit members through the existing provider-neutral image generation request boundary. The current adapter may execute members sequentially or with bounded concurrency, but it must not claim a native provider batch operation.
- Derive group state from durable member run snapshots and canvas-node metadata. `partial` means that terminal member states are mixed, or that completed members coexist with queued/running members.
- A retry creates a new run for only the selected failed view. It never rewrites the historical failed run or silently resubmits successful views.
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

Multi-view can partially succeed, and the UI must show every member independently. The initial implementation may use bounded concurrency of one to protect current storage and provider limits. A future adapter may optimize transport only if its official documentation and catalog capability declare grouped output; the domain request-group semantics and per-member lineage remain unchanged.
