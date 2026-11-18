#!/usr/bin/env bash
# Regenerates every generated corpus variant from scratch, twice, with a bare standalone
# stellar-core v30.0.0 on the mainnet passphrase (no RPC, no network, no keys or funds),
# then checks that the two runs agree and that the shipped entry bytes are reproduced.
#
# Needs: Docker (image stellar/quickstart:latest supplies stellar-core v30.0.0), Node >= 22, curl, jq.
set -euo pipefail
cd "$(dirname "$0")"
[ -d classic/node_modules ] || (cd classic && npm install --silent --no-audit --no-fund)
[ -d soroban/gen/node_modules ] || (cd soroban/gen && npm install --silent --no-audit --no-fund)
[ -d ../tools/node_modules ] || (cd ../tools && npm install --silent --no-audit --no-fund)

echo "classic lane (payments, muxed accounts, signed-payload signers): two fresh runs"
classic/trial.sh c1 21641 && classic/trial.sh c2 21642
node ../tools/compare.mjs classic/runs/c1/lcm classic/runs/c2/lcm signer.signed-payload.set-options=ledger-006.xdr

echo "soroban lane (SAC trust, colliding map keys, deep auth trees, muxed contract transfers): two fresh runs"
soroban/trial.sh s1 21643 30 && soroban/trial.sh s2 21644 30
node ../tools/compare.mjs soroban/runs/s1/lcm soroban/runs/s2/lcm \
  sac.trust.creates-trustline=ledger-005.xdr scval.map.keys-collide-on-native-conversion=ledger-019.xdr
echo "OK: generation reproduced"
