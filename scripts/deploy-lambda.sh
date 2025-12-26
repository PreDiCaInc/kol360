#!/bin/bash
set -e

# Configuration
AWS_PROFILE="koluser"
AWS_REGION="us-east-2"
FUNCTION_NAME="kol360-api"
ZIP_FILE="apps/api/lambda.zip"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  KOL360 Lambda Deployment Script"
echo "========================================"
echo ""

# Check if we're in the right directory
if [ ! -f "$ZIP_FILE" ]; then
    echo -e "${YELLOW}Lambda bundle not found. Building...${NC}"
    pnpm --filter @kol360/api build:lambda
fi

# Verify the zip file exists
if [ ! -f "$ZIP_FILE" ]; then
    echo -e "${RED}Error: Lambda bundle not found at $ZIP_FILE${NC}"
    echo "Run: pnpm --filter @kol360/api build:lambda"
    exit 1
fi

# Show zip file info
ZIP_SIZE=$(ls -lh "$ZIP_FILE" | awk '{print $5}')
echo "Lambda bundle: $ZIP_FILE ($ZIP_SIZE)"
echo ""

# Verify AWS credentials
echo "Checking AWS credentials..."
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1; then
    echo -e "${RED}Error: AWS credentials for profile '$AWS_PROFILE' are invalid or expired${NC}"
    echo ""
    echo "To fix this:"
    echo "  1. Check ~/.aws/credentials has valid keys for [$AWS_PROFILE]"
    echo "  2. If using temporary credentials, refresh them from AWS Console"
    echo ""
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" --query "Account" --output text)
echo -e "${GREEN}Authenticated to AWS Account: $ACCOUNT_ID${NC}"
echo ""

# Deploy
echo "Deploying to Lambda function: $FUNCTION_NAME"
echo "Region: $AWS_REGION"
echo ""

aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_FILE" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" \
    --output text \
    --query "FunctionArn"

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo ""

# Wait for function to be updated
echo "Waiting for function to be ready..."
aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE"

echo -e "${GREEN}Lambda function is ready!${NC}"
