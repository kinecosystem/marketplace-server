#!/bin/sh
# Usage:
# . ./test.sh  <PATH>
# Example:
# . ./test.sh ci marketplace-public



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
