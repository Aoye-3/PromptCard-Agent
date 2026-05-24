# Agent Runtime API

The frontend calls the Agent Runtime through Vite proxy routes:

```text
GET /agent-health -> http://127.0.0.1:8001/health
/agent-api/* -> http://127.0.0.1:8001/api/*
```

Current frontend service coverage in `src/services/agent-runtime-service.ts` includes:

- health
- auth setup status
- promptcard bootstrap auth
- current user
- models
- skills
- tools
- agents
- thread creation
- run-and-wait Agent execution
- proposal parsing

The current run path uses `assistant_id: "lead_agent"` and model context `deepseek-chat`.
