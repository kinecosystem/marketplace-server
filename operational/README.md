# Operational scripts and (hopefully) deploy scripts

For example:
* create_keys.sh - on a machine with write permissions to AWS, create 10 ES256 keys and write them to AWS parameter store
* get_keys.sh - on the deployed machine, run this to read keys from AWS parameter store and place them under /opt/marketplace-server/keys
