# KOL360 Deployment Quick Reference

## Lambda API Deployment

```bash
# Build and deploy in one command
pnpm --filter @kol360/api build:lambda && ./scripts/deploy-lambda.sh
```

**Profile:** `koluser`
**Region:** `us-east-2`
**Function:** `kol360-api`
**Account:** `163859990568`

## Web Frontend Deployment (App Runner)

The web frontend is deployed via AWS App Runner with manual deployment trigger:

1. Merge changes to `main` branch
2. Go to AWS Console > App Runner
3. Trigger manual deployment

## Quick Commands

```bash
# Deploy Lambda only
./scripts/deploy-lambda.sh

# Build Lambda bundle only (without deploying)
pnpm --filter @kol360/api build:lambda

# Check AWS credentials
aws sts get-caller-identity --profile koluser --region us-east-2

# View Lambda logs
aws logs tail /aws/lambda/kol360-api --profile koluser --region us-east-2 --follow
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| `ExpiredTokenException` | Refresh AWS credentials in `~/.aws/credentials` |
| `Function not found` | Check region is `us-east-2` and profile is `koluser` |
| `Access Denied` | Verify IAM permissions for the profile |

## Deployment Checklist

- [ ] Pull latest from `main`: `git pull origin main`
- [ ] Build Lambda: `pnpm --filter @kol360/api build:lambda`
- [ ] Deploy Lambda: `./scripts/deploy-lambda.sh`
- [ ] Trigger App Runner deployment for web frontend
- [ ] Verify both services are running
