#!/bin/sh



# Usage:
# . ./startup.sh  <PATH>
# Example:
# . ./startup.sh ci marketplace-public


REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep region | awk -F\" '{print $4}')
PARAMETERS=`aws ssm --region ${REGION} get-parameters-by-path --path /${ENVIRONMENT}/marketplace/ --with-decryption --recursive`


if [ ${DEBUG} == "True" ]; then
        ECHO "DEBUG"
        set -x
fi

# Get all SSM params from path per region
# Export key/values as environment variables
. ./getKeys.sh

#Get JWT public and private files from SSM
. ./getJWT.sh


echo "Starting: npm tests"

npm run transpile
npm test
