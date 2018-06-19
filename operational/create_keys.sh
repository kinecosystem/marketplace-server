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

    pub=kin-es256_$uuid.pem
    priv=kin-es256_$uuid-priv.pem

    mkdir -p $DIR/priv_keys
    mkdir -p $DIR/pub_keys

    openssl ecparam -name secp256k1 -genkey -noout -out $DIR/priv_keys/$priv 
    openssl ec -in $DIR/priv_keys/$priv -pubout -out $DIR/pub_keys/$pub

    if [ $PUBLISH -eq 1 ]
    then
        aws ssm put-parameter --name prod-$pub --type "String" --overwrite --value "$(cat $DIR/pub_keys/$pub)"
        aws ssm put-parameter --name prod-$priv --type "SecureString" --overwrite --value "$(cat $DIR/priv_keys/$priv)"
    fi
done
