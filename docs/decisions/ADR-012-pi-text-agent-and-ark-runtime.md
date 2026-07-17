# ADR-012: Replace DeerFlow With A Focused pi Text Agent And Extensible Provider Boundary

## Status

Accepted

## Date

2026-07-16

## Context

The embedded DeerFlow runtime never reached a working PromptCard closed loop. Its auth, thread/run persistence, sandbox, skills, channels, subagents, and generic tools added maintenance weight that the product did not need.

PromptCard's immediate text-Agent needs are narrow:

- analyze and complete prompts;
- write a selected or new Canvas text node;
- use the Prompt Library as writing context;
- analyze an explicitly selected media image;
- preserve the independent image-generation system.

## Decision

- Remove DeerFlow/LangGraph code, routes, configuration, dependencies, and startup behavior.
- Use `earendil-works/pi` for the text Agent loop.
- Resolve `chat.primary` through pi's native provider collection instead of a fixed model constant.
- Use PI-native API implementations for compatible text providers while forwarding through the authenticated Python credential boundary.
- Keep SDK-backed text providers behind a separate Python adapter registry; Volcengine Ark is the first adapter.
- Keep image-provider adapters and `image.primary` independent from all text-provider paths.
- Let pi expose only PromptCard proposal tools.
- Require explicit frontend approval before Canvas or Prompt Library mutation.
- Keep Model Management, Storage, and Image Generation independent from pi.
- Support one-image multimodal analysis now; keep the media-item boundary extensible for video later.

## Consequences

Positive:

- smaller runtime and dependency surface;
- clearer ownership between orchestration, provider access, persistence, and UI writes;
- no browser or Node access to provider credentials;
- Canvas and Image Generation remain usable when the text Agent is unavailable;
- future text models can be added as PI-native providers or SDK adapters through the model catalog/assignment boundary.

Tradeoffs:

- pi session history is currently process-local and non-durable;
- no generic skills, sandbox, subagents, or autonomous writes;
- live provider verification depends on a locally configured keyring credential;
- an Ark inference API Key can test inference connectivity and use the supported PromptCard catalog, but private account endpoint enumeration would require a future AK/SK management-credential contract.

## Supersedes

This ADR supersedes the current-state DeerFlow/LangGraph assumptions in Plan 003 and older Agent Runtime documentation.
