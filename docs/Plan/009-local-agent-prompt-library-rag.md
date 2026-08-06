# Plan 009: Local Agent Prompt Library RAG

## Status

Active

## Date

2026-08-06 Europe/London

## Product Decision

Replace the local text Agent's browser-supplied Prompt Library snapshot with a bounded retrieval-augmented generation path owned by Gateway and Storage. This is a local Agent capability. It is independent from the repository-owned STDIO MCP that bridges PromptCard content to Codex in Plan 008.

## Current Problem

The Canvas Agent's current `prompt-library` mode may serialize up to 200 Prompt records in the browser request, after which the pi Runtime keeps at most 100 and searches that request-local array through `search_prompt_library`. This has four problems:

- request size grows with the library;
- irrelevant Prompt bodies consume model context;
- matching is request-local rather than a maintained retrieval index;
- a turn cannot explain or audit why a Prompt was selected.

The desired experience remains explicit: the user switches to **Prompt 库调取 / Prompt Library RAG** and asks for suitable Prompt or media. Ordinary discussion, Canvas completion/rewrite, and media analysis must not retrieve from the Prompt Library automatically.

## Goals

- Let the Agent retrieve a small, relevant evidence set from a large Prompt Library.
- Preserve exact Prompt/media identities, revisions, source links, and reviewable retrieval reasons.
- Keep exact `PLP`/`PLM` references deterministic and higher priority than ranking.
- Keep retrieval read-only; any Prompt creation or other mutation remains a separate proposal requiring approval.
- Keep requests, evidence, and durable audit bounded regardless of library size.

## Non-Goals

- This plan does not change the Codex bridge or its local MCP protocol.
- It does not make Prompt Library retrieval ambient in other Agent modes.
- It does not grant the Agent direct SQLite, filesystem, Canvas-write, archive, restore, or delete access.
- It does not silently send Prompt content to a remote embedding provider.
- It does not require semantic embeddings for the first release.

## User Experience

- Keep the existing third Agent mode but rename its user-facing label to **Prompt 库 RAG** when the new backend is active.
- The user asks naturally in the persistent project conversation and may add type/category filters or exact Prompt codes.
- Exact codes resolve directly. Natural-language requests run bounded retrieval.
- The Agent answer identifies the Prompt records and associated media it used; each citation can open the current library record.
- A visible degraded state explains when semantic retrieval is unavailable and lexical retrieval was used instead.
- This mode cannot produce a Canvas completion or rewrite proposal.

## Retrieval Architecture

Gateway coordinates retrieval through a dedicated Storage contract. The frontend sends only the user query, conversation identity, explicit filters, and typed references; it never sends the full Prompt Library.

1. Build a bounded query from the current message and only the recent conversation text needed to resolve references.
2. Resolve exact `PLP`/`PLM` codes before ranked retrieval.
3. Produce lexical candidates with SQLite FTS5/BM25 over active Prompt label, body, category, type, tags, and safe media captions.
4. If the user has explicitly configured an approved embedding backend, produce semantic candidates from a versioned index.
5. Fuse and rank candidates deterministically, then return at most eight Prompt bundles within a fixed character/token budget.
6. Re-resolve selected records by identity and revision before model invocation so stale, trashed, or unbound records are not injected.
7. Persist retrieval audit metadata with the turn, not a duplicate of the whole library.

Each evidence bundle contains a stable Prompt identity/code, revision, digest, bounded content, matched fields, score components, retrieval reason, and safe associated-media metadata. It never contains media bytes, local paths, credentials, raw vectors, or unrestricted metadata.

The contract distinguishes `lexical`, `semantic`, `hybrid`, and `degraded_lexical` execution. Semantic failure falls back to bounded lexical retrieval with a visible reason; it never silently expands result count or uploads content elsewhere.

## Index Lifecycle

- Prompt create/update/archive/restore updates the lexical index transactionally with the authoritative Prompt revision.
- Trash is excluded from ordinary retrieval.
- Semantic rows record Prompt revision, content digest, embedding model identity, dimensions, and index version.
- A changed or removed Prompt becomes ineligible before stale evidence can reach the Agent.
- Index rebuild has status/diagnostic output and does not modify Prompt revisions.
- Prompt Library and Canvas indexes remain separate even when they refer to the same underlying asset.

## Agent and Permission Contract

- Replace the request-array `search_prompt_library` tool with a policy-locked `retrieve_prompt_library` operation or an equivalent Gateway-preloaded evidence contract.
- The model may provide a query and allowed filters, but cannot choose Storage paths, arbitrary limits, Trash scope, or permissions.
- Only explicit Prompt Library RAG mode and the dedicated Prompt Library assistant receive this capability.
- Canvas `complete` and `rewrite`, ordinary discussion, and media analysis receive no Prompt retriever.
- Retrieved evidence cannot emit `free_canvas_text_insertions` or `free_canvas_text_create`.
- Skills may teach query construction and evidence use but cannot increase budgets, add tools, or bypass citations and approval.

## Durable Audit

Store the following on the Agent turn:

- normalized query digest;
- retrieval mode and retriever/index version;
- candidate identities, revisions, and score components;
- selected evidence identities;
- degradation reason, when present;
- actual model and Skill snapshots already required by the conversation audit contract.

Prompt bodies remain authoritative in Storage and are not copied wholesale into conversation rows.

## Implementation Order

1. Add normalized retrieval documents and transactional SQLite FTS5 maintenance.
2. Add the bounded Storage/Gateway retrieval contract with exact-code short-circuiting.
3. Replace browser Prompt-array transport and update the Runtime evidence/tool contract.
4. Add citations, degraded-state UI, evidence budgets, and durable turn audit.
5. Add an optional versioned semantic-index adapter only after explicit local/remote indexing consent is defined.
6. Remove the legacy request-snapshot path after migration and compatibility tests pass.

## Acceptance Criteria

- [ ] A Prompt Library RAG request contains no browser-supplied full Prompt array.
- [ ] Exact Prompt/media codes resolve deterministically before ranking.
- [ ] Chinese and English paraphrases retrieve relevant active Prompts with reviewable reasons.
- [ ] Result count and injected context stay bounded as the library grows.
- [ ] Create, update, archive, and restore keep lexical and semantic index state consistent.
- [ ] Missing semantic infrastructure produces an explicit lexical fallback and does not fail the conversation.
- [ ] Every grounded answer exposes resolvable Prompt identities and revisions.
- [ ] Conversation reload preserves retrieval provenance without duplicating Prompt bodies.
- [ ] Canvas completion/rewrite, ordinary discussion, and media analysis cannot call the retriever.
- [ ] RAG mode cannot mutate Canvas or Prompt Library without a separate valid proposal and user approval.
- [ ] Disabling RAG leaves ordinary Agent, Canvas, media analysis, and exact-code resolution available.

## Verification Strategy

- Storage tests cover FTS freshness, archive/restore, stale revision rejection, rebuild safety, and index migration.
- Gateway tests cover query/evidence budgets, exact-code priority, filtering, ranking provenance, degraded fallback, permissions, and stale-candidate re-resolution.
- Runtime tests prove only the explicit RAG mode receives bounded evidence or the retrieval tool.
- Frontend tests prove no full-library payload is sent and citations/degraded states remain usable after conversation reload.
- End-to-end tests cover a large library, bilingual paraphrases, exact references, stale records, Trash exclusion, semantic outage, and forbidden retrieval from other Agent modes.

## Open Questions

- Should the first release remain lexical-only until an explicit embedding consent flow exists?
- Which local or remote embedding backend should be supported first?
- Should hybrid retrieval initially use fixed reciprocal-rank fusion or a separately versioned reranker?
