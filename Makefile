all: run

install:
	npm i

build:
	npm run build

run:
	npm run start

test:
	npm run transpile
	npm test

test-system:
	npm run test-system

db:
	rm database.sqlite
	npm run create-db

db-prod: db
	chown -R ubuntu:www-data .


.PHONY: test run build install
