# Agent Runtime Boundary

PromptCard-Manager owns a small runtime boundary API in front of the DeerFlow-derived Agent Runtime. The frontend should treat DeerFlow internals as private implementation detail.

The product boundary is prompt, script, Prompt Library, and storyboard management. PromptCard-Manager does not provide video generation. Future image generation APIs may be integrated as optional output targets, but they must remain separate from the Prompt Library and workspace editing permission model.

## Boundary Layers

```mermaid
flowchart TD
  UI["React Agent UI"]
  Store["src/stores/agent.store.ts"]
  Client["src/services/agent-runtime-service.ts"]
  Vite["Vite proxy /agent-api"]
  Boundary["PromptCard Runtime API<br/>/api/promptcard/runtime/*"]
  Adapter["PromptCard runtime adapter<br/>app/gateway/promptcard_runtime.py"]
  DeerFlow["DeerFlow Gateway internals<br/>threads, runs, auth, config"]
  Storage["promptcard-storage<br/>127.0.0.1:8002"]
  Model["DeepSeek"]

  UI --> Store --> Client --> Vite --> Boundary --> Adapter
  Adapter --> DeerFlow --> Model
  Adapter --> Storage
```

## Public PromptCard API

Frontend code calls only these PromptCard-owned endpoints through `/agent-api`:

- `GET /promptcard/runtime/status`
- `POST /promptcard/runtime/bootstrap`
- `GET /promptcard/runtime/catalog`
- `POST /promptcard/runtime/messages`

The older DeerFlow routes under `/api/threads`, `/api/models`, `/api/tools`, `/api/skills`, `/api/agents`, and `/api/v1/auth` remain available for compatibility and internal adapter use, but new PromptCard UI work should not couple directly to them.

## Responsibility Split

- Frontend store: UI state, active thread id, visible messages, pending proposals.
- Frontend service: HTTP calls to the PromptCard boundary and legacy proposal parser compatibility only.
- PromptCard adapter: PMAgent prompt construction, Prompt Library snapshot loading, DeerFlow thread/run orchestration, assistant text extraction, proposal parsing, permission-scope filtering, and workspace-id validation.
- DeerFlow internals: auth/session, thread/run persistence, model execution, skills, tools, and sandbox/runtime plumbing.
- Storage service: durable Prompt Library and project JSON persistence.

## Permission Scopes

Agent Runtime requests carry one of two PromptCard permission scopes:

- `prompt-library-agent`: used only by the Prompt Library page. It may produce `prompt_library_write_proposal` records for user-approved create operations only.
- `workspace-chatbot-agent`: used by fixed AIChatbotBox surfaces inside card, storyboard, three-stage, and future Canvas builders. It may help build, rewrite, select, and complete the current workspace, but it must not emit or execute Prompt Library writes.

Prompt Library is the only write entry point for reusable prompt decomposition and storage. Builder chatboxes may read or refer to existing Prompt Library content, but if a workspace result should become reusable, the Agent should tell the user to go to Prompt Library rather than creating a write proposal in place. Agent-generated library writes are additive: no Agent path may update, archive, delete, overwrite, or replace existing presets.

## Proposal Safety

The adapter validates model-returned workspace instructions before they reach the UI:

- `workspace_card_update` keeps only updates whose `cardId` exists in the workspace snapshot when a snapshot is available.
- `storyboard_update` rejects unknown `sequenceId` or `rowId` when those ids are known.
- `workspace_card_create` requires a draft type and content.
- `prompt_library_write_proposal` is accepted only in `prompt-library-agent` scope, only with `operation: "create"`, and still requires explicit approval in the Prompt Library page.

## Local Runtime Contract

`npm.cmd run dev:with-agent` starts or reuses:

- storage service on `127.0.0.1:8002`
- Agent Runtime on `127.0.0.1:8001`
- Vite frontend on `localhost:3000` with strict port behavior

Background service logs live under `logs/`.
