# Vercel Deployment Guide

## Pre-Deployment Checklist

### Project Configuration
- [x] Confirm the project uses Vite, React, and TypeScript
- [x] Check the `package.json` build command
- [x] Verify the project can build locally
- [x] Check client routing and static asset handling

### Vercel Configuration
- [x] Keep `vercel.json` configured for build and routing
- [x] Configure cache behavior for static assets

### Environment Variables
- [x] Keep `.env.example` as a template only
- [x] Avoid committing real API keys or secrets

## Deployment Steps

### Install Vercel CLI
```bash
npm install -g vercel
```

### Initialize or Link the Project
```bash
vercel init
```

### Configure Environment Variables
Add the required variables in the Vercel project settings:

```env
VITE_PORT=3000
VITE_API_PROXY_TARGET=https://ark.cn-beijing.volces.com/api/coding/v3
VITE_DEFAULT_AI_ENABLED=true
VITE_DEFAULT_AI_PROVIDER=deepseek
VITE_DEFAULT_AI_API_BASE=/api
VITE_DEFAULT_AI_API_KEY=replace-with-local-key
VITE_DEFAULT_AI_MODEL=deepseek-v3.2
VITE_DEFAULT_AI_MAX_TOKENS=4000
VITE_DEFAULT_AI_TEMPERATURE=0.3
```

### Deploy
```bash
vercel deploy --prod
```

## Notes After Deployment

### Routing
- The app uses React Router for client-side routing.
- `vercel.json` should keep the fallback route for SPA navigation.
- Server-side rendering requires additional configuration.

### API Configuration
- Development API proxy settings live in `vite.config.ts`.
- Production AI service settings must be configured through environment variables or user-side settings.
- Do not expose production secrets in committed files.

### Performance
- Vite handles production bundling and code splitting.
- Static assets are optimized and cached by Vercel.
- Consider enabling Vercel Analytics for page-load monitoring.

## Troubleshooting

### 404 Page Not Found
- Check client route definitions.
- Confirm the fallback rewrite in `vercel.json`.
- Verify static asset paths.

### API Connection Failure
- Check API base URL and provider settings.
- Confirm the target service is available.
- Review CORS settings for cross-origin requests.

### Build Failure
- Reinstall dependencies if needed.
- Run TypeScript checks locally.
- Fix syntax errors or unresolved imports before deploying.

### Deployment Timeout
- Check project size and build duration.
- Remove unnecessary assets from the deployment.
- Optimize large dependencies where practical.

## Update Deployment

### Automatic Deployment
- Connect the GitHub repository to Vercel.
- Push to the configured branch to trigger deployments.
- Use preview deployments for branch validation.

### Manual Deployment
```bash
vercel deploy
vercel deploy --prod
```
