# KOL360

## Release docs (prod team — start here)

Per-release handoff + soak-check documents for every `prod-rel-X.Y.Z` tag live in [`releases/`](releases/). Each release has two files:

- `prod-rel-X.Y.Z-handoff.md` — what changed, migrations, rollback shape
- `prod-rel-X.Y.Z-soak-checks.md` — phased verification checklist (sanity / functional smoke / 24h watch)

Index with one-line summaries: [`releases/README.md`](releases/README.md).

## Deployment

### AWS Profiles Required

This project uses multiple AWS profiles. Make sure they are configured in `~/.aws/credentials`:

- **koluser** - For Lambda API deployment (Region: us-east-2)
- **koladmin** - For S3 web deployment (if using S3 static hosting)

### Deploy Lambda API

1. **Build the Lambda bundle:**
   ```bash
   pnpm --filter @kol360/api build:lambda
   ```

2. **Deploy to AWS Lambda:**
   ```bash
   # Using the deploy script (recommended)
   ./scripts/deploy-lambda.sh

   # Or manually with AWS CLI
   aws lambda update-function-code \
     --function-name kol360-api \
     --zip-file fileb://apps/api/lambda.zip \
     --region us-east-2 \
     --profile koluser
   ```

### Deploy Web Frontend

The web frontend is deployed to AWS App Runner. Deployment is triggered manually from the AWS Console or via the App Runner auto-deploy from the `main` branch.

Alternatively, for S3 static hosting:
```bash
export AWS_PROFILE=koladmin
aws s3 sync apps/web/out s3://kol360-web --delete

# Or with profile flag
aws s3 sync apps/web/out s3://kol360-web --delete --profile koladmin
```

## Local Development

### Database Access

To access the AWS RDS database locally, use an SSH tunnel through the bastion host. **Connection details (bastion key path, bastion IP, DB host, credentials) are not committed to the repo** — get them from a team member or your local `apps/api/.env` file.

```bash
# Start SSH tunnel (runs in background). Set the variables from your local
# .env or onboarding doc; never commit literals.
ssh -i "${BASTION_KEY_PATH}" \
    -L 5432:"${DB_HOST}":5432 \
    "ec2-user@${BASTION_IP}" -N -o StrictHostKeyChecking=no -f

# Test connection. Export PGPASSWORD locally (or use a ~/.pgpass entry);
# the literal password used to live in this README and shipped to the
# Bio-Exec mirror — sanitized 2026-05-28 (see docs/findings/
# dev-team-asks-2026-05-28.md item 3). Test DB password rotation is
# tracked as a follow-up ops action.
export PGPASSWORD='<TEST_DB_PASSWORD>'
psql 'postgresql://kol360admin@localhost:5432/kol360'

# Example query
select * from "User";
```

### Running Locally

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm --filter @kol360/api prisma generate

# Start API server (port 3001)
pnpm --filter @kol360/api dev

# Start Web frontend (port 3000)
pnpm --filter @kol360/web dev
```

## Troubleshooting

### AWS Credentials Expired

If you see `ExpiredTokenException` or `ExpiredToken` errors:

1. Check which profile is being used:
   ```bash
   aws sts get-caller-identity --profile koladmin
   ```

2. If using temporary credentials (session tokens), refresh them from AWS Console or SSO

3. For permanent keys, verify they are in `~/.aws/credentials` under the correct profile

### Lambda Function Not Found

Make sure you're using the correct:
- **Region**: `us-east-2` (not us-east-1)
- **Profile**: `koluser`
- **Function name**: `kol360-api`
