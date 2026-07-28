# Project Overview

PromptCard-Manager is a local-first prompt and visual-production workspace. It combines a Prompt media library, Free Canvas, provider-neutral image generation, and a focused text Agent.

## Minimal Closed Loop

The current delivery target is:

1. Prompt media library construction.
2. Image generation from Canvas prompts.
3. Prompt analysis and prompt completion through the text Agent.
4. Contextual image operations and explicit front/left/top multi-view generation with recoverable, independently retryable members.

## Primary Capabilities

- Prompt Library preset management using the `IPreset` compatibility contract.
- Media Library capture, registration, reuse, and image style/prompt analysis.
- Free Canvas text and image nodes.
- Canvas Prompt image generation through the existing provider-neutral Image Generation module.
- Contextual image actions that resolve local edits immediately and require an explicit Generate action for provider-backed operations.
- Explicit multi-view request groups, including the front/left/top shortcut, durable placeholders, partial-failure recovery, and retry of only the failed member.
- A pi-based text Agent that can:
  - analyze and improve a selected Canvas text node;
  - propose a new Canvas text node when none is selected;
  - write from a bounded Prompt Library snapshot;
  - propose new Prompt Library items;
  - analyze one explicitly selected image through the assigned multimodal text provider.
- Storyboard and structured prompt workflows.

All Agent mutations are proposals and require explicit user confirmation.

The contextual image and multi-view work is tracked in [Plan 007](./Plan/007-contextual-image-editing-and-multi-view-plan.md). Its zero-cost Fake Provider automation is complete, but the plan remains `Active` until unified human acceptance is approved; paid live-provider gates have not been executed.

## Runtime Shape

- React/Vite frontend
- PromptCard Storage service
- Python PromptCard Gateway for model management, keyring-owned provider access, SDK text adapters, media access, and independent image generation
- Node pi text runtime for the focused Agent loop and PI provider collection

DeerFlow and LangGraph have been removed from the maintained runtime.

## Repository Boundary

The repository root is `PromptCard-Manager`. The parent folder is a workspace container and may contain reference materials or legacy local-only artifacts.

Model credentials belong in the operating-system keyring. Maintained launchers do not consume `API-Key.txt`.

## Main Commands

```powershell
npm.cmd run dev
npm.cmd run dev:with-agent
npm.cmd run agent:dev
npm.cmd run text-agent:dev
npm.cmd run agent:check
npm.cmd test -- --run
npm.cmd run test:frontend
npm.cmd run test:e2e
npm.cmd run build
```
