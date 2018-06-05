#!/bin/bash

if [ $# == 1 ] && [ $1 == private ]
then
    PUBLIC_FLAG=
else
    PUBLIC_FLAG=-v
fi

keys=`aws --region=us-east-1 ssm describe-parameters | jq -r '.Parameters[].Name' | grep 'prod-kin-.*pem' | grep $PUBLIC_FLAG -- '-priv.pem'`

for key in $keys; do
    # write the keys with the same name as the parameter name stripping off the "prod-" prefix
    aws --region=us-east-1 ssm get-parameters --names $key --with-decryption | jq -r '.Parameters[] | select(.Name == "'$key'") | .Value' > /opt/marketplace-server/keys/${key:5}
done
