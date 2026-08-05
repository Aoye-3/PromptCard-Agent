# Text Agent Tools

The pi text Agent has a deliberately small tool surface:

- `search_prompt_library`: searches only the bounded snapshot supplied by the frontend.
- `emit_canvas_prompt_edit`: the only tool exposed to new Canvas edit requests. Gateway locks its schema to exact anchored insertions for `complete` or a complete derived-node draft for `rewrite`.
- `emit_prompt_library_create`: proposes one additive Prompt Library preset.
- `emit_media_prompt_preview`: creates or updates an editable Prompt candidate only for an explicit media `preview` action.

There are no filesystem, shell, web-search, sandbox, MCP, subagent, or direct-write tools.

Every Canvas or Prompt Library `emit_*` tool creates a pending proposal. The frontend must present Apply/Reject controls and remains the only component that can commit a Canvas or Prompt Library change. `emit_media_prompt_preview` is non-mutating: writing its editable result uses the explicit Recent Capture registration transaction.

## Skill snapshots

PromptCard Storage schema v9 is the canonical source for the minimal Skill registry. Each run receives a bounded snapshot rather than an editable package copy:

```json
{
  "skillId": "SKL-canvas-prompt-editor",
  "revision": 3,
  "digest": "sha256:...",
  "instructions": "...",
  "references": []
}
```

Built-in Skills are bound by capability:

- Canvas text editing binds `canvas.prompt.edit` / `canvas-prompt-editor` revision 3. Revisions 1 and 2 remain immutable for audit compatibility.
- Media collaboration binds `media.prompt.reverse` / `media-prompt-reverse`.

External Skills are explicitly selected by the user and apply only to the next project-Agent message. The Gateway resolves the current immutable revision and records `skillId`, revision, and digest with the turn. The selection is cleared after send.

Skill instructions never grant permissions. The Gateway compares `toolDependencies` with the exact tool set already allowed by `permissionScope`; missing, built-in-as-external, unavailable-revision, and over-privileged selections fail closed. System rules, proposal validation, tool schemas, and user approval outrank Skill content.

The first implementation exposes instructions and bounded references only. Skill scripts, hooks, package installers, archive import, Codex publication, and automatic semantic matching are not implemented.

## Canvas target and edit contracts

The attached-node list is the permission boundary. A request can attach up to ten unique text nodes: one target and zero or more read-only references. `@` mentions describe semantic relationships only and cannot promote a reference or select a different target. The Gateway reloads all node content from the current project snapshot instead of trusting browser-supplied node bodies.

`canvas-prompt-editor` revision 3 defines two mutually exclusive result contracts:

- `complete`: at most 16 exact `segment` or unique `text` anchors. Applying the proposal preserves all existing characters, segment order, sources, and colors and inserts only black user segments.
- `rewrite`: one complete black user-text draft for a new node derived from the source. It never updates the source or a reference node.

The Runtime tool does not accept a node ID or editing mode from the model. Gateway policy binds both from the validated request and records `baseNodeRevision`, `templateDigest`, and `baseSegmentsDigest`. The apply path rechecks those values and every anchor. Any mismatch rejects the whole stale proposal and asks the user to generate a new one. Old `emit_canvas_text_update` proposal records remain readable for compatibility but are not exposed to revision 3 Canvas runs.
