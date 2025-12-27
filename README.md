# KOL360

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

## Database Environments

### Overview

| Environment | Database | Purpose |
|------------|----------|---------|
| **Development** | `kol360-db` | Local dev/testing with test data |
| **Production** | `kol360-prod-db` | App Runner production with real data |

### Production Database (kol360-prod-db)

- **Host**: `kol360-prod-db.czkyi4mem2bj.us-east-2.rds.amazonaws.com`
- **Port**: 5432
- **Database**: `kol360prod`
- **Engine**: PostgreSQL 16.6
- **Instance**: db.t4g.micro

Used by App Runner services for production workloads.

### Development Database (kol360-db)

- **Host**: `kol360-db.czkyi4mem2bj.us-east-2.rds.amazonaws.com`
- **Port**: 5432
- **Database**: `kol360`
- **Engine**: PostgreSQL 16.6
- **Instance**: db.t4g.micro

Used for local development and testing. Contains test HCPs, campaigns, etc.

### Switching Databases

**For App Runner (production):**
Update the `DATABASE_URL` environment variable in App Runner API service configuration.

**For local development:**
Update `apps/api/.env` with the appropriate connection string.

## Local Development

### Database Access

To access the AWS RDS database locally, use SSH tunnel through the bastion host:

```bash
# Start SSH tunnel (runs in background)
ssh -i /path/to/kol360-bastion-key.pem \
    -L 5432:kol360-db.czkyi4mem2bj.us-east-2.rds.amazonaws.com:5432 \
    ec2-user@3.142.171.8 -N -o StrictHostKeyChecking=no -f

# For production DB (use different local port to avoid conflict)
ssh -i /path/to/kol360-bastion-key.pem \
    -L 5433:kol360-prod-db.czkyi4mem2bj.us-east-2.rds.amazonaws.com:5432 \
    ec2-user@3.142.171.8 -N -o StrictHostKeyChecking=no -f

# Test connection (dev)
psql 'postgresql://kol360admin:RDS4Bioexec!@localhost:5432/kol360'

# Test connection (prod on port 5433)
psql 'postgresql://postgres:Kol360Prod2025!@localhost:5433/kol360prod'
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
