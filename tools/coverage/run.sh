#!/usr/bin/env bash
# Computed coverage, no SDK decoder involved: the walker reads XDR bytes guided only by xdr.json
# (rs-stellar-xdr's generator definitions for stellar-xdr v30.0).
#   1. how many union arms are reachable from LedgerCloseMeta at v30.0
#   2. how many of them XDRProof's corpus entries reach, the mined ledgers reach, and both together
#   3. (GOLDENS=1) how many stellar-core's own golden ledgers reach, at commit f2b91947
set -euo pipefail
cd "$(dirname "$0")"
DEFS=defs/xdr-v30.0.json
echo "reachable from LedgerCloseMeta: $(python3 -I xdrcov.py atoms $DEFS LedgerCloseMeta)"
# entry variants are stored raw (.xdr) or zstd-compressed (.xdr.zst, the mined ones); both are walked, the
# compressed ones after decompression into .work/entries/<id>/
rm -rf .work/entries .work/mined && mkdir -p .work/entries .work/mined
node -e "const fs=require('fs'),z=require('zlib'),p=require('path');for(const id of fs.readdirSync('../../entries'))for(const f of fs.readdirSync('../../entries/'+id))if(f.endsWith('.xdr.zst')){fs.mkdirSync('.work/entries/'+id,{recursive:true});fs.writeFileSync(p.join('.work/entries',id,f.slice(0,-4)),z.zstdDecompressSync(fs.readFileSync(p.join('../../entries',id,f))))}"
ENTRIES=$( { find ../../entries -name '*.xdr'; find .work/entries -name '*.xdr'; } | sort )
# one walk per list (paths have no spaces, so word-splitting is safe and keeps it a single invocation)
# shellcheck disable=SC2086
python3 -I xdrcov.py walk $DEFS LedgerCloseMeta $ENTRIES | python3 -I summary.py "XDRProof corpus ($(echo "$ENTRIES" | wc -l | tr -d ' ') variant files)"
# mined ledgers (mined/index.json; stored zstd-compressed, decompressed here first)
node -e "const fs=require('fs'),z=require('zlib');for(const f of fs.readdirSync('../../mined/ledgers'))fs.writeFileSync('.work/mined/'+f.replace(/\.zst$/,''),z.zstdDecompressSync(fs.readFileSync('../../mined/ledgers/'+f)))"
python3 -I xdrcov.py walk $DEFS LedgerCloseMeta .work/mined/*.xdr | python3 -I summary.py 'XDRProof mined ledgers'
# shellcheck disable=SC2086
python3 -I xdrcov.py walk $DEFS LedgerCloseMeta $ENTRIES .work/mined/*.xdr | python3 -I summary.py 'entries + mined'
if [ "${GOLDENS:-0}" = 1 ]; then
  G=.work/stellar-core; SHA=f2b91947fb20fc8174cca38bf320eda7baa3edbb
  if [ ! -d "$G/test-lcm-current" ]; then
    mkdir -p "$G" && git -C "$G" init -q && git -C "$G" remote add origin https://github.com/stellar/stellar-core 2>/dev/null || true
    git -C "$G" sparse-checkout set test-lcm-current && git -C "$G" fetch -q --depth 1 --filter=blob:none origin "$SHA" && git -C "$G" checkout -q FETCH_HEAD
  fi
  find "$G/test-lcm-current" -name '*.xdr' -print0 | xargs -0 python3 -I xdrcov.py walk $DEFS LedgerCloseMeta --framed \
    | python3 -I summary.py 'stellar-core goldens @f2b91947'
fi
