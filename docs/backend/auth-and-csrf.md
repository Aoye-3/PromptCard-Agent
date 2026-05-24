# Auth and CSRF

The runtime supports local authentication and CSRF protection. The frontend service includes cookies on runtime calls and sends `X-CSRF-Token` when a `csrf_token` cookie exists.

PromptCard-Manager expects transparent bootstrap behavior through:

```text
POST /agent-api/v1/auth/promptcard-bootstrap
```

Do not introduce a second visible login flow unless the product requirement explicitly changes.
