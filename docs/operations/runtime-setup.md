# Runtime Setup

Run Agent Runtime checks from the project root:

```powershell
npm.cmd run agent:check
```

Start the runtime:

```powershell
npm.cmd run agent:dev
```

Start frontend and runtime together:

```powershell
npm.cmd run dev:with-agent
```

The runtime scripts set `DEER_FLOW_PROJECT_ROOT`, `DEER_FLOW_HOME`, `DEER_FLOW_CONFIG_PATH`, and `PROMPTCARD_LIBRARY_FILE` based on the project root.

`npm.cmd run dev:with-agent` also allocates local service ports and writes:

```text
logs/dev-runtime.json
```

Use that manifest for the active frontend, Agent Runtime, and storage URLs. The frontend stays on `/agent-api` and `/storage-api`; Vite proxies those routes to the manifest-backed `PROMPTCARD_AGENT_URL` and `PROMPTCARD_STORAGE_URL`.

Environment overrides:

- `PROMPTCARD_FRONTEND_PORT`: strict frontend port; defaults to preferred `3000` with fallback when unset.
- `PROMPTCARD_AGENT_PORT`: strict Agent Runtime port; defaults to a free local port when unset.
- `PROMPTCARD_STORAGE_PORT`: strict storage service port; defaults to a free local port when unset.
- `PROMPTCARD_DEV_RUNTIME_MANIFEST`: custom manifest path; defaults to `logs/dev-runtime.json`.
- `PROMPTCARD_IMAGE_GENERATION_NODE_V1`: trusted Agent Runtime rollout gate for real image generation. A directly started Runtime treats it as disabled unless set to `true`, `1`, `yes`, or `on`; the combined development launcher defaults it to `1` when no explicit override exists.

## Enabling Image Generation

1. Run `npm.cmd run agent:check` and keep any repair/cache paths inside the current F: workspace.
2. Start PromptCard without a credential; health and model catalog must still load.
3. In Image Generation Models, create a Volcengine Ark connection, save and successfully test it, then assign Seedream to `image.primary`. The credential is saved to the OS keyring and is immediately cleared from the browser draft.
4. Enable the frontend user-settings flag `meta.featureFlags.imageGenerationNodeV1` for the rollout cohort.
5. Restart Agent Runtime with `PROMPTCARD_IMAGE_GENERATION_NODE_V1=true`.

The server gate is checked before run creation, credential lookup, or SDK invocation. Turning it off is the safe first rollback step and does not remove model metadata, history, assets, or Recent Captures.

Development and test defaults enable both creation and Runtime gates so the end-to-end interaction is discoverable. Production builds keep the creation entry in gray rollout by default, and production Runtime processes must explicitly enable real generation. An explicit persisted frontend flag or environment override wins over the development default. Disabling either gate does not hide existing nodes or make their results/history unreadable.

## Image Runtime Diagnostics

The Image Generation Models page reads `GET /agent-api/promptcard/runtime/image-generation-status`. Refreshing the page or choosing re-detect calls the same read-only endpoint again. Runtime SDK management deliberately does not expose install, repair, shell, or package-manager execution APIs.

| Status | Meaning | Operator action |
| --- | --- | --- |
| `ready` | Keyring and exact Ark SDK contract can be evaluated. | Continue with connection test and assignment. |
| `missing` | The Ark package cannot be imported. | Run `npm.cmd run agent:check`, then use its workspace-local repair command. |
| `incompatible` | An Ark version is installed but does not match the required version. | Repair the locked dependency and re-detect. |
| `check_failed` | Version detection failed without a safe diagnostic. | Inspect Runtime health/logs, repair the environment, and re-detect. |

Keyring unavailability is reported separately. PromptCard never falls back to plaintext storage; unlock or repair the operating-system credential backend before saving a connection.

## Release Smoke Checklist

Before enabling production rollout, use the same Windows user for the desktop app, Agent Runtime, and Credential Locker, then manually verify:

- text to image;
- multiple reference images plus stable `@` mentions after reorder;
- Smart Edit;
- point region edit;
- bounding-box region edit;
- restart recovery, history access, and Media reuse.

Do not record the API key, provider response body, temporary result URL, or local credential path in screenshots or logs. The current automation status and remaining environment-dependent checks are tracked in [Seedream frontend implementation status](../Plan/005-seedream-image-node-frontend-implementation-status.md).
