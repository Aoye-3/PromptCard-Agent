# ADR-012: Replace DeerFlow With A Focused pi Text Agent And Ark Gateway

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
- Keep provider calls in the Python Gateway and use the Volcengine Ark Python SDK.
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
- future text models can be added through the model catalog/assignment boundary.

Tradeoffs:

- pi session history is currently process-local and non-durable;
- no generic skills, sandbox, subagents, or autonomous writes;
- live Ark verification depends on a locally configured keyring credential.

## Supersedes

This ADR supersedes the current-state DeerFlow/LangGraph assumptions in Plan 003 and older Agent Runtime documentation.
