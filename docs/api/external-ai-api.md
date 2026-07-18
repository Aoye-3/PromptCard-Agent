# External AI API

There is no maintained browser-to-provider AI API.

All maintained model calls use the PromptCard Runtime Boundary:

```text
browser -> /agent-api/promptcard/runtime/* -> Python Gateway
text   -> pi provider collection -> Python credential boundary -> external provider
image  -> image provider adapter -> external provider
```

The Python Gateway resolves the selected model connection and owns every external credential. PI-native text models use PI's API implementation through an authenticated Gateway proxy; SDK-backed text models use the Gateway text-adapter registry. Image generation uses a separate image-provider adapter. The pi runtime receives only a non-secret model descriptor, local internal endpoint, and internal token.

The old `agent-runtime/config.yaml` and DeerFlow-compatible external chat path have been removed. Deprecated chat model-config routes remain migration compatibility only and are documented in [Agent Runtime API](./agent-runtime-api.md).

Vite's generic `/api` proxy is legacy application infrastructure and is not the integration contract for text Agent or image-generation features. New AI features must use `/agent-api/promptcard/runtime/*`.

Do not document or commit real API keys. Local key discovery is described in [Secrets Policy](../operations/secrets-policy.md).
