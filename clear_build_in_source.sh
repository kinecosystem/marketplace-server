#!/usr/bin/env bash

find ./scripts/src -name "*.d.ts" -exec rm {} \;
find ./scripts/src -name "*.js" -exec rm {} \;
find ./scripts/src -name "*.js.map" -exec rm {} \;

find ./tests/src -name "*.d.ts" -exec rm {} \;
find ./tests/src -name "*.js.map" -exec rm {} \;