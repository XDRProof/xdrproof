#!/usr/bin/env bash
# Per session: read the indexer's peak memory from its cgroup, then stop it.
. "$(dirname "$0")/common.sh"
c="xdrproof-wb-$XDRPROOF_SESSION_ID"
peak=$(docker exec "$c" cat /sys/fs/cgroup/memory.peak 2>/dev/null || true)
docker rm -f "$c" >/dev/null 2>&1 || true
[ -n "$peak" ] && echo "{\"memory_peak_bytes\": $peak}" || echo "{}"
