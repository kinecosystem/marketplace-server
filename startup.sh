#!/bin/sh

# Get all SSM params from path per region
# Export key/values as environment variables

# Usage: 
# . ./startup.sh  <PATH>
# Example:
# . ./startup.sh ci marketplace-public

if [ ${DEBUG} == "True" ]; then
        ECHO "DEBUG"
        set -x
fi

REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep region | awk -F\" '{print $4}')
PARAMETERS=`aws ssm --region ${REGION} get-parameters-by-path --path /${ENVIRONMENT}/marketplace/ --with-decryption --recursive`

#echo "#env vars" >> /etc/profile
for row in $(echo ${PARAMETERS} | jq -c '.Parameters' | jq -c '.[]'); do
    KEY=$(basename $(echo ${row} | jq -c '.Name'))
    VALUE=$(echo ${row} | jq -c '.Value')

    KEY=`echo ${KEY} | tr -d '"'`
    VALUE=`echo ${VALUE} | tr -d '"'`

    echo "Adding key: ${KEY}"
    #echo "export ${KEY}=${VALUE}" >> /etc/profile
    export ${KEY}=${VALUE}
done

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

echo "Starting: npm run start-marketplace-${SERVER_ROLE}"
npm run start-marketplace-${SERVER_ROLE}
