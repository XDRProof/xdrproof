#!/usr/bin/env bash
# fetch-ledger.sh <root-url> <ledger-seq>   (SEP-0054: ledgersPerBatch=1, batchesPerPartition=64000)
set -euo pipefail
ROOT="$1"; SEQ="$2"; PER=64000
PSTART=$(( SEQ / PER * PER )); PEND=$(( PSTART + PER - 1 ))
PHEX=$(printf '%08X' $(( 0xFFFFFFFF - PSTART ))); FHEX=$(printf '%08X' $(( 0xFFFFFFFF - SEQ )))
URL="$ROOT/$PHEX--$PSTART-$PEND/$FHEX--$SEQ.xdr.zst"
echo "$URL" >&2
curl -sfL "$URL" -o "$SEQ.xdr.zst"
zstd -dqf "$SEQ.xdr.zst" -o "$SEQ.batch.xdr"
ls -l "$SEQ.xdr.zst" "$SEQ.batch.xdr" >&2
