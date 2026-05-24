# Troubleshooting

## Port 3000 Is Busy

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

Stop only the known development server process, then restart `npm.cmd run dev`.

`npm.cmd run dev:with-agent` exits successfully when the existing listener is the healthy Vite frontend at `http://127.0.0.1:3000/`.

## Startup Appears to Error but Services Are Healthy

Startup logs under `logs/*err.log` are process stderr streams. They may include normal uvicorn startup lines or Python warnings even when local development is healthy.

Verify the running services directly:

```text
http://127.0.0.1:3000/
http://127.0.0.1:8001/health
http://127.0.0.1:8002/health
```

If all three return successful responses, the local stack is running.

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
