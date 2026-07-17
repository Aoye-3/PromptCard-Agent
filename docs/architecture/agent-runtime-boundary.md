# Text Agent Runtime Boundary

PromptCard uses a small, product-owned boundary around a focused text Agent. DeerFlow and LangGraph are not part of the maintained runtime.

## Architecture

```mermaid
flowchart LR
  UI["Canvas / Prompt Library / Media Library"]
  Store["Zustand Agent sessions"]
  Client["agent-runtime-service.ts"]
  Gateway["FastAPI PromptCard Runtime"]
  Pi["pi text Agent runtime"]
  Registry["Text provider registry"]
  Native["PI-native provider API"]
  SDK["Gateway text SDK adapters"]
  Storage["PromptCard Storage"]

  UI --> Store --> Client --> Gateway
  Gateway --> Pi
  Pi --> Gateway
  Pi --> Registry
  Registry --> Native
  Registry --> SDK
  Gateway --> Storage
```

The split is deliberate:

- The Python Gateway owns browser session/CSRF handling, model connections, keyring credentials, Storage access, secure PI-native forwarding, image generation, and SDK-specific text adapters.
- The Node text runtime owns the pi agent loop, PI provider collection, bounded session memory, Prompt Library search, and proposal tools.
- The frontend owns user approval and applies proposals through existing Canvas or Prompt Library state handlers.
- Image generation remains an independent Gateway module and does not depend on pi.

## Minimal Closed Loop

The first product milestone is:

1. Build and maintain the Prompt media library.
2. Generate images from Canvas prompts.
3. Use the text Agent to analyze prompts and complete or write prompts.

The text Agent supports the third step without becoming a general-purpose autonomous Agent.

## Canvas Contract

- When the active Canvas selection is one text node, the Agent may return only a `free_canvas_text_update` proposal for that exact node.
- When no text node is selected, the Agent may return only a `free_canvas_text_create` proposal.
- The Agent may use the bounded Prompt Library snapshot as writing reference.
- The frontend must show Apply and Reject controls. No Agent response writes to Canvas automatically.

## Prompt Library Contract

The Prompt Library Agent may search the provided snapshot and emit only additive `prompt_library_write_proposal` records with `operation: "create"`. Update, overwrite, archive, and delete are outside the Agent tool surface.

## Media Analysis Contract

The Media Library's existing analysis entry calls `POST /api/promptcard/runtime/media-analysis`.

- MVP input is one explicitly selected image asset.
- The Gateway loads that asset from PromptCard Storage and passes only that image to the multimodal text model.
- Supported actions are style analysis, free-form analysis, and reverse prompt analysis.
- Video analysis is deferred. The request boundary is intentionally media-item-scoped so video can be added later without changing Canvas or image-generation contracts.

## Safety And Coupling Rules

- Browser code calls only `/agent-api/promptcard/runtime/*`.
- Gateway-to-pi and pi-to-Gateway calls require `X-PromptCard-Internal-Token`.
- Credentials remain in the operating-system keyring; the browser and pi runtime never receive them.
- pi tools produce proposals only. They have no filesystem, shell, provider credential, Canvas write, or Storage write capability.
- Session reuse is rejected when `sessionKey`, `projectId`, or `mode` changes.
- Text model calls resolve the `chat.primary` assignment at Agent construction time. The runtime never contains a fixed Ark model constant.

## Provider and modality boundaries

Model connections are shared account metadata; invocation and assignment remain modality-specific.

- `PI 原生` text models are registered with pi `createProvider`/`createModels` and use the provider's PI API implementation. The Gateway forwarding boundary injects the keyring credential, so Node receives only an internal token and a non-secret descriptor.
- `方舟 SDK` text models are registered as a separate pi provider family whose stream delegates to the Gateway text-SDK registry. The Ark implementation is one adapter behind that registry.
- Image models never enter either text path. Image generation continues through `image_generation` provider adapters and the `image.primary` assignment.
- The text selector groups `PI 原生` before SDK families. The image selector shows SDK families only and filters out every chat model before rendering.

The internal `GET /api/promptcard/runtime/internal/text-model` response contains the selected connection ID, provider ID, model capabilities, and integration group; it never contains an API base or credential. PI-native provider traffic uses the authenticated `/internal/pi-proxy/{connectionId}/...` route, which accepts only the current `chat.primary` connection and replaces incoming authorization with the stored credential.

Adding a text integration follows one of two paths:

1. PI-native: add provider/catalog metadata and select the matching PI API implementation.
2. SDK-backed: add provider/catalog metadata plus one `TextProviderAdapter` registration in the Gateway.

Neither path requires a Canvas contract change or an image-generation adapter change.

## Local Runtime Contract

`npm.cmd run dev:with-agent` starts or reuses four processes and writes schema version 2 to `logs/dev-runtime.json`:

- Vite frontend
- PromptCard Storage
- Python Gateway
- pi text Agent

The manifest includes `textAgentUrl` and `textAgentHealthUrl` in addition to the existing frontend, Gateway, and Storage URLs.
