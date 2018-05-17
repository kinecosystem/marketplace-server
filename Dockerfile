FROM node:9-alpine

WORKDIR /opt/app

# copy requirements
COPY package*.json ./

# install build tools
RUN apk add -qU --no-cache -t .fetch-deps git make \
    && npm i \
    && apk del -q .fetch-deps

# copy the code
COPY . .

# transpile typescript
RUN npm run transpile

# set build meta data
ARG BUILD_COMMIT
ARG BUILD_TIMESTAMP

ENV BUILD_COMMIT $BUILD_COMMIT
ENV BUILD_TIMESTAMP $BUILD_TIMESTAMP

EXPOSE 3000

# run the api server
CMD [ "npm", "run", "start" ]
