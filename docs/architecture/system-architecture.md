# System Architecture

## Overview

PromptCard-Manager is a local-first prompt building application with an optional Agent Runtime. The frontend is a Vite, React, TypeScript, Tailwind, and Zustand app. Project and Prompt Library durable data is owned by the local `promptcard-storage` service, which writes JSON files under `data/` and exposes revision-aware HTTP APIs.

The optional Agent Runtime is a Python service mounted under `agent-runtime/`. The frontend does not call it directly. Instead, Vite proxies runtime traffic through stable frontend routes so the browser can keep one origin during development.

## Runtime Topology

```mermaid
flowchart TD
  User["User in Browser"]
  App["React App Shell<br/>src/App.tsx"]
  Components["UI Components<br/>src/components"]
  Domain["Frontend Domain Helpers<br/>src/domain"]
  Stores["Zustand Stores<br/>src/stores"]
  Storage["Storage Facade<br/>src/utils/storage.ts"]
  StorageClient["Storage API Client<br/>src/storage/storage-service-client.ts"]
  BrowserDB["localforage<br/>UI state + one-time migration marker"]
  StorageService["promptcard-storage<br/>127.0.0.1:8002"]
  Vite["Vite Dev Server<br/>vite.config.ts<br/>vite/plugins"]
  Files["Storage JSON Files<br/>data/projects.json<br/>data/project-trash.json<br/>data/prompt-library-presets.json<br/>data/prompt-library-trash.json"]
  RuntimeBoundary["PromptCard Runtime API<br/>/api/promptcard/runtime/*"]
  Runtime["DeerFlow Runtime Internals<br/>agent-runtime/backend<br/>127.0.0.1:8001"]
  DeepSeek["DeepSeek<br/>https://api.deepseek.com"]

  User --> App
  App --> Components
  App --> Domain
  App --> Stores
  Stores --> Storage
  Storage --> Domain
  Storage --> StorageClient
  Storage --> BrowserDB
  StorageClient --> Vite
  Vite --> StorageService
  StorageService --> Files
  Components --> Stores
  Stores --> RuntimeService["agent-runtime-service.ts"]
  RuntimeService --> Vite
  Vite --> RuntimeBoundary
  RuntimeBoundary --> Runtime
  Runtime --> DeepSeek
```

## Major Modules

- **Application shell**: `src/App.tsx` owns top-level navigation, project mode switching, builder selection, and cross-store orchestration. Large screen surfaces live under `src/components/app/`.
- **Frontend components**: `src/components/` contains the app shell screens, Prompt library, card editor pieces, creative mode, settings panels, and Agent dashboard.
- **Frontend domain helpers**: `src/domain/` owns pure project normalization, storyboard row/sequence operations, and three-stage field definitions/output builders.
- **State stores**: `src/stores/` owns card workspace state, Prompt library presets, Agent runtime state, and related ordering/persistence helpers.
- **Storage facade and adapters**: `src/utils/storage.ts` preserves the app-facing storage API; `src/storage/storage-service-client.ts` calls the local storage service for project and Prompt Library durable writes; project normalization is delegated to `src/domain/projects/`.
- **Local storage service**: `promptcard_storage/` owns revision-aware project and Prompt Library persistence, Trash files, migration, and atomic JSON writes.
- **Agent service layer**: `src/services/agent-runtime-service.ts` is a thin client for the PromptCard Runtime Boundary under `/agent-api/promptcard/runtime/*`.
- **Development middleware**: `vite/plugins/promptcard-dev-storage.ts` exposes local-only endpoints for Prompt library data, project data, and dev server shutdown; `vite.config.ts` wires those plugins into Vite.
- **Agent Runtime**: `agent-runtime/` contains the PromptCard boundary router/adapter plus DeerFlow-derived internals, config, public skills, and scripts for local DeepSeek testing.

## Data Flows

### Project Flow

Projects are represented by `IPromptProject`. Card projects persist `pages` and `currentPage`; storyboard projects persist a normalized `storyboard` structure; three-stage projects persist `threeStage`. The frontend loads and saves projects through `storage.projects`, which delegates to `/storage-api/api/projects` and no longer merges durable project data from browser storage after migration.

### Prompt Library Flow

Prompt presets use the `IPreset` compatibility contract. The `preset.store` remains the UI state layer, but durable create/update/reorder/delete/usage-count operations go through `/storage-api/api/presets`. Empty-library seeding is handled by the storage service.

### Agent Proposal Flow

The Agent dashboard sends user content and optional workspace context to `/agent-api/promptcard/runtime/messages`. The backend builds the PMAgent prompt, adds a bounded Prompt Library snapshot, runs DeerFlow, extracts assistant text, validates workspace ids, and returns normalized proposals. Prompt Library writes remain pending until the user approves or rejects them in the UI.

### Local Storage Service Flow

In development, Vite proxies storage traffic to `promptcard-storage`:

- `/storage-api/api/projects/*`
- `/storage-api/api/presets/*`
- `/storage-api/api/migrate/browser-cache`
- `/storage-api/health`

The old `GET/PUT /__promptcard/presets`, `GET/PUT /__promptcard/projects`, and dev shutdown endpoints remain as compatibility middleware, but they are no longer the durable frontend storage path.

## Roadmap / Not Yet Implemented

- Full DeerFlow architecture documentation is not part of the current PromptCard-Manager integration boundary.
- Prompt library Agent writes still require proposal approval before the frontend commits them to storage.
- Production deployment and multi-user auth policy for the storage service are not finalized.
