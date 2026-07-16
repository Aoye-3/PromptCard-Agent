# Prompt Library Agent Batch Ingest Implementation Plan

> Historical implementation record. The additive approval rule remains valid, but the DeerFlow tool description was superseded by the focused pi tools in [ADR-012](../../decisions/ADR-012-pi-text-agent-and-ark-runtime.md) and [Text Agent Tools](../../backend/skills-and-tools.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Prompt Library two-column PMAgent workflow for decomposing long prompts into multiple additive, user-approved library entries.

**Architecture:** Prompt Library remains the only write interface for reusable presets. Agent proposals are create-only and must pass frontend and backend filters before the Prompt Library UI can approve them through `preset.store.addPreset()`.

**Tech Stack:** React, TypeScript, Zustand, Vite, FastAPI, Python, DeerFlow-derived Agent Runtime.

---

## Current Implementation

- [x] Added create-only filtering for Prompt Library Agent proposals in frontend parsing.
- [x] Added create-only filtering and prompt instructions in the PromptCard runtime boundary.
- [x] Narrowed the DeerFlow `prompt_library_propose_write` tool to additive create proposals.
- [x] Added `PromptLibraryAgentPanel` as a right-side PMAgent assistant with proposal selection, single approval/rejection, batch approval, batch rejection, and clear selection.
- [x] Reworked the Prompt Library page into a two-column workspace: library management on the left, PMAgent assistant on the right.
- [x] Added reusable proposal helpers for validating additive proposals and converting approved proposals into `IPreset` drafts.

## Acceptance Rules

- Agent proposals can only create new Prompt Library presets.
- Agent proposals with `operation: "update"` or `operation: "archive"` are rejected before reaching approval UI.
- Batch approval only writes selected pending create proposals.
- Batch rejection only changes proposal status and never mutates Prompt Library data.
- Invalid preset types are normalized to `custom`; empty labels or content are rejected.

## Verification

```powershell
npm.cmd run test -- src/services/agent-runtime-service.test.ts src/utils/prompt-library-agent-proposals.test.ts --run
npx.cmd tsc --noEmit
$env:UV_CACHE_DIR='F:\.Agent-PromptCardManager\PromptCard-Manager\agent-runtime\backend\.uv-cache'; uv run pytest tests/test_promptcard_runtime_boundary.py -q
```

## Follow-Up

- Add browser smoke coverage for the two-column Prompt Library layout once Playwright is active in the current dev server.
- Consider durable proposal audit storage before expanding Agent approval workflows beyond Prompt Library creates.
