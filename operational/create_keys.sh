#!/bin/sh
# usage:   program <DIR> [PUBLISH]
# example: program /tmp/out
# example: program /tmp/out publish


if [ $# -ge 1 ]
then
    DIR=$1
else
    DIR=.
fi


if [ $# -ge 2 ] && [ $2 == publish ]
then
    PUBLISH=1
else
    PUBLISH=0
fi

for i in `seq 1 10`; do
    uuid=$(uuidgen)

    pub=es256_$uuid.pem
    priv=es256_$uuid-priv.pem

    mkdir -p $DIR/jwt/private_keys
    mkdir -p $DIR/jwt/public_keys

    openssl ecparam -name secp256k1 -genkey -noout -out $DIR/jwt/private_keys/$priv 
    openssl ec -in $DIR/jwt/private_keys/$priv -pubout -out $DIR/jwt/public_keys/$pub

    if [ $PUBLISH -eq 1 ]
    then
        aws ssm put-parameter --name prod-jwt-$pub --type "String" --overwrite --value "$(cat $DIR/jwt/public_keys/$pub)"
        aws ssm put-parameter --name prod-jwt-$priv --type "SecureString" --overwrite --value "$(cat $DIR/jwt/private_keys/$priv)"
    fi
done
