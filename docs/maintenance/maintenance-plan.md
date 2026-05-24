# Maintenance Plan

## Every Change

- Update the nearest documentation category when behavior changes.
- Keep Prompt Library writes behind human approval unless a product decision changes that safety model.
- Add or update tests for storage, Agent proposal parsing, or project shape changes.

## Weekly

- Run `npm.cmd run test -- --run`.
- Check that `docs/README.md` links still resolve.
- Move accidental root-level reference files into `_reference` or `docs/archive/legacy`.

## Monthly

- Review Agent Runtime config, tools, and exposed frontend service calls.
- Review storage schema notes and normalization behavior.
- Archive obsolete plans and progress notes.

## Before Release

- Run the full verification checklist.
- Confirm no secrets, runtime databases, caches, or generated environments are staged.
