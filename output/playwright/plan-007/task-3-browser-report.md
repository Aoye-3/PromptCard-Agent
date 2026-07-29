# Plan 007 browser acceptance report

- Browser capture commit: `997eb9f0e8b857d46e78bc7a6c036c2b3315edbe`
- Final reviewed code commit: `26a0b435bd3079f8219fb0fff3d30264f0d268f2`

## Gate evidence summary

- B0: `automated-ready`; Storage health, generic Runtime startup, image-generation readiness, catalog, assignments, and connections are covered by the local fixture with 0 paid Provider access. E-002 is fixed in automated coverage; fresh human approval evidence is pending.
- B1: shared semantic validation, immutable operation/source/recipe/group snapshot meaning, and rejection before Run/Provider access are covered by the Runtime `96 passed` and Storage `87 passed` suites. The redacted browser Storage roundtrip is supplementary evidence; human approval pending.
- B2: Fake Provider coverage proves placeholder/Run persistence before invocation, localization before success, source retention, terminal failure/retry history, idempotent hydration, and lineage. The browser slice separately proves the multi-view pre-submit boundary with 0 generation POSTs, Runs, and Provider requests; human approval pending.
- B7: post-remediation image-generation configuration passed `5/5`, and full E2E passed `26/26`; both returned exit code 0 and released their ports. The retry UI locked the failed member's original view, submission rejected synchronous `viewSpec`/selection tampering, duplicate-lineage regression proved exact `nodeId` binding, and a valid retry reused node/item/group/view, created only one new Run, retained the failed Run in history, and ended with the same three members and a succeeded group. Human approval pending.

## Final automated regression

- Direct shell bare `npm.cmd run test:e2e`: 26/26 passed, exit code 0, ports released.
- Image-generation configuration: 5/5 passed, exit code 0, ports released.
- Pipeline EOF multi-view: 2/2 passed in 45.1s, exit code 0.
- Intentional no-match invocation: exit code 1.
- Frontend: 106 files and 648 tests passed, including navigation-cancellation classification, retry-integrity, and exact-node binding defenses.
- Storage: 87/87 passed using the repository Python environment.
- Production build and `agent:check` passed.

## Executed

- F1 automated slice: populated canvas visible on load, image selection, Fit View, explicit save/autosave window, Storage snapshot, reload, and restored visibility. Functional assertions PASS. E-001 is fixed in automated coverage; a fresh manual Console/Network capture remains pending.
- F4 pre-submit boundary slice: multi-view workbench opened from the image context menu; right-side image-generation tab and draft remained stable; cancel produced 0 generation POSTs, 0 Runs, and 0 Fake Provider requests. PASS for this workbench only.
- F6 local Fake Provider closure passed within the post-remediation 5/5 image-generation configuration, with the earlier pipeline EOF multi-view run passing 2/2 in 45.1s. Coverage includes success, partial, retry-view UI locking, synchronous tamper rejection, duplicate-lineage exact-node binding, identity-preserving failed-member retry, historical failed Run retention, final three-member group success, geometry, reload/project-switch deduplication, and lineage. PASS (automated evidence; human approval pending).

## Captured findings

| ID | Observation | Owner | Severity | Release handling |
|---|---|---|---:|---|
| E-001 | The original console summary contains one `StorageHttpError` from a PUT aborted around reload, although the pre-reload and restored Storage snapshots both retain all three nodes and the source asset. | Engineering | Medium | Fixed on 2026-07-29: lifecycle cancellation now reaches project writes as an external signal and only unloading-time `request_aborted` is suppressed. Unit and reload E2E regressions pass; fresh manual capture pending. |
| E-002 | The original fixture returned 404 for generic Runtime status probes; the local catalog still enabled the multi-view action and no generation was submitted. | Test infrastructure | Low | Fixed on 2026-07-29: the Fake Runtime now implements status, bootstrap, catalog, and model-config. Proxy-contract plus page-level no-4xx regressions pass; fresh manual capture pending. |

The sanitized network artifact contains API-level method, redacted pathname, status, and count only. Query strings, hosts, headers, bodies, local paths, credentials, and Provider response bodies are excluded. Forty navigation-cancelled Vite development asset requests are represented by one aggregate count rather than individual paths. This JSON remains the historical discovery-run artifact and was intentionally not rewritten as post-fix evidence.

## Pending human observation

| Area | Owner | Severity | Release handling |
|---|---|---:|---|
| F2 four-corner containment, 25/100/200% canvas zoom, dismissal consistency | User/reviewer | Medium | Observe before unified approval; record any escape/accidental request as release blocker. |
| F3 keyboard traversal, focus restore, editable shortcut suppression, 200% browser text zoom, high contrast | User/reviewer | High | Accessibility observations required before unified approval. |
| F4 all other enabled workbenches and As-reference append-only behavior | User/reviewer | High | This run proves only multi-view pre-submit; inspect remaining enabled workbenches before approval. |
| F5 non-destructive edit, Undo/Redo, original-vs-visible export, deletion/source retention | User/reviewer | High | Must be observed before unified approval. |
| F7 document/image/draft/run separation and capability-limited model behavior | User/reviewer | High | Must be observed before unified approval. |

B3-B6 and B8-B9 remain unexecuted. Plan status must remain Active. No human approval is claimed.
