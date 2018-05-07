FROM node:9-alpine

WORKDIR /usr/app

COPY package*.json ./
RUN apk update && apk add --no-cache git make
RUN npm i

COPY . .
RUN npm run transpile

EXPOSE 3000

CMD [ "npm", "run", "start" ]
