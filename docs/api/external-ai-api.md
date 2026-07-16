# External AI API

There is no maintained browser-to-provider AI API.

All maintained model calls use the PromptCard Runtime Boundary:

```text
browser -> /agent-api/promptcard/runtime/* -> Python Gateway -> provider SDK
```

The Python Gateway resolves the selected model connection, reads its credential from the operating-system keyring, and calls the Volcengine Ark SDK. The pi text runtime receives only a local internal endpoint and token; it never receives the provider credential.

The old `agent-runtime/config.yaml` and DeerFlow-compatible external chat path have been removed. Deprecated DeepSeek model-config routes remain migration compatibility only and are documented in [Agent Runtime API](./agent-runtime-api.md).

Vite's generic `/api` proxy is legacy application infrastructure and is not the integration contract for text Agent or image-generation features. New AI features must use `/agent-api/promptcard/runtime/*`.

Do not document or commit real API keys. Local key discovery is described in [Secrets Policy](../operations/secrets-policy.md).
