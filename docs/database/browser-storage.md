# Browser Storage

Browser persistence uses `localforage` with the PromptCard database name.

Browser storage is not the primary durable store for projects or Prompt Library presets. Those records are owned by the local `promptcard-storage` service and written to JSON files under the configured data directory.

`localforage` remains valid for runtime UI cache, prompt history, templates, settings, and one-time migration markers. Browser cache migration imports legacy project and preset data into the storage service once, then durable reads and writes continue through `/storage-api`.
