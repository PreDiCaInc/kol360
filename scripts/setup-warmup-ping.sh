#!/bin/bash
# Setup Route 53 Health Checks to keep App Runner warm
# Health checks ping every 30 seconds by default

set -e

AWS_PROFILE="${AWS_PROFILE:-koluser}"
AWS_REGION="us-east-1"  # Route 53 health checks must be created in us-east-1

echo "Setting up Route 53 Health Checks for App Runner warmup..."
echo "AWS Profile: $AWS_PROFILE"

# Create health check for API
echo "Creating health check for API..."
API_HC_ID=$(aws route53 create-health-check \
  --profile $AWS_PROFILE \
  --caller-reference "kol360-api-warmup-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTPS",
    "FullyQualifiedDomainName": "api.kol360.bio-exec.com",
    "Port": 443,
    "ResourcePath": "/health",
    "RequestInterval": 30,
    "FailureThreshold": 3,
    "EnableSNI": true
  }' \
  --query 'HealthCheck.Id' \
  --output text)

echo "API Health Check ID: $API_HC_ID"

# Tag the API health check
aws route53 change-tags-for-resource \
  --profile $AWS_PROFILE \
  --resource-type healthcheck \
  --resource-id $API_HC_ID \
  --add-tags Key=Name,Value=kol360-api-warmup Key=Environment,Value=production

# Create health check for Web
echo "Creating health check for Web..."
WEB_HC_ID=$(aws route53 create-health-check \
  --profile $AWS_PROFILE \
  --caller-reference "kol360-web-warmup-$(date +%s)" \
  --health-check-config '{
    "Type": "HTTPS",
    "FullyQualifiedDomainName": "kol360.bio-exec.com",
    "Port": 443,
    "ResourcePath": "/api/health/status",
    "RequestInterval": 30,
    "FailureThreshold": 3,
    "EnableSNI": true
  }' \
  --query 'HealthCheck.Id' \
  --output text)

echo "Web Health Check ID: $WEB_HC_ID"

# Tag the Web health check
aws route53 change-tags-for-resource \
  --profile $AWS_PROFILE \
  --resource-type healthcheck \
  --resource-id $WEB_HC_ID \
  --add-tags Key=Name,Value=kol360-web-warmup Key=Environment,Value=production

echo ""
echo "Setup complete!"
echo ""
echo "Health checks created:"
echo "  - API: $API_HC_ID (https://api.kol360.bio-exec.com/health)"
echo "  - Web: $WEB_HC_ID (https://kol360.bio-exec.com/api/health/status)"
echo ""
echo "Both endpoints will be pinged every 30 seconds from multiple AWS regions."
echo ""
echo "To view health checks:"
echo "  aws route53 list-health-checks --profile $AWS_PROFILE"
echo ""
echo "To delete health checks:"
echo "  aws route53 delete-health-check --profile $AWS_PROFILE --health-check-id $API_HC_ID"
echo "  aws route53 delete-health-check --profile $AWS_PROFILE --health-check-id $WEB_HC_ID"
