#!/bin/sh



# Usage:
# . ./startup.sh  <PATH>
# Example:
# . ./startup.sh ci marketplace-public


REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep region | awk -F\" '{print $4}')


if [ ${DEBUG} == "True" ]; then
        ECHO "DEBUG"
        set -x
fi

# Get all SSM params from path per region
# Export key/values as environment variables
. ./config/getKeys.sh

#Get JWT public and private files from SSM
. ./config/getJWT.sh


echo "Starting: npm tests"

npm run transpile
npm test
