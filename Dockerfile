FROM node:11-alpine
WORKDIR /opt/app

# copy requirements
COPY package*.json ./

# install build tools
RUN apk add -qU --no-cache -t .fetch-deps git make python g++ \
    && npm install -g npm@latest \
    && npm i \
    && apk del -q .fetch-deps

# Install aws-cli, used for SSM params
RUN apk -Uuv add groff less python py-pip jq curl
RUN pip install awscli
RUN apk --purge -v del py-pip
RUN rm /var/cache/apk/*

# copy the code
COPY . .

# transpile typescript
RUN npm run transpile

# set build meta data
ARG BUILD_COMMIT
ARG BUILD_TIMESTAMP

ENV BUILD_COMMIT $BUILD_COMMIT
ENV BUILD_TIMESTAMP $BUILD_TIMESTAMP

EXPOSE 80
HEALTHCHECK --interval=1m --timeout=5s --retries=3 CMD wget localhost/status -q -O - > /dev/null 2>&1

RUN chmod 775 startup.sh
#get ssm paramaeter as environment variable
# run the api server
#CMD ["/bin/sh", "-c",   "./startup.sh" ]
#For backward compatibility, overriden by the k8s deployment yaml
CMD [ "npm", "run", "start" ]
