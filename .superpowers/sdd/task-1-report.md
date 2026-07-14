# Task 1 report: provider-neutral model and image-generation contracts

## Implementation summary

- Added provider-neutral model-management contracts for providers, catalog entries, connections, model assignments, image model bindings, modalities, and primary slots.
- Added pure `validateModelAssignment` slot compatibility validation with stable `model_not_found` and `incompatible_model_slot` error codes.
- Added provider-neutral image-generation contracts for modes, inputs, point/bbox regions, intents, capability manifests, and validation errors.
- Added the exact Seedream 5.0 Pro capability manifest for `doubao-seedream-5-0-pro-260628`.
- Added pure `validateImageGenerationIntent` validation for blank prompts, unsupported modes/resolutions, excessive references, invalid output counts, and incomplete region-edit intents.
- Added no API client, persistence, canvas UI, SDK types, plugin registry, credentials, secrets, or UI-facing validation strings.

## TDD evidence

### RED: missing requested modules

Command:

```text
npm.cmd test -- --run src/domain/models/model-management.test.ts src/domain/image-generation/image-generation.test.ts
```

Result: exit 1. Both tests failed as expected because the requested modules did not exist (`promise rejected ... instead of resolving`; 2 failed test files, 2 failed tests).

### Scaffold GREEN

The minimum empty modules were added so behavioral tests could fail through assertions rather than import/transform errors.

Command:

```text
npm.cmd test -- --run src/domain/models/model-management.test.ts src/domain/image-generation/image-generation.test.ts
```

Result: exit 0; 2 test files passed, 2 tests passed.

### RED: missing contract behavior

After adding the complete behavioral tests, the same focused command returned exit 1 with 13 expected assertion failures and 1 passing structural contract fixture. Failures reported the absent Seedream manifest and absent validation functions (`expected undefined to deeply equal ...` / `expected undefined to be type of 'function'`).

### GREEN: implemented contracts and validators

Command:

```text
npm.cmd test -- --run src/domain/models/model-management.test.ts src/domain/image-generation/image-generation.test.ts
```

Result: exit 0; 2 test files passed, 14 tests passed.

## Verification commands and results

### Focused domain tests

```text
npm.cmd test -- --run src/domain/models/model-management.test.ts src/domain/image-generation/image-generation.test.ts
```

Exit 0: 2/2 files and 14/14 tests passed.

### Full frontend suite

```text
npm.cmd test -- --run
```

Exit 0: 58/58 files and 304/304 tests passed in 21.41s. Existing `useLayoutEffect` server-render warnings appeared in `BuilderModePreviewFrame.test.tsx`; Task 1 does not touch that component.

### Type/build check

```text
npm.cmd run build
```

Exit 0: `tsc && vite build` completed; 1,598 modules transformed and the production bundle was written. Existing warnings remained for the `.w-2/3` CSS selector, mixed static/dynamic Tauri imports, and bundle chunk size.

## Changed files

- `src/domain/models/model-management.ts`
- `src/domain/models/model-management.test.ts`
- `src/domain/image-generation/image-generation.ts`
- `src/domain/image-generation/image-generation.test.ts`
- `.superpowers/sdd/task-1-report.md`

## Requirement self-review

- Exact Seedream model id: verified by manifest assertion.
- Modes `generate`, `edit`, `region-edit`: verified by exact manifest assertion.
- Maximum 10 reference images, `ordered-image-labels`, point/bbox regions, `1K`/`2K`, one output, and no streaming: verified by exact manifest assertion and focused validator tests.
- Cross-modality primary-slot rejection: both directions have dedicated tests; compatible assignments are accepted.
- Intent rejection cases: blank prompt, 11 references, `4K`, output counts 0 and 2, missing source image, and missing region all have focused tests.
- Stable error codes contain no display messages or UI strings.
- Implementation is pure and has no dependencies or side effects.
- `threeStage.meta.freeCanvas` and all unrelated source files were untouched.

## Concerns

No Task 1 correctness concerns. The full suite/build emit pre-existing warnings listed above; all required commands exit successfully.
