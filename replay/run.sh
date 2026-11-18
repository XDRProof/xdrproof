#!/usr/bin/env bash
# Replays corpus ledgers into real wallet-backend builds through a mock stellar-rpc and prints one
# verdict per commit, read from the indexer's own state (process exit, ingest cursor, rows it stored),
# never from log text.
#
#   run.sh 729   testnet ledgers 4437356-4437359 (mined; the wallet-backend#729 sighting)
#                79ea2acd  before #693/#729 -> mishandled (signer stored as 33 bytes, payload lost: #716)
#                6e5a5910  before #729      -> halted     (exit 2, cursor stuck before 4437357)
#                2c873353  #729 fixed       -> handled    (cursor 4437359, full 41-byte P-key stored)
#   run.sh 731   XDRProof's own generated CAP-0073 ledger (sac.trust.creates-trustline, protocol 28)
#                764a4f5b  before #731      -> dropped    (ledger ingested, no TRUSTLINE/ADD state change)
#                c152783c  #731 fixed       -> handled    (TRUSTLINE/ADD recorded)
#
# Needs: Docker, Node >= 22.15, git. Containers are named xdrproof-replay-* and removed at the end.
set -euo pipefail
SCENARIO=${1:-729}
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${XDRPROOF_WORK:-$HERE/.work}
PORT=${XDRPROOF_MOCK_PORT:-18545}
TIMEOUT=${XDRPROOF_TIMEOUT:-30}
NET=xdrproof-replay-net; DB=xdrproof-replay-db
case $SCENARIO in
  729) COMMITS=(79ea2acd 6e5a5910 2c873353); FIRST=4437356; ENTRY=4437357; LAST=4437359
       NETWORK=testnet; PASSPHRASE="Test SDF Network ; September 2015" ;;
  731) COMMITS=(764a4f5b c152783c); FIRST=5; ENTRY=5; LAST=5
       NETWORK=pubnet; PASSPHRASE="Public Global Stellar Network ; September 2015" ;;
  *) echo "usage: run.sh 729|731"; exit 2 ;;
esac
L="$WORK/ledgers-$SCENARIO"; mkdir -p "$WORK/bin" "$L" "$WORK/logs"

cleanup() { docker rm -f "$DB" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null || true; }
trap cleanup EXIT

# 1. Ledgers. 729: vendored SEP-0054 lake objects, decompressed, 12-byte LedgerCloseMetaBatch prefix
#    stripped. 731: the corpus entry's raw LedgerCloseMeta, as is.
node -e '
const fs=require("fs"),z=require("zlib"),p=require("path");const [src,dst]=process.argv.slice(1);
for (const f of fs.readdirSync(src)) {
  if (f.endsWith(".xdr.zst")) fs.writeFileSync(p.join(dst,f.replace(".xdr.zst",".lcm.xdr")),z.zstdDecompressSync(fs.readFileSync(p.join(src,f))).subarray(12));
  else if (f.endsWith(".lcm.xdr")) fs.copyFileSync(p.join(src,f),p.join(dst,f));
}' "$HERE/ledgers-$SCENARIO" "$L"

# 2. wallet-backend at each commit, built in a Go container (static binary).
[ -d "$WORK/wallet-backend/.git" ] || git clone -q --filter=blob:none https://github.com/stellar/wallet-backend "$WORK/wallet-backend"
docker volume create xdrproof-gocache >/dev/null
for c in "${COMMITS[@]}"; do
  [ -x "$WORK/bin/wb-$c" ] && continue
  rm -rf "$WORK/src-$c" && mkdir -p "$WORK/src-$c"
  git -C "$WORK/wallet-backend" archive "$c" | tar -x -C "$WORK/src-$c"
  echo "building wallet-backend $c ..."
  docker run --rm --name "xdrproof-replay-build-$c" -v "$WORK/src-$c":/src:ro -v xdrproof-gocache:/cache -v "$WORK/bin":/out \
    -e GOCACHE=/cache/build -e GOMODCACHE=/cache/mod -e CGO_ENABLED=0 -e GOFLAGS=-buildvcs=false \
    -w /src golang:1.25-alpine go build -o "/out/wb-$c" . >"$WORK/logs/build-$c.log" 2>&1
done

# 3. Database and mock RPC.
docker network create "$NET" >/dev/null 2>&1 || true
docker rm -f "$DB" >/dev/null 2>&1 || true
docker run -d --name "$DB" --network "$NET" -e POSTGRES_HOST_AUTH_METHOD=trust timescale/timescaledb:2.28.2-pg17 \
  postgres -c timescaledb.enable_chunk_skipping=on -c timescaledb.enable_sparse_index_bloom=on >/dev/null
until docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; sleep 2
PASSPHRASE="$PASSPHRASE" node "$HERE/mock-rpc.mjs" "$L" "$PORT" "$WORK/logs/mock-$SCENARIO.jsonl" >"$WORK/logs/mock-$SCENARIO.out" 2>&1 & MOCK_PID=$!
sleep 1

psql() { docker exec -i "$DB" psql -q -U postgres -tA "$@" 2>/dev/null; }
wb() { # wb <commit> <timeout> <args...>
  local c=$1 t=$2; shift 2
  docker run --rm --name "xdrproof-replay-wb-$c-$RANDOM" --network "$NET" --add-host=host.docker.internal:host-gateway \
    -v "$WORK/bin/wb-$c":/wb:ro \
    -e DATABASE_URL="postgres://postgres@$DB:5432/wb_$c?sslmode=disable" \
    -e RPC_URL=http://host.docker.internal:$PORT -e ARCHIVE_URL=http://host.docker.internal:$PORT/archive \
    -e NETWORK=$NETWORK -e NETWORK_PASSPHRASE="$PASSPHRASE" -e LEDGER_BACKEND_TYPE=rpc \
    -e INGESTION_MODE=live -e STELLAR_ENVIRONMENT=xdrproof -e LOG_LEVEL=INFO -e GET_LEDGERS_LIMIT=10 \
    alpine:3.22 timeout "$t" /wb "$@"
}

# 4. One isolated session per commit: fresh database, migrations, cursor seeded to first-1, live ingestion.
printf '\n%-10s %-5s %-9s %-26s %-11s %s\n' commit exit cursor probe verdict expected
fail=0
for c in "${COMMITS[@]}"; do
  psql -c "DROP DATABASE IF EXISTS wb_$c" >/dev/null; psql -c "CREATE DATABASE wb_$c" >/dev/null
  wb "$c" 60 migrate up >"$WORK/logs/migrate-$c.log" 2>&1
  psql -d "wb_$c" -c "INSERT INTO ingest_store(key,value) VALUES ('latest_ingest_ledger','$((FIRST-1))'),('oldest_ingest_ledger','$((FIRST-1))')" >/dev/null
  set +e; wb "$c" "$TIMEOUT" ingest >"$WORK/logs/ingest-$SCENARIO-$c.log" 2>&1; code=$?; set -e
  cursor=$(psql -d "wb_$c" -c "SELECT value FROM ingest_store WHERE key='latest_ingest_ledger'")
  if [ "$SCENARIO" = 729 ]; then
    n=$(psql -d "wb_$c" -c "SELECT coalesce(max(octet_length(signer_account_id)),0) FROM state_changes WHERE ledger_number=$ENTRY AND state_change_category='SIGNER'")
    probe="signer bytes $n"
    if [ "$cursor" -lt "$ENTRY" ]; then verdict=halted; elif [ "$n" = 41 ]; then verdict=handled; else verdict=mishandled; fi
    case $c in 79ea2acd) want=mishandled;; 6e5a5910) want=halted;; *) want=handled;; esac
  else
    n=$(psql -d "wb_$c" -c "SELECT count(*) FROM state_changes WHERE ledger_number=$ENTRY AND state_change_category='TRUSTLINE' AND state_change_reason='ADD'")
    probe="TRUSTLINE/ADD rows $n"
    if [ "$cursor" -lt "$ENTRY" ]; then verdict=halted; elif [ "$n" -ge 1 ]; then verdict=handled; else verdict=dropped; fi
    case $c in 764a4f5b) want=dropped;; *) want=handled;; esac
  fi
  [ "$verdict" = "$want" ] || fail=1
  printf '%-10s %-5s %-9s %-26s %-11s %s\n' "$c" "$code" "$cursor" "$probe" "$verdict" "$want"
done
echo
[ $fail = 0 ] && echo "OK: every verdict matches the sighting (scenario $SCENARIO)." || { echo "MISMATCH: see $WORK/logs"; exit 1; }
