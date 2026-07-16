# Agent Permission Boundary Implementation Plan

> Historical implementation record. The permission-scope principle remains valid, but the DeerFlow runtime and broad workspace proposal assumptions were superseded by [ADR-012](../../decisions/ADR-012-pi-text-agent-and-ark-runtime.md) and [Plan 006](../../Plan/006-pi-text-agent-minimal-closed-loop.md). Do not use this document as the current runtime contract.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Prompt Library write authority from builder AI chat assistance so Prompt Library is the only reusable prompt write interface.

**Architecture:** Keep one PromptCard Runtime Boundary, but route requests through explicit Agent permission scopes. Prompt Library runs as `prompt-library-agent`; builder chatboxes run as `workspace-chatbot-agent` and can only mutate the active workspace through scoped proposals.

**Tech Stack:** React, TypeScript, Zustand, Vite, FastAPI, Python, DeerFlow-derived Agent Runtime.

---

## Current Implementation

- [x] Add `AgentPermissionScope` with `prompt-library-agent` and `workspace-chatbot-agent`.
- [x] Send `permissionScope` through frontend runtime calls and backend `/api/promptcard/runtime/messages`.
- [x] Filter `prompt_library_write_proposal` out of workspace-chatbot responses on both frontend and backend.
- [x] Add `PromptLibraryAgentPanel` inside the Prompt Library page as the only place that can approve Prompt Library write proposals.
- [x] Convert builder surfaces to use the fixed `AIChatbotBox` alias for workspace-only Agent assistance.
- [x] Keep Agent Dashboard diagnostic-only for Prompt Library writes.

## Follow-Up Tasks

- [ ] Extend `AgentWorkspaceMode` and proposal types for `three-stage-workspace`.
- [ ] Add a three-stage workspace context builder and focused-field proposal application.
- [ ] Design durable Agent proposal/audit persistence before allowing broader automation.
- [ ] Prepare future Canvas/React Flow migration by treating card, storyboard row, and three-stage field edits as portable workspace-node operations.

## Test Cases

- [x] Frontend parser keeps Prompt Library writes in `prompt-library-agent` scope.
- [x] Frontend parser filters Prompt Library writes in `workspace-chatbot-agent` scope.
- [x] Agent store sends workspace requests with `permissionScope: "workspace-chatbot-agent"`.
- [x] Backend parser rejects Prompt Library writes in workspace scope.
- [x] Backend prompt documents Prompt Library write boundaries for both scopes.

## Verification

```powershell
npm.cmd run test -- src/services/agent-runtime-service.test.ts src/stores/agent.store.test.ts --run
$env:UV_CACHE_DIR='F:\.Agent-PromptCardManager\PromptCard-Manager\agent-runtime\backend\.uv-cache'; uv run pytest tests/test_promptcard_runtime_boundary.py -q
npx.cmd tsc --noEmit
```

## Assumptions

- Prompt Library is the only UI that can approve create, update, or archive operations for `IPreset`.
- Builder AIChatbotBox surfaces may read/select existing Prompt Library content, but do not write reusable presets.
- PromptCard-Manager manages prompts, scripts, Prompt Library assets, and storyboards. It does not implement video generation.
