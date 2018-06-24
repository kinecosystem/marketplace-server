#!/bin/bash
## reads all public/ private keys starting with 'prod-jwt' and ending with 'pem' and writes them to a dir, removing the 'prod-' part from the filename

if [ $# == 1 ] && [ $1 == private ]
then
    PUBLIC_FLAG=
    DIR=priv_keys
else
    PUBLIC_FLAG=-v
    DIR=pub_keys
fi

keys=`aws --region=us-east-1 ssm describe-parameters | jq -r '.Parameters[].Name' | grep 'prod-jwt-.*pem' | grep $PUBLIC_FLAG -- '-priv.pem'`

# empty out current dir items
rm -f $DIR/*.pem

for key in $keys; do
    # write the keys with the same name as the parameter name stripping off the "prod-jwt-" prefix
    mkdir -p $DIR
    aws --region=us-east-1 ssm get-parameters --names $key --with-decryption | jq -r '.Parameters[] | select(.Name == "'$key'") | .Value' > /opt/marketplace-server/$DIR/${key:9}
done

echo wrote keys to $DIR
