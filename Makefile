all:
	trap 'kill %1' SIGINT; make run-internal & bash -c 'sleep 1 && make run'

split: 
	tmux new-session 'make run-internal' \; split-window 'sleep 1 && make run' \;

install:
	npm i

build:
	npm run build

run:
	npm run start

run-internal:
	npm run start-internal

run-admin:
	npm run start-admin

test:
	npm run transpile
	npm run transpile-tests
	npm test

test-system:
	npm run test-system

db:
	rm -f database.sqlite
	npm run create-db -- data/apps data/offers

# docker targets
revision := $(shell git rev-parse --short HEAD)
image := "kinecosystem/marketplace-server"

build-image:
	docker build -t ${image} -f Dockerfile \
		--build-arg BUILD_COMMIT="${revision}" \
		--build-arg BUILD_TIMESTAMP="$(shell date -u +"%Y-%m-%dT%H:%M:%SZ")" .
	docker tag ${image} ${image}:${revision}

push-image:
	docker push ${image}:latest
	docker push ${image}:${revision}

pull:
	docker-compose -f docker-compose.yaml -f docker-compose.deps.yaml pull

up:
	. ./secrets/.secrets && docker-compose -f docker-compose.yaml -f docker-compose.deps.yaml up -d

up-dev: db-docker
	. ./secrets/.secrets && docker-compose -f docker-compose.dev.yaml -f docker-compose.yaml -f docker-compose.deps.yaml up -d

logs:
	docker-compose -f docker-compose.dev.yaml -f docker-compose.yaml -f docker-compose.deps.yaml logs 

down:
	docker-compose -f docker-compose.yaml -f docker-compose.deps.yaml down

psql:
	docker-compose -f docker-compose.yaml -f docker-compose.deps.yaml -f docker-compose.tests.yaml run --rm psql

redis-cli:
	docker-compose -f docker-compose.yaml -f docker-compose.deps.yaml -f docker-compose.tests.yaml run --rm redis-cli

db-docker:
	. ./secrets/.secrets && docker-compose -f docker-compose.yaml -f docker-compose.deps.yaml -f docker-compose.tests.yaml run --rm create-db

clear-db:
	docker-compose -f docker-compose.yaml -f docker-compose.deps.yaml -f docker-compose.tests.yaml run --rm psql -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"

clear-redis:
	docker-compose -f docker-compose.yaml -f docker-compose.deps.yaml -f docker-compose.tests.yaml run --rm redis-cli del cursor

test-system-docker: clear-db db-docker clear-redis
	docker-compose -f docker-compose.yaml -f docker-compose.deps.yaml -f docker-compose.tests.yaml run --rm test-system

generate-funding-address:
	docker-compose -f docker-compose.yaml -f docker-compose.deps.yaml -f docker-compose.tests.yaml run generate-funding-address

create-jwt-keys:
	./operational/create_keys.sh .

.PHONY: build-image push-image up down psql db-docker test-system-docker generate-funding-address test run build install db all split run-internal test-system
