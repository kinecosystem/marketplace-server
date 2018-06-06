#!/bin/bash


for i in `seq 1 10`; do
    pub=kin-es256_$i.pem
    priv=kin-es256_$i-priv.pem
    openssl ecparam -name secp256k1 -genkey -noout -out $priv 
    openssl ec -in $priv -pubout -out $pub

    aws ssm put-parameter --name prod-$pub --type "String" --overwrite --value "$(cat $pub)"
    aws ssm put-parameter --name prod-$priv --type "SecureString" --overwrite --value "$(cat $priv)"
done
