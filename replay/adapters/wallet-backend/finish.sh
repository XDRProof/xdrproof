#!/usr/bin/env bash
. "$(dirname "$0")/common.sh"
psql_ -c "DROP DATABASE IF EXISTS $SDB WITH (FORCE)" >/dev/null
