all:
	trap 'kill %1' SIGINT; make run & make run-internal

split: 
	tmux new-session 'make run' \; split-window 'make run-internal' \;

install:
	npm i

build:
	npm run build

run:
	npm run start

run-internal:
	npm run start-internal

test:
	npm run transpile
	npm test

test-system:
	npm run test-system

db:
	rm -f database.sqlite
	npm run create-db

db-prod: db
	chown -R ubuntu:www-data .


.PHONY: test run build install
