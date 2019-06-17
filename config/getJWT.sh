#!/bin/sh

# Get all JWT from SSM ( path per region )
# Export to files

#Special handle of JWT keys since written to files instead of environment variables
#todo: replace with get-parameters-by-path
#todo: consider replacing the SSM keys

#Get private keys
PUBLIC_FLAG=
DIR=jwt/private_keys
mkdir -p $DIR
keys=`aws --region=${REGION} ssm describe-parameters | jq -r '.Parameters[].Name' | grep "${ENVIRONMENT}/jwt/.*pem" | grep $PUBLIC_FLAG -- '-priv.pem'`

# empty out current dir items
rm -f $DIR/*.pem

for key in $keys; do
    # write the keys with the same name as the parameter name stripping off the "prod-jwt-" prefix
    aws --region=${REGION} ssm get-parameters --names $key --with-decryption | jq -r '.Parameters[] | select(.Name == "'$key'") | .Value' > $DIR/${key:9}
done

echo wrote keys to $DIR

#Repeat for public keys
PUBLIC_FLAG=-v
DIR=jwt/public_keys
mkdir -p $DIR
keys=`aws --region=${REGION} ssm describe-parameters | jq -r '.Parameters[].Name' | grep "${ENVIRONMENT}/jwt/.*pem" | grep $PUBLIC_FLAG -- '-priv.pem'`


for key in $keys; do
    # write the keys with the same name as the parameter name stripping off the "prod-jwt-" prefix
    aws --region=${REGION} ssm get-parameters --names $key --with-decryption | jq -r '.Parameters[] | select(.Name == "'$key'") | .Value' > $DIR/${key:9}
done

echo wrote keys to $DIR
