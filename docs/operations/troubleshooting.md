# Troubleshooting

## Port 3000 Is Busy

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

Stop only the known development server process, then restart `npm.cmd run dev`.

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
