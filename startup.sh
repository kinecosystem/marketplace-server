#!/bin/sh

# Get all SSM params from path per region
# Export key/values as environment variables

# Usage: 
# . ./startup.sh  <PATH>
# Example:
# . ./startup.sh CI marketplace-public


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


npm run start-merketplace-${SERVER_ROLE}
