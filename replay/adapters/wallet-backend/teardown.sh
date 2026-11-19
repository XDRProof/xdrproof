#!/usr/bin/env bash
. "$(dirname "$0")/common.sh"
for c in $(docker ps -aq --filter name=xdrproof-wb-); do docker rm -f "$c" >/dev/null 2>&1 || true; done
docker network rm "$NET" >/dev/null 2>&1 || true
