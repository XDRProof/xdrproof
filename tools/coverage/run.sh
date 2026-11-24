#!/usr/bin/env bash
# make coverage: computed coverage, no SDK decoder involved. The walker (xdrcov.py) reads XDR bytes guided only by
# xdr.json (rs-stellar-xdr's generator definitions for stellar-xdr v30.0); tools/coverage/run.mjs walks the corpus
# entries and the mined ledgers in parallel, checks that every arm neither reaches is classified in
# coverage/exclusions.json, and prints the result as proof cards.
#   tools/coverage/run.sh [--details]       GOLDENS=1 also walks stellar-core's own golden ledgers at f2b91947
cd "$(dirname "$0")/../.." && exec node tools/coverage/run.mjs "$@"
