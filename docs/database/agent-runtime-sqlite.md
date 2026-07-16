# Agent Runtime Persistence

The pi text Agent does not use a separate SQLite database. Its bounded conversation sessions are process-local and reset when the pi service restarts.

Durable PromptCard data remains in PromptCard Storage:

- projects and Canvas state;
- Prompt Library presets;
- media assets and captures;
- image-generation conversations, runs, placements, and derivations.

The Python Gateway stores only provider-neutral model connection metadata under `PROMPTCARD_RUNTIME_STATE_DIR`; credentials remain in the operating-system keyring.
