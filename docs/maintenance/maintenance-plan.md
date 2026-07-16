# Maintenance Plan

## Every Change

- Update the nearest documentation category when behavior changes.
- Keep Prompt Library writes behind human approval unless a product decision changes that safety model.
- Add or update tests for storage, Agent proposal parsing, or project shape changes.

## Weekly

- Run `npm.cmd test -- --run`.
- Check that `docs/README.md` links still resolve.
- Move accidental root-level reference files into `_reference` or `docs/archive/legacy`.

## Monthly

- Review the pi tool allowlist, Gateway routes, model assignments, and exposed frontend service calls.
- Confirm current-state docs do not reintroduce DeerFlow/LangGraph assumptions; keep those names only in clearly historical or removal context.
- Review storage schema notes and normalization behavior.
- Archive obsolete plans and progress notes.

## Before Release

- Run the full verification checklist.
- Confirm no secrets, runtime databases, caches, or generated environments are staged.
