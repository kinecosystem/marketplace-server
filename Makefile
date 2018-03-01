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

db:
	rm database.sqlite
	npm run create-db


.PHONY: test run build install
