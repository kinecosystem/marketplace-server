FROM node:9-alpine

# install build tools
RUN apk update && apk add --no-cache git make

# copy and install package.json
WORKDIR /opt/app
COPY package*.json ./
RUN npm i

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
