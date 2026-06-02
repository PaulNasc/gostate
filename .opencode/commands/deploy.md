---
description: Deployment command for production releases. Pre-flight checks and deployment execution.
---

Handle production deployment with pre-flight checks, deployment execution, and verification.

User request: $ARGUMENTS

## Sub-commands interpretation

- `check` - Run pre-deployment checks only
- `preview` - Deploy to preview/staging
- `production` - Deploy to production
- `rollback` - Rollback to previous version
- (empty) - Interactive deployment wizard

## Pre-Deployment Checklist

Before any deployment:

### Code Quality
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] ESLint passing (`npx eslint .`)
- [ ] All tests passing (`npm test`)

### Security
- [ ] No hardcoded secrets
- [ ] Environment variables documented
- [ ] Dependencies audited (`npm audit`)

### Performance
- [ ] Bundle size acceptable
- [ ] No console.log statements
- [ ] Images optimized

### Documentation
- [ ] README updated
- [ ] CHANGELOG updated
- [ ] API docs current

## Deployment Flow

1. Pre-flight checks
2. Build application
3. Deploy to platform
4. Health check & verify

## Platform Support

| Platform | Command | Notes |
|----------|---------|-------|
| Vercel | `vercel --prod` | Auto-detected for Next.js |
| Railway | `railway up` | Needs Railway CLI |
| Fly.io | `fly deploy` | Needs flyctl |
| Docker | `docker compose up -d` | For self-hosted |

Execute deployment based on user request: $ARGUMENTS
