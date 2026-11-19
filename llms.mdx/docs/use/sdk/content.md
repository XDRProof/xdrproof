# Test your SDK (/docs/use/sdk)

**What it is.** One test file for your SDK's test suite. It reads every ledger in the corpus, decodes it as `LedgerCloseMeta`, encodes it again, and checks that the bytes are identical.

**Why it matters.** A ledger that does not round-trip is a ledger your SDK reads wrongly: a field dropped, a value changed, or a shape it cannot read at all. The corpus is the rarest valid ledgers stellar-core writes, so this is the cheapest way to meet them in CI before a user does.

<Steps>
<Step>

### Get the corpus

Clone it next to your tests, or add it as a git submodule so CI pins a version:

```bash
git clone --depth 1 https://github.com/XDRProof/xdrproof
# or: git submodule add https://github.com/XDRProof/xdrproof
```

Each entry is a folder in `entries/` with an `entry.json` that lists its variants. A variant is one ledger file. The 37 mined ledgers from the public data lake ship zstd-compressed (`.xdr.zst`); decompress those first. The tests below read `xdrproof/entries`, or the folder in `XDRPROOF_ENTRIES`.

</Step>
<Step>

### Add the test

<Tabs items={["JavaScript", "Go", "Rust", "Python"]}>
<Tab value="JavaScript">

`@stellar/stellar-sdk` 17.4.0. Node 22.15 or later, for its built-in zstd.

```js title="xdrproof.test.mjs"
// Every corpus ledger must decode and re-encode to the same bytes.
// Run: node --test   (Node 22.15 or later, for zstd)
import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { zstdDecompressSync } from "node:zlib"
import { xdr } from "@stellar/stellar-sdk"

const ENTRIES = process.env.XDRPROOF_ENTRIES ?? "xdrproof/entries"

for (const id of readdirSync(ENTRIES)) {
  const file = join(ENTRIES, id, "entry.json")
  if (!existsSync(file)) continue
  for (const v of JSON.parse(readFileSync(file, "utf8")).variants) {
    test(`${id}@${v.key}`, () => {
      let bytes = readFileSync(join(ENTRIES, id, v.file))
      // mined ledgers ship zstd-compressed
      if (v.file.endsWith(".zst")) bytes = zstdDecompressSync(bytes)
      const meta = xdr.LedgerCloseMeta.fromXDR(bytes)
      assert.ok(Buffer.from(meta.toXDR()).equals(bytes), "bytes differ")
    })
  }
}
```

```bash
npm install @stellar/stellar-sdk@17.4.0
node --test
```

What it printed, on Node 25.9 (the end of the run):

```text
ℹ tests 634
ℹ suites 0
ℹ pass 634
ℹ fail 0
```

</Tab>
<Tab value="Go">

`github.com/stellar/go-stellar-sdk` v0.9.0. `xdr.SafeUnmarshal` keeps the SDK's default depth limit.

```go title="xdrproof_test.go"
// Every corpus ledger must decode and re-encode to the same bytes.
// Run: go test ./...
package xdrproof_test

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klauspost/compress/zstd"
	"github.com/stellar/go-stellar-sdk/xdr"
)

func TestCorpusRoundTrip(t *testing.T) {
	root := "xdrproof/entries"
	if r := os.Getenv("XDRPROOF_ENTRIES"); r != "" {
		root = r
	}
	dirs, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	unzst, _ := zstd.NewReader(nil)
	for _, d := range dirs {
		dir := filepath.Join(root, d.Name())
		raw, err := os.ReadFile(filepath.Join(dir, "entry.json"))
		if err != nil {
			continue
		}
		var entry struct{ Variants []struct{ Key, File string } }
		if err := json.Unmarshal(raw, &entry); err != nil {
			t.Fatal(err)
		}
		for _, v := range entry.Variants {
			t.Run(d.Name()+"@"+v.Key, func(t *testing.T) {
				b, err := os.ReadFile(filepath.Join(dir, v.File))
				if err != nil {
					t.Fatal(err)
				}
				// mined ledgers ship zstd-compressed
				if strings.HasSuffix(v.File, ".zst") {
					if b, err = unzst.DecodeAll(b, nil); err != nil {
						t.Fatal(err)
					}
				}
				var meta xdr.LedgerCloseMeta
				if err := xdr.SafeUnmarshal(b, &meta); err != nil {
					t.Fatal("decode: ", err)
				}
				out, err := meta.MarshalBinary()
				if err != nil {
					t.Fatal("encode: ", err)
				}
				if !bytes.Equal(out, b) {
					t.Fatal("re-encoded bytes differ")
				}
			})
		}
	}
}
```

```bash
go get github.com/stellar/go-stellar-sdk@v0.9.0
go mod tidy
go test ./...
```

`go mod tidy` is needed: `go get` on the SDK's root module leaves the `xdr` package's own dependencies out of `go.sum`, and the first try, without it, stopped with `missing go.sum entry`. With it, on Go 1.27.4:

```text
ok  	example.com/check	0.569s
```

`go test -v` lists 634 passing subtests, one per variant, and no failures.

</Tab>
<Tab value="Rust">

`stellar-xdr` 30.0.0 has **no default depth limit**: you choose one in `Limits`. The deepest corpus ledgers need more than 500 levels (see [how deep is too deep](/docs/findings/reported)); 1500 reads them all.

```toml title="Cargo.toml"
[dev-dependencies]
stellar-xdr = "=30.0.0"
serde_json = "1"
zstd = "0.13"
```

```rust title="tests/xdrproof.rs"
// Every corpus ledger must decode and re-encode to the same bytes.
// Run: cargo test --release
use std::{env, fs};
use stellar_xdr::{LedgerCloseMeta, Limits, ReadXdr, WriteXdr};

// rs-stellar-xdr has no default depth limit: choose one.
// The deepest corpus ledgers need more than 500.
fn limits() -> Limits {
    Limits { depth: 1500, len: 256 * 1024 * 1024 }
}

#[test]
fn corpus_round_trips() {
    let root = env::var("XDRPROOF_ENTRIES")
        .unwrap_or("xdrproof/entries".into());
    let mut n = 0;
    for dir in fs::read_dir(&root).unwrap() {
        let dir = dir.unwrap().path();
        let Ok(raw) = fs::read(dir.join("entry.json")) else {
            continue;
        };
        let entry: serde_json::Value =
            serde_json::from_slice(&raw).unwrap();
        for v in entry["variants"].as_array().unwrap() {
            let file = v["file"].as_str().unwrap();
            let mut bytes = fs::read(dir.join(file)).unwrap();
            // mined ledgers ship zstd-compressed
            if file.ends_with(".zst") {
                bytes = zstd::decode_all(&bytes[..]).unwrap();
            }
            let name = format!("{}@{}", dir.display(), v["key"]);
            let meta = LedgerCloseMeta::from_xdr(&bytes, limits())
                .unwrap_or_else(|e| panic!("{name}: decode: {e}"));
            let out = meta.to_xdr(limits()).unwrap();
            assert_eq!(out, bytes, "{name}: bytes differ");
            n += 1;
        }
    }
    println!("{n} corpus variants round-trip");
}
```

```bash
cargo test --release -- --nocapture
```

The types are at the crate root in 30.0.0 (a first try with `stellar_xdr::curr::…` did not compile). On cargo 1.98.1:

```text
running 1 test
634 corpus variants round-trip
test corpus_round_trips ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.47s
```

</Tab>
<Tab value="Python">

`stellar-sdk` 17.0.1 (py-stellar-base), with `zstandard` for the mined ledgers.

```python title="test_xdrproof.py"
# Every corpus ledger must decode and re-encode to the same bytes.
# Run: pytest -q
import json
import os
import pathlib

import pytest
import zstandard
from stellar_sdk import xdr

ROOT = os.environ.get("XDRPROOF_ENTRIES", "xdrproof/entries")
CASES = [
    (d, v)
    for d in sorted(pathlib.Path(ROOT).iterdir())
    if (d / "entry.json").exists()
    for v in json.loads((d / "entry.json").read_text())["variants"]
]
IDS = [f"{d.name}@{v['key']}" for d, v in CASES]


@pytest.mark.parametrize("d,v", CASES, ids=IDS)
def test_round_trip(d, v):
    data = (d / v["file"]).read_bytes()
    # mined ledgers ship zstd-compressed
    if v["file"].endswith(".zst"):
        unzst = zstandard.ZstdDecompressor().decompressobj()
        data = unzst.decompress(data)
    meta = xdr.LedgerCloseMeta.from_xdr_bytes(data)
    assert meta.to_xdr_bytes() == data
```

```bash
pip install stellar-sdk==17.0.1 zstandard pytest
pytest -q
```

On Python 3.13.18 (the end of the run):

```text
634 passed in 17.06s
```

</Tab>
</Tabs>

</Step>
<Step>

### Go further

A byte round trip is the floor. Each entry also lists the **facts** a correct reader must find (`expected.facts`, at a JSON Pointer path in the SEP-0051 rendering), and some list SDK checks (`expected.sdk_checks`). [Conformance](/docs/tools/conformance) runs all of them, through the same bytes, in every build.

</Step>
</Steps>

<Callout title="Depth">
The deepest valid ledgers in the corpus need more than 500 levels of XDR nesting. js-stellar-sdk 17.4.0, go-stellar-sdk v0.9.0 and py-stellar-base 17.0.1 read all of them with their defaults. rs-stellar-xdr has no default, so pick a limit (1500 above). `@stellar/stellar-xdr-json` 30.0.0 refuses 13 of them: [F-1](/docs/findings/reported).
</Callout>

## Join the matrix

[Conformance](/docs/tools/conformance) runs 6 SDK builds over the whole corpus today (JavaScript, WebAssembly, Rust, Go and two Python packages), plus 5 older releases on the fixed-bug regressions. Any SDK can join by wrapping itself in a **testee**: a small program that reads one JSON request per line on stdin and writes one JSON answer per line on stdout.

| `op` | Input | Answer when `ok` |
|---|---|---|
| `hello` | none | `implementation: {sdk, package, version, runtime}`, `ops: [...]` |
| `decode` | `{type, xdr}`: a type name as rs-stellar-xdr spells it, and base64 bytes | `xdr`: your re-encoding; `json`: your SEP-0051 rendering, if you have one |
| `encode_json` | `{type, json}` | `xdr`: base64 |
| `strkey_decode` | `{strkey}` | `kind`: the first letter; `payload`: hex of the bytes between version byte and checksum |
| `native` | `{type: "ScVal", xdr}` | `value`: your native projection, rendered losslessly |

Every answer carries `status`: `ok`, `error` (with the stage and message) or `unsupported`. Anything your SDK cannot do is `unsupported`, recorded as not applicable, never as a failure. The six testees in [`conformance/testees/`](https://github.com/XDRProof/xdrproof/tree/main/conformance/testees) are working examples, from 28 to 118 lines each.

The Java, Swift, Dart, PHP and .NET SDKs are not run today. Testees for all five, run over the whole corpus with every difference pinned, are Deliverable 10 of the grant's Tranche 3 ([Architecture](/docs/start/architecture)).
