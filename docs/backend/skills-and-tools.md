# Text Agent Tools

The pi text Agent has a deliberately small tool surface:

- `search_prompt_library`: searches only the bounded snapshot supplied by the frontend.
- `emit_canvas_text_update`: proposes an update to the exact selected Canvas text node.
- `emit_canvas_text_create`: proposes a new Canvas text node when no text node is selected.
- `emit_prompt_library_create`: proposes one additive Prompt Library preset.

There are no filesystem, shell, web-search, sandbox, MCP, subagent, or direct-write tools.

Every `emit_*` tool creates a pending proposal. The frontend must present Apply/Reject controls and remains the only component that can commit a Canvas or Prompt Library change.
