#!/bin/bash


wget https://github.com/bitly/oauth2_proxy/releases/download/v2.2/oauth2_proxy-2.2.0.linux-amd64.go1.8.1.tar.gz

tar -xvzf oauth2_proxy-2.2.0.linux-amd64.go1.8.1.tar.gz

./oauth2_proxy -provider=github -github-team=ecosystem -github-org=kinecosystem -email-domain=* \
    -cookie-secret='fBEiL8YhuiWBeOzKMod0rg==' \
    -client-id 6951272e6be1b59dc6fa \
    -client-secret 8424628ca5b762cc0361fc5cf5485ce608fbc17b \
    -upstream=http://127.0.0.1:3000/status \
    -http-address http://0.0.0.0:80
