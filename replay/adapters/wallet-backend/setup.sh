#!/usr/bin/env bash
# Once per target: build wallet-backend at the ref (static binary, pinned Go image), start TimescaleDB,
# and migrate a template database the sessions are copied from.
. "$(dirname "$0")/common.sh"
mkdir -p "$WORK/bin" "$WORK/logs"
if [ ! -x "$BIN" ]; then
  [ -d "$WORK/src/.git" ] || { echo "status: downloading the wallet-backend source (once)" >&2; git clone -q --filter=blob:none https://github.com/stellar/wallet-backend "$WORK/src"; }
  git -C "$WORK/src" cat-file -e "$REF^{commit}" 2>/dev/null || { echo "status: fetching wallet-backend $SHORT" >&2; git -C "$WORK/src" fetch -q origin; }
  rm -rf "$WORK/tree-$SHORT" && mkdir -p "$WORK/tree-$SHORT"
  git -C "$WORK/src" archive "$REF" | tar -x -C "$WORK/tree-$SHORT"
  docker volume create xdrproof-gocache >/dev/null
  pull_once "$GO_IMAGE" "the Go toolchain"
  echo "status: building wallet-backend $SHORT (minutes, once)" >&2
  # named, so teardown.sh (every container named xdrproof-wb-*) also removes a build that a stop left running
  docker run --rm --name "xdrproof-wb-build-$SHORT" -v "$WORK/tree-$SHORT":/src:ro -v xdrproof-gocache:/cache -v "$WORK/bin":/out \
    -e GOCACHE=/cache/build -e GOMODCACHE=/cache/mod -e CGO_ENABLED=0 -e GOFLAGS=-buildvcs=false -e GOTOOLCHAIN=local \
    -w /src "$GO_IMAGE" go build -o "/out/wb-$SHORT" . >"$WORK/logs/build-$SHORT.log" 2>&1 \
    || { tail -20 "$WORK/logs/build-$SHORT.log" >&2; exit 1; }
  rm -rf "$WORK/tree-$SHORT"
fi
docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
pull_once "$DB_IMAGE" "TimescaleDB"
pull_once "$RUN_IMAGE" "a small Linux image for the sessions"
echo "status: starting the database" >&2
if ! docker inspect -f '{{.State.Running}}' "$DB" 2>/dev/null | grep -q true; then
  docker rm -f "$DB" >/dev/null 2>&1 || true
  # PostgreSQL's parallel workers use /dev/shm; Docker's default of 64 MB is too small under concurrent sessions
  docker run -d --name "$DB" --network "$NET" --shm-size=1g -e POSTGRES_HOST_AUTH_METHOD=trust "$DB_IMAGE" \
    postgres -c max_connections=500 -c timescaledb.enable_chunk_skipping=on -c timescaledb.enable_sparse_index_bloom=on >/dev/null
fi
echo "status: waiting for the database" >&2
# Wait for the real server, also when an earlier run started the container. The image's entrypoint first runs a
# temporary server for its init scripts (TimescaleDB install and tune), listening on the Unix socket only, then
# shuts it down and starts the real one on TCP. A socket check passes during that first phase and the next psql
# meets "the database system is shutting down"; under heavy load the gap is many seconds. Checking over TCP
# only passes once the real server is up.
ready=""
for _ in $(seq 180); do
  docker exec "$DB" pg_isready -q -h 127.0.0.1 -U postgres >/dev/null 2>&1 && psql_ -h 127.0.0.1 -c 'SELECT 1' >/dev/null 2>&1 && { ready=1; break; }
  sleep 1
done
[ -n "$ready" ] || { echo "TimescaleDB ($DB) was not ready after 180 s; see: docker logs $DB" >&2; exit 1; }
if [ -z "$(psql_ -c "SELECT 1 FROM pg_database WHERE datname='$TPL'")" ]; then
  echo "status: preparing the template database" >&2
  psql_ -c "CREATE DATABASE $TPL" >/dev/null
  docker run --rm --network "$NET" -v "$BIN":/wb:ro -e DATABASE_URL="postgres://postgres@$DB:5432/$TPL?sslmode=disable" \
    "$RUN_IMAGE" /wb migrate up >"$WORK/logs/migrate-$SHORT.log" 2>&1 || { tail -20 "$WORK/logs/migrate-$SHORT.log" >&2; exit 1; }
  # a template no session may connect to, so CREATE DATABASE ... TEMPLATE never finds it busy
  psql_ -c "ALTER DATABASE $TPL WITH IS_TEMPLATE true ALLOW_CONNECTIONS false" >/dev/null
fi
# TimescaleDB's scheduler may still hold a connection opened before the template was closed
psql_ -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TPL'" >/dev/null
