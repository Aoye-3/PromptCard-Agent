# Extensible Model Provider Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore saved model configuration and provide categorized, modality-safe model discovery with a PI-native extensible text provider layer that remains isolated from image generation.

**Architecture:** The Python Gateway keeps credentials and exposes provider-neutral connection discovery plus separate text-SDK and image-SDK boundaries. The Node text runtime constructs a PI `Models` collection and resolves `chat.primary` into either a PI-native or SDK-backed registered provider. Frontend selectors group normalized descriptors by integration family and strictly filter by modality.

**Tech Stack:** FastAPI/Pydantic/Python 3.12, pytest, React/TypeScript, Vitest, `@earendil-works/pi-ai` 0.80.8, `@earendil-works/pi-agent-core` 0.80.8, Volcengine Ark SDK 5.0.36.

## Completion record

Implemented on `feat/extensible-model-provider-discovery` on 2026-07-17. Final verification used the repository's actual commands: `npm.cmd test -- --run` (529 tests), `npx.cmd tsc --noEmit`, `npm.cmd run text-agent:check`, `npm.cmd run build`, `npm.cmd run agent:check`, backend pytest (203 tests), and Ruff with `--no-cache`. The older `npm run typecheck` and `npm --prefix text-agent-runtime` examples below are planning artifacts; the root package owns both test and typecheck scripts.

## Global Constraints

- Work only in `F:\.Agent-PromptCardManager\PromptCard-Manager` on an in-place Git branch; no worktrees or repository copies.
- Credentials remain in the Python process and OS keyring; JSON persists credential references only.
- Bindings remain `chat.primary` and `image.primary`.
- Text menu groups are `PI 原生` and `方舟 SDK`; image menu begins with `方舟 SDK`.
- Image selectors never receive chat-only entries.
- PI text invocation and image generation remain independent modules.
- Preserve existing Canvas node and image-generation request contracts.

---

### Task 1: Recover legacy connection state and fix bootstrap ordering

**Files:**
- Modify: `agent-runtime/backend/app/gateway/model_management/migration.py`
- Modify: `agent-runtime/backend/app/gateway/routers/model_management.py`
- Test: `agent-runtime/backend/tests/test_model_connections.py`
- Modify: `src/components/AgentDashboard.tsx`
- Modify: `src/components/settings/ModelManagementPanel.tsx`
- Test: `src/components/AgentDashboard.test.tsx`
- Test: `src/components/settings/ModelManagementPanel.test.tsx`

**Interfaces:**
- Produces: `migrate_legacy_connection_state(legacy_path: Path, store: ModelConnectionStore) -> bool`
- Produces: `ModelManagementPanel` receives an authenticated readiness signal and reload token rather than issuing protected requests during bootstrap.

- [ ] **Step 1: Add failing backend migration tests**

Add tests that create an old state with a stable connection ID and assignment, leave the destination empty, run migration twice, and assert one recovered connection, preserved IDs, no secret in JSON, and unchanged keyring lookup.

```python
assert migrate_legacy_connection_state(legacy_path, store) is True
assert migrate_legacy_connection_state(legacy_path, store) is False
assert store.assignment("image.primary") == {
    "slot": "image.primary",
    "connectionId": connection_id,
    "modelId": "doubao-seedream-5-0-pro-260628",
}
assert store.credential_store.get(connection_id) == "saved-secret"
assert "saved-secret" not in store.path.read_text(encoding="utf-8")
```

- [ ] **Step 2: Run the targeted migration tests and confirm failure**

Run:

```powershell
agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime/backend/tests/test_model_connections.py -q -p no:cacheprovider
```

Expected: the new migration import or assertion fails.

- [ ] **Step 3: Implement an idempotent merge migration**

Implement `migrate_legacy_connection_state` with these rules:

```python
destination = store.read_state()
known_ids = {item["id"] for item in destination["connections"]}
for connection in source["connections"]:
    if connection["id"] not in known_ids:
        destination["connections"].append(connection)
for slot, assignment in source["assignments"].items():
    destination["assignments"].setdefault(slot, assignment)
store.validate_state(destination)
store.replace_state(destination)
```

Invoke it from `_store()` using the sibling directory:

```python
legacy_path = store.path.parent.parent / ".deer-flow" / store.path.name
migrate_legacy_connection_state(legacy_path, store)
```

- [ ] **Step 4: Add failing frontend bootstrap-order tests**

Assert that model catalog/connection requests are absent before `bootstrapRuntime()` resolves, then issued once after the authenticated runtime becomes ready.

```typescript
expect(modelManagementClient.getCatalog).not.toHaveBeenCalled()
resolveBootstrap({ authenticated: true })
await waitFor(() => expect(modelManagementClient.getCatalog).toHaveBeenCalledTimes(1))
```

- [ ] **Step 5: Gate model-panel loading on authenticated readiness**

Pass a boolean readiness prop or render the panel only after the parent runtime bootstrap succeeds. Keep provider credential errors separate from local-session authentication failures.

- [ ] **Step 6: Run backend and frontend targeted tests**

Run:

```powershell
agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime/backend/tests/test_model_connections.py -q -p no:cacheprovider
npm.cmd test -- --run src/components/AgentDashboard.test.tsx src/components/settings/ModelManagementPanel.test.tsx
```

Expected: all targeted tests pass.

### Task 2: Add provider capability registry and connection model discovery

**Files:**
- Create: `agent-runtime/backend/app/gateway/model_management/provider_registry.py`
- Modify: `agent-runtime/backend/app/gateway/model_management/catalog.py`
- Modify: `agent-runtime/backend/app/gateway/model_management/service.py`
- Modify: `agent-runtime/backend/app/gateway/routers/model_management.py`
- Test: `agent-runtime/backend/tests/test_model_connections.py`

**Interfaces:**
- Produces: `IntegrationGroup(id: str, display_name: str, kind: Literal["pi-native", "sdk"])`
- Produces: `ProviderModelDescriptor` normalized dictionaries.
- Produces: `discover_connection_models(connection_id: str) -> dict[str, Any]`
- Produces: `GET /model-connections/{connection_id}/models`.

- [ ] **Step 1: Write failing registry/discovery tests**

Test the initial mapping:

```python
assert registry.provider("deepseek").group_for("chat").id == "pi-native"
assert registry.provider("volcengine-ark").group_for("chat").id == "volcengine-ark-sdk"
assert registry.provider("volcengine-ark").group_for("image").id == "volcengine-ark-sdk"
assert all(model["providerId"] == "volcengine-ark" for model in discovered["models"])
```

Test that Ark probing uses `/ping` and DeepSeek probing uses `/models` by substituting a fake HTTP opener and asserting the requested URL.

- [ ] **Step 2: Run discovery tests and confirm failure**

Run:

```powershell
agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime/backend/tests/test_model_connections.py -q -p no:cacheprovider
```

Expected: registry and discovery symbols do not exist.

- [ ] **Step 3: Implement normalized provider definitions**

Use immutable definitions and explicit modality groups:

```python
PROVIDER_DEFINITIONS = {
    "deepseek": ProviderDefinition(
        id="deepseek",
        display_name="DeepSeek",
        default_api_base="https://api.deepseek.com",
        integration_groups={"chat": PI_NATIVE_GROUP},
        probe_path="/models",
    ),
    "volcengine-ark": ProviderDefinition(
        id="volcengine-ark",
        display_name="Volcengine Ark",
        default_api_base="https://ark.cn-beijing.volces.com/api/v3",
        integration_groups={"chat": ARK_SDK_GROUP, "image": ARK_SDK_GROUP},
        probe_path="/ping",
    ),
}
```

Map static supported entries into connection-scoped results with `source: "provider-catalog"` and `assignable: true`.

- [ ] **Step 4: Replace the global probe assumption**

Change `probe_connection` to accept a provider definition or provider ID and construct its declared probe URL. Do not require every provider to implement `/models`.

- [ ] **Step 5: Add the discovery route and structured errors**

Return the normalized response and add `model_discovery_unsupported`, `model_discovery_failed`, and `text_provider_unsupported` to `_error_detail`.

- [ ] **Step 6: Run backend model-management tests**

Run:

```powershell
agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime/backend/tests/test_model_connections.py -q -p no:cacheprovider
agent-runtime\backend\.venv\Scripts\python.exe -m ruff check agent-runtime/backend/app/gateway/model_management agent-runtime/backend/app/gateway/routers/model_management.py agent-runtime/backend/tests/test_model_connections.py
```

Expected: tests and Ruff pass.

### Task 3: Expose categorized, modality-safe frontend bindings

**Files:**
- Modify: `src/domain/models/model-management.ts`
- Modify: `src/services/model-management-client.ts`
- Modify: `src/components/settings/ModelManagementPanel.tsx`
- Test: `src/domain/models/model-management.test.ts`
- Test: `src/services/model-management-client.test.ts`
- Test: `src/components/settings/ModelManagementPanel.test.tsx`

**Interfaces:**
- Produces: `ModelIntegrationGroup` and expanded `ModelCatalogEntry`.
- Produces: `getConnectionModels(connectionId: string): Promise<ConnectionModelCatalog>`.
- Produces: `groupAssignableModels(models, modality)` with strict modality filtering.

- [ ] **Step 1: Add failing normalization and grouping tests**

```typescript
const imageGroups = groupAssignableModels(entries, 'image')
expect(imageGroups.map(group => group.displayName)).toEqual(['方舟 SDK'])
expect(imageGroups.flatMap(group => group.models).every(model => model.modality === 'image')).toBe(true)

const chatGroups = groupAssignableModels(entries, 'chat')
expect(chatGroups.map(group => group.displayName)).toEqual(['PI 原生', '方舟 SDK'])
```

- [ ] **Step 2: Run targeted frontend tests and confirm failure**

Run:

```powershell
npm.cmd test -- --run src/domain/models/model-management.test.ts src/services/model-management-client.test.ts src/components/settings/ModelManagementPanel.test.tsx
```

Expected: new types, client method, or grouping helper is missing.

- [ ] **Step 3: Add normalized types and defensive client parsing**

Define:

```typescript
export interface ModelIntegrationGroup {
  id: string
  displayName: string
  kind: 'pi-native' | 'sdk'
}

export interface ConnectionModelCatalog {
  connectionId: string
  providerId: string
  models: ModelCatalogEntry[]
}
```

Reject malformed modality/group values during normalization instead of passing them into selectors.

- [ ] **Step 4: Implement strict grouping**

The helper first filters by all three conditions:

```typescript
model.modality === requestedModality
  && model.assignable !== false
  && connection.providerId === model.providerId
```

Then it groups by `integrationGroup.id` and uses deterministic group ordering: `pi-native`, then SDK groups in catalog order.

- [ ] **Step 5: Render grouped selectors**

Use `<optgroup>` labels `PI 原生` and `方舟 SDK`. The image selector receives only `groupAssignableModels(models, 'image')`; the chat selector receives only `groupAssignableModels(models, 'chat')`.

- [ ] **Step 6: Run frontend tests and typecheck**

Run:

```powershell
npm.cmd test -- --run src/domain/models/model-management.test.ts src/services/model-management-client.test.ts src/components/settings/ModelManagementPanel.test.tsx
npm.cmd run typecheck
```

Expected: tests and typecheck pass.

### Task 4: Move text Agent onto the PI provider collection

**Files:**
- Create: `text-agent-runtime/src/provider-runtime.ts`
- Rename: `text-agent-runtime/src/ark-proxy-stream.ts` to `text-agent-runtime/src/sdk-gateway-stream.ts`
- Modify: `text-agent-runtime/src/agent-service.ts`
- Modify: `agent-runtime/backend/app/gateway/ark_chat.py`
- Modify: `agent-runtime/backend/app/gateway/promptcard_runtime.py`
- Modify: `agent-runtime/backend/app/gateway/routers/promptcard_runtime.py`
- Test: `text-agent-runtime/src/provider-runtime.test.ts`
- Test: `agent-runtime/backend/tests/test_promptcard_runtime_boundary.py`

**Interfaces:**
- Produces: `createTextProviderRuntime(config): TextProviderRuntime`.
- Produces: `resolveAssignedTextModel(): Promise<Model<Api>>`.
- Produces: `stream(model, context, options)` delegated through the PI `Models` collection.
- Produces: provider-neutral internal text configuration and SDK invocation routes.

- [ ] **Step 1: Add failing PI provider-runtime tests**

Use fake Gateway responses for a DeepSeek PI-native descriptor and Ark SDK descriptor. Assert:

```typescript
expect(runtime.models.getProvider('pi-native:deepseek')).toBeDefined()
expect(runtime.models.getProvider('sdk:volcengine-ark')).toBeDefined()
expect((await runtime.resolveAssignedTextModel()).id).toBe('doubao-seed-2-0-lite-260215')
```

Also assert `agent-service.ts` no longer exports or contains a module-level Ark model constant.

- [ ] **Step 2: Run text runtime tests and confirm failure**

Run:

```powershell
npm.cmd --prefix text-agent-runtime test -- --run src/provider-runtime.test.ts
```

Expected: provider runtime does not exist.

- [ ] **Step 3: Implement the PI `Models` collection**

Create providers through PI APIs:

```typescript
const models = createModels()
models.setProvider(createProvider({
  id: providerId,
  name: group.displayName,
  auth: internalGatewayAuth,
  models: [model],
  api: group.kind === 'pi-native'
    ? openAICompletionsApi()
    : sdkGatewayApi(),
}))
```

For PI-native calls, point `baseUrl` at the authenticated internal forwarding boundary; Python injects the external credential. For SDK calls, use the renamed provider-neutral Gateway stream. No exported symbol or error message may name Ark except the Ark-specific Python adapter.

- [ ] **Step 4: Resolve the current assignment before Agent construction**

Replace `MODEL` and `createArkProxyStream` with:

```typescript
const providerRuntime = await getTextProviderRuntime()
const model = await providerRuntime.resolveAssignedTextModel()
const agent = new Agent({
  initialState: { systemPrompt, model, tools, messages },
  streamFn: providerRuntime.stream,
  toolExecution: 'sequential',
})
```

- [ ] **Step 5: Keep Ark implementation behind the SDK adapter**

Rename `complete_ark_chat` only if needed internally, but expose a provider-neutral dispatch function from the Gateway runtime. Dispatch on the normalized SDK adapter ID and raise `text_provider_unsupported` for unknown registrations. Do not import image-generation modules.

- [ ] **Step 6: Run text and Gateway boundary tests**

Run:

```powershell
npm.cmd --prefix text-agent-runtime test -- --run
npm.cmd --prefix text-agent-runtime run typecheck
agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime/backend/tests/test_promptcard_runtime_boundary.py -q -p no:cacheprovider
```

Expected: all pass.

### Task 5: Regression verification and technical documentation

**Files:**
- Modify: `docs/architecture/agent-runtime-boundary.md`
- Modify: `docs/architecture/image-generation-and-model-management.md`
- Modify: `docs/decisions/ADR-012-pi-text-agent-and-ark-runtime.md`

**Interfaces:**
- Documents the provider registry, menu categories, discovery semantics, credential boundary, and separate text/image invocation flows.

- [ ] **Step 1: Update architecture documentation**

Document the exact extension points:

```text
PI-native text provider = PI provider definition + secure forwarding auth adapter.
SDK text provider = Gateway SDK adapter + PI provider registration.
Image provider = image-generation provider adapter only.
Provider connection = shared account metadata; assignments = modality-specific.
```

State that Ark API-key discovery returns the supported provider catalog and that private endpoint enumeration requires a future management credential.

- [ ] **Step 2: Run complete verification**

Run:

```powershell
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run agent:check
agent-runtime\backend\.venv\Scripts\python.exe -m pytest agent-runtime/backend/tests -q -p no:cacheprovider
agent-runtime\backend\.venv\Scripts\python.exe -m ruff check agent-runtime/backend/app agent-runtime/backend/tests
```

Expected: every command passes.

- [ ] **Step 3: Verify architecture boundaries mechanically**

Run repository searches and confirm:

```powershell
Select-String -Path text-agent-runtime/src/agent-service.ts -Pattern 'Ark|volcengine'
Select-String -Path agent-runtime/backend/app/gateway/image_generation/*.py -Pattern 'pi-agent|text-agent'
```

Expected: no matches.

- [ ] **Step 4: Inspect the final diff and commit**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only model management, text runtime, tests, and technical documentation are changed.

Commit with:

```powershell
git add docs agent-runtime/backend text-agent-runtime src
git commit -m "feat: add extensible model provider discovery"
```

- [ ] **Step 5: Push the current branch**

Run:

```powershell
git push -u origin feat/extensible-model-provider-discovery
```

Expected: branch is available on the configured remote.
