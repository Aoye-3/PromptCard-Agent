# Agent Runtime Persistence

The pi text Agent does not use a separate SQLite database and does not own process-local conversation truth. It receives bounded normalized history on every invocation and returns only the current turn.

Durable PromptCard data remains in PromptCard Storage:

- projects and Canvas state;
- Prompt Library presets;
- media assets and captures;
- image-generation conversations, runs, placements, and derivations;
- project text-Agent conversations, ordered messages, proposal state, and idempotent completed turns;
- canonical local Skills and immutable Skill revisions.

PromptCard Storage schema v8 is the sole durable authority for project text-Agent history. Gateway loads that history and validates the owning project, entrypoint, mode, and permission scope before calling pi. Media analysis is intentionally temporary and never writes conversation rows.

The Python Gateway stores only provider-neutral model connection metadata under `PROMPTCARD_RUNTIME_STATE_DIR`; credentials remain in the operating-system keyring.
