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


.PHONY: test run build install
