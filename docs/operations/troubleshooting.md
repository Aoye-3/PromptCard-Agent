# Troubleshooting

## Frontend Port Is Busy

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

For plain `npm.cmd run dev`, stop only the known development server process, then restart `npm.cmd run dev`.

For `npm.cmd run dev:with-agent`, unspecified frontend ports prefer `3000` but fall forward automatically. If `PROMPTCARD_FRONTEND_PORT` is set, that explicit port is strict and startup fails until it is free.

## Startup Appears to Error but Services Are Healthy

Startup logs under `logs/*err.log` are process stderr streams. They may include normal uvicorn startup lines or Python warnings even when local development is healthy.

Verify the running services from the runtime manifest:

```powershell
Get-Content logs\dev-runtime.json
```

Use the `frontendUrl`, `agentHealthUrl`, and `storageHealthUrl` values from that file. If all three return successful responses, the local stack is running.

## Browser Is Blank but Localhost Returns 200

The Vite root URL can return the HTML shell even when a frontend module failed to transform. Check the Vite stderr log first:

```powershell
Get-Content logs\dev-server.err.log -Tail 120
```

If it contains a transform error such as `Unterminated string constant`, fix the referenced source file and run:

```powershell
npm.cmd run build
```

When the build passes but the browser is still blank, the likely cause is a stale Vite process or browser tab holding an old HMR error state. Open the active `frontendUrl` from `logs/dev-runtime.json`, or stop only the known Vite process and start again:

```powershell
npm.cmd run dev:with-agent
```

Use `npm.cmd` from PowerShell. Calling `npm` can resolve to `npm.ps1` and fail under a restricted execution policy.

For an end-to-end startup check from the batch entry point, run:

```powershell
npm.cmd run startup:test
```

If browser automation is blocked on the current machine, rerun with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-start-from-bat.ps1 -SkipBrowserCheck
```

## Agent Runtime Is Disconnected

```powershell
npm.cmd run agent:check
npm.cmd run agent:dev
```

Confirm that one supported local key source exists. Do not print the key value.

## Playwright Browser Missing

Install browsers only when browser verification is needed:

```powershell
npx.cmd playwright install
```
