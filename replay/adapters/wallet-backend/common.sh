# Shared settings for the wallet-backend adapter scripts (sourced, not run).
set -euo pipefail
NET=xdrproof-wb-net
DB=xdrproof-wb-db
DB_IMAGE=timescale/timescaledb@sha256:909e2c7577c074517c8936b6d8799294b33f25fb5bad978a2199250665f1ce1a      # 2.28.2-pg17, as wallet-backend's compose file pins
GO_IMAGE=golang@sha256:1ae0735f00daffa3aaf1363a5184c0d2dc55c78e3db4ec70241cdac97bf84b59                  # 1.25-alpine (go1.25.14)
RUN_IMAGE=alpine@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f
WORK=${XDRPROOF_ADAPTER_WORK:?}
REF=${XDRPROOF_TARGET_REF:-}
SHORT=${REF:0:8}
TPL=tpl_${SHORT}
SDB=s_${XDRPROOF_SESSION_ID:-none}
BIN=$WORK/bin/wb-$SHORT
psql_() { docker exec -i "$DB" psql -q -v ON_ERROR_STOP=1 -U postgres -tA "$@"; }
# pull_once <image> <what it is>: a missing image is downloaded with a status line first, so the live row says why
# the step takes minutes (docker run would pull it silently)
pull_once() { docker image inspect "$1" >/dev/null 2>&1 || { echo "status: downloading $2 (once)" >&2; docker pull -q "$1" >/dev/null || { echo "could not download $1" >&2; exit 1; }; }; }
