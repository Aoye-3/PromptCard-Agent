# PromptCard-Manager Documentation

This is the single entry point for the maintained project documentation. Historical plans, extracted notes, and legacy assets live under `archive/` and `assets/`.

## Documentation Map

- [Project Overview](./00-project-overview.md)
- [Architecture](./architecture/README.md)
- [Tech Stack](./tech-stack/README.md)
- [API](./api/README.md)
- [Frontend](./frontend/README.md)
- [Backend](./backend/README.md)
- [Database and Storage](./database/README.md)
- [Operations](./operations/README.md)
- [Quality](./quality/README.md)
- [Maintenance](./maintenance/README.md)

## Current Project Shape

PromptCard-Manager is a local-first Vite, React, TypeScript application with an optional Python Agent Runtime under `agent-runtime/`. Project and Prompt Library durable data is owned by the local `promptcard-storage` service; the frontend only keeps runtime UI state and compatibility-only browser migration markers.

The root workspace `F:\.Agent-PromptCardManager` is not the project. The project repository is:

```text
F:\.Agent-PromptCardManager\PromptCard-Manager
```

## Maintenance Rule

When code changes, update the nearest documentation category in the same change. If the change touches storage, runtime integration, API routes, or user-visible workflows, also update the relevant verification checklist.
