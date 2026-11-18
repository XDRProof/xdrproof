#!/bin/sh
# builds one static linux binary per SDK version into /out
set -e
for v in "$@"; do
  rm -rf /tmp/b && mkdir /tmp/b && cp /src/main.go /tmp/b/ && cd /tmp/b
  go mod init xdrproof/testee-go >/dev/null 2>&1
  go get github.com/stellar/go-stellar-sdk@$v >/dev/null 2>&1 || { echo "go get $v failed"; continue; }
  go mod tidy >/dev/null 2>&1
  CGO_ENABLED=0 go build -o /out/testee-go-$v . && echo "built $v"
done
