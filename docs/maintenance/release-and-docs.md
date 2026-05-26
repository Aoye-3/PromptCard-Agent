# Release and Documentation

## Release Checklist

Before merging to `main`:

- `npm.cmd run lint`
- `npm.cmd test -- --run`
- `npm.cmd run build`
- `python -m unittest promptcard_storage.tests.test_store`
- `git diff --check`
- review `git status --short`
- confirm docs changed with code behavior
- confirm no API keys, runtime caches, virtual environments, or local runtime databases are staged
- confirm incomplete capabilities are marked as roadmap or not yet implemented

For Agent Runtime changes, also run:

```powershell
npm.cmd run agent:check
```

## Documentation Policy

When code changes, update the nearest maintained documentation in the same change. Prefer a small number of current, high-signal documents over many short fragments.

Use archive documents only for historical context. Do not link current behavior to `docs/archive/legacy`.

## Change Log Policy

User-visible behavior changes should be summarized in the final response and in release notes when a formal release is cut. Internal refactors only need documentation when they change ownership, contracts, APIs, storage, or verification steps.

## Maintenance Plan

Keep these documents current:

- `docs/README.md`: documentation entry point
- `docs/00-project-overview.md`: project summary
- `docs/frontend/application.md`: frontend shell, builders, state, and storage
- `docs/frontend/prompt-library.md`: Prompt Library behavior
- `docs/database/storage.md`: storage ownership and schemas
- `docs/operations/runbook.md`: local operation steps
- `docs/quality/testing-strategy.md`: verification strategy

Do not add a new document when an existing maintained document can absorb the information cleanly.
