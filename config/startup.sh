#!/bin/sh

# Usage:
# . ./config/startup.sh

if [ ${DEBUG} == "True" ]; then
        ECHO "DEBUG"
        set -x
fi

# Get all SSM params from path per region
# Export key/values as environment variables
. ./config/getKeys.sh

#Get JWT public and private files from SSM
. ./config/getJWT.sh


echo "Starting: npm run start-marketplace-${SERVER_ROLE}"
npm run start-marketplace-${SERVER_ROLE}
