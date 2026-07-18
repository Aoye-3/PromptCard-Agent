# Plan 006: pi Text Agent Minimal Closed Loop

## Status

Implemented baseline

## Goal

Run the smallest maintainable product loop:

1. Prompt media library construction.
2. Canvas Prompt image generation.
3. Text Agent prompt analysis and prompt completion.

## Delivered Boundaries

- DeerFlow removed from maintained runtime and startup.
- pi text runtime added as a separate Node service.
- PI provider collection added for PI-native and SDK-backed text models.
- Ark multimodal chat retained as the first Python SDK text adapter.
- Canvas selected-text update and no-selection create proposals.
- Prompt Library search and additive creation proposals.
- Media Library image style/free-form/reverse-prompt analysis.
- Explicit Apply/Reject UI for Agent proposals.
- Existing image-generation routes and lifecycle kept independent.
- Model menus grouped by integration family with strict chat/image filtering.
- Legacy model connections recovered idempotently without moving credentials out of keyring.

## Acceptance Rules

- Selected Canvas text node can only receive an update proposal for its exact ID.
- No selected text node can only receive a create proposal.
- Prompt Library Agent can only propose additive creation.
- Media analysis sends exactly one explicitly selected image.
- No Agent tool writes directly to Canvas, Prompt Library, filesystem, or provider configuration.
- Text Agent failure does not disable Canvas editing or Image Generation.

## Deferred

- video media analysis;
- durable text-Agent conversation history;
- broader script-decomposition proposal types;
- additional PI-native providers and SDK-backed multimodal text model manifests;
- Ark AK/SK management credentials for private endpoint enumeration.
