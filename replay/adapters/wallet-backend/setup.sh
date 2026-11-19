#!/usr/bin/env bash
# Once per target: build wallet-backend at the ref (static binary, pinned Go image), start TimescaleDB,
# and migrate a template database the sessions are copied from.
. "$(dirname "$0")/common.sh"
mkdir -p "$WORK/bin" "$WORK/logs"
if [ ! -x "$BIN" ]; then
  [ -d "$WORK/src/.git" ] || git clone -q --filter=blob:none https://github.com/stellar/wallet-backend "$WORK/src"
  git -C "$WORK/src" cat-file -e "$REF^{commit}" 2>/dev/null || git -C "$WORK/src" fetch -q origin
  rm -rf "$WORK/tree-$SHORT" && mkdir -p "$WORK/tree-$SHORT"
  git -C "$WORK/src" archive "$REF" | tar -x -C "$WORK/tree-$SHORT"
  docker volume create xdrproof-gocache >/dev/null
  echo "building wallet-backend $SHORT" >&2
  docker run --rm -v "$WORK/tree-$SHORT":/src:ro -v xdrproof-gocache:/cache -v "$WORK/bin":/out \
    -e GOCACHE=/cache/build -e GOMODCACHE=/cache/mod -e CGO_ENABLED=0 -e GOFLAGS=-buildvcs=false -e GOTOOLCHAIN=local \
    -w /src "$GO_IMAGE" go build -o "/out/wb-$SHORT" . >"$WORK/logs/build-$SHORT.log" 2>&1 \
    || { tail -20 "$WORK/logs/build-$SHORT.log" >&2; exit 1; }
  rm -rf "$WORK/tree-$SHORT"
fi
docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
if ! docker inspect -f '{{.State.Running}}' "$DB" 2>/dev/null | grep -q true; then
  docker rm -f "$DB" >/dev/null 2>&1 || true
  docker run -d --name "$DB" --network "$NET" -e POSTGRES_HOST_AUTH_METHOD=trust "$DB_IMAGE" \
    postgres -c max_connections=500 -c timescaledb.enable_chunk_skipping=on -c timescaledb.enable_sparse_index_bloom=on >/dev/null
  for _ in $(seq 60); do docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  sleep 2
fi
if [ -z "$(psql_ -c "SELECT 1 FROM pg_database WHERE datname='$TPL'")" ]; then
  psql_ -c "CREATE DATABASE $TPL" >/dev/null
  docker run --rm --network "$NET" -v "$BIN":/wb:ro -e DATABASE_URL="postgres://postgres@$DB:5432/$TPL?sslmode=disable" \
    "$RUN_IMAGE" /wb migrate up >"$WORK/logs/migrate-$SHORT.log" 2>&1 || { tail -20 "$WORK/logs/migrate-$SHORT.log" >&2; exit 1; }
  # a template no session may connect to, so CREATE DATABASE ... TEMPLATE never finds it busy
  psql_ -c "ALTER DATABASE $TPL WITH IS_TEMPLATE true ALLOW_CONNECTIONS false" >/dev/null
fi
# TimescaleDB's scheduler may still hold a connection opened before the template was closed
psql_ -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TPL'" >/dev/null
