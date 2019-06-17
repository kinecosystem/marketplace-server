#!/bin/sh

# Get all SSM params from path per region
# Export key/values as environment variables

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
