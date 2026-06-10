# Browser Storage

Browser persistence uses `localforage` with the PromptCard database name.

Browser storage is not the durable store for projects or Prompt Library presets. Those records are owned by the local storage service and written to SQLite.

`localforage` remains valid for runtime UI cache, prompt history, templates, settings, and a client migration marker. Browser migration requests also carry a stable `migrationId`; the service records it transactionally so retries are idempotent.
