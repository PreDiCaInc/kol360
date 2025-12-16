## command to push / sync web files to s3 

## use the aws profile - koladmin
export AWS_PROFILE=koladmin
aws s3 sync apps/web/out s3://kol360-web --delete

or 

aws s3 sync apps/web/out s3://kol360-web --delete --profile koladmin

## update lambda with zip file
## cd to location of zip file
aws lambda update-function-code \
  --function-name kol360-api \
  --zip-file fileb://apps/api/lambda.zip