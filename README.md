## command to push / sync web files to s3 
## use the aws profile - koladmin
export AWS_PROFILE=koladmin
aws s3 sync apps/web/out s3://kol360-web --delete

or 

aws s3 sync apps/web/out s3://kol360-web --delete --profile koladmin

## update lambda with zip file
## cd to location of zip file or be in the root of the project ie kol360 folder
aws lambda update-function-code \
  --function-name kol360-api \
  --zip-file fileb://apps/api/lambda.zip

## to access the aws RDS locally - here is the ssh tunnen command to connect to the bastion.
ssh -i /Users/haranath/genai/kol360/kol360-bastion-key.pem -L 5432:kol360-db.czkyi4mem2bj.us-east-2.rds.amazonaws.com:5432 ec2-user@3.142.171.8 -N -o StrictHostKeyChecking=no -f

## test connection using ... to connect to kol db
psql 'postgresql://kol360admin:RDS4Bioexec!@localhost:5432/kol360'

## use this sql at the prompt
select * from "User";
