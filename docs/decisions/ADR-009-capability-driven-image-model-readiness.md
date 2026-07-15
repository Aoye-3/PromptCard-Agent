# ADR-009: Drive Image UI From Catalog Capabilities And Gate Assignments On Proven Readiness

- Status: Accepted
- Date: 2026-07-15
- Owners: PromptCard frontend and Agent Runtime

## Context

The first Seedream integration had provider-neutral storage and generation orchestration, but important behavior remained implicit. The frontend could branch on a model ID, connection assignment could look valid before a successful test, and dependency diagnostics were not visible as a stable product contract. These gaps made the canvas entry difficult to expose safely and would make a second image provider expensive to add.

Connection deletion also needs both assignment and canvas-node dependency information. The Agent Runtime currently owns assignments but does not yet have an authoritative cross-project canvas reference count from PromptCard Storage. Reporting an unavailable count as zero would permit destructive deletion under uncertainty.

## Decision

1. The provider-neutral model catalog is the single source of truth for image UI controls. The frontend consumes advertised modes, resolutions, aspect ratios, custom-size constraints, formats, watermark support, reference limits, region inputs, output count, and streaming support.
2. An assignment requires an enabled connection, configured keyring credential, matching provider/model/modality, the latest persisted successful connection test, and a compatible provider runtime dependency. Ark image assignments require the pinned Ark SDK contract to be ready.
3. Changing provider, API base, credential, or enabled state invalidates the stored test result. Test success has no time-based TTL because it proves configuration consistency, not continuous provider availability.
4. Image-runtime diagnostics are read-only. Re-detection repeats a GET request; the API does not install packages, run repair commands, or expose filesystem details.
5. Unknown canvas dependency counts fail closed. The dependency response uses `canvasNodeCount: null` plus `canvasNodeCountAvailable: false`, and the model-management UI blocks deletion until an authoritative zero is available.
6. Frontend node creation and Runtime provider execution remain separate rollout gates. Disabling creation does not hide existing nodes, results, history, or media; disabling Runtime execution does not delete durable state.

## Alternatives considered

### Branch on Seedream model IDs in the Inspector

Rejected because every provider or model revision would require UI conditionals and could drift from server validation.

### Allow assignment after saving a connection

Rejected because the default slot would appear ready without proving credential access, endpoint validity, or provider dependency compatibility.

### Expire successful tests on a fixed timer

Rejected for the first release. A TTL would turn temporary provider availability into configuration invalidation and create nondeterministic defaults. Explicit testing remains available at any time.

### Install or repair the SDK through Runtime APIs

Rejected because package-manager and shell execution would materially expand the remote-control and supply-chain boundary. Operators repair the locked workspace environment outside the HTTP API.

### Treat an unavailable canvas count as zero

Rejected because it could delete credentials and connection metadata still referenced by durable projects.

## Consequences

- Adding an image model requires accurate catalog capabilities and a provider adapter, but existing controls can remain provider-neutral.
- Model management performs an additional diagnostics read and preserves the latest connection test in connection metadata.
- Operators must re-test after material connection changes; transient provider downtime does not silently clear an otherwise consistent assignment.
- Connection deletion is intentionally unavailable while canvas dependency counting is not wired to Storage. This is safer but less convenient until that integration is implemented.
- Development can expose the complete workflow by default, while production keeps independent creation and execution rollout controls.

## Follow-up

- Add an authoritative Storage-backed cross-project image-generator reference count and enable deletion only when assignments are empty and the count is zero.
- Keep the model catalog, API documentation, Inspector controls, and provider adapter tests aligned whenever capabilities change.
- Complete Windows Credential Locker and live Ark smoke tests before enabling production rollout.
