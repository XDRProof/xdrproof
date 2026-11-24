# Test your SDK (/docs/use/sdk)

**What it is.** One test file for your SDK's test suite. It fetches every ledger in the corpus at a pinned commit, checks each one's sha256, decodes it as `LedgerCloseMeta`, encodes it again, and checks that the bytes are identical.

**Why it matters.** A ledger that does not round-trip is a ledger your SDK reads wrongly: a field dropped, a value changed, or a shape it cannot read at all. The corpus is the rarest valid ledgers stellar-core writes, so this is the cheapest way to meet them in CI before a user does.

<Steps>
<Step>

### Nothing to clone

The test reads `manifest.json` from GitHub at a pinned commit, then each ledger it lists from `raw.githubusercontent.com/XDRProof/xdrproof/<commit>/entries/<id>/<file>`, and checks every file against the sha256 the manifest records. It keeps what it fetched in `.xdrproof/`, so later runs read from disk: cache that folder in CI, and add it to `.gitignore`. To move to a newer corpus, change the commit.

The manifest lists 635 ledgers. The 38 mined from the public data lake ship zstd-compressed (`.xdr.zst`); the test decompresses them, and the recorded sha256 is of the ledger itself.

**Prefer a pinned copy in your repository?** Add it as a git submodule and point the test's cache folder at it (`CACHE = "xdrproof"`); it then reads the files in place and fetches nothing.

```bash
git submodule add https://github.com/XDRProof/xdrproof xdrproof
```

</Step>
<Step>

### Add the test

<Tabs items={["JavaScript", "Go", "Rust", "Python"]}>
<Tab value="JavaScript">

`@stellar/stellar-sdk` 17.4.0. Node 22.15 or later, for its built-in `fetch` and zstd.

```js title="xdrproof.test.mjs"
// Every corpus ledger must decode and re-encode to the same bytes.
// Fetches the pinned corpus once into .xdrproof/, checking sha256.
// Run: node --test   (Node 22.15 or later)
import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { zstdDecompressSync } from "node:zlib"
import { xdr } from "@stellar/stellar-sdk"

const PIN = "24810e7256fcf8da5d5cc6e0a8422b7c110820d0"
const RAW =
  `https://raw.githubusercontent.com/XDRProof/xdrproof/${PIN}/`
const CACHE = join(".xdrproof", PIN)

async function get(path) {
  const file = join(CACHE, path)
  if (!existsSync(file)) {
    const res = await fetch(RAW + path)
    if (!res.ok) throw new Error(`${res.status} ${path}`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  }
  return readFileSync(file)
}

const { rows } = JSON.parse(await get("manifest.json"))
// fetch the corpus 8 files at a time before the tests start
for (let i = 0; i < rows.length; i += 8)
  await Promise.all(rows.slice(i, i + 8).map((r) => get(r.file)))
for (const row of rows) {
  test(row.entry_id, async () => {
    let bytes = await get(row.file)
    // mined ledgers ship zstd-compressed; sha256 is of the ledger
    if (row.file.endsWith(".zst")) bytes = zstdDecompressSync(bytes)
    const sha = createHash("sha256").update(bytes).digest("hex")
    assert.equal(sha, row.sha256, "not the pinned bytes")
    const meta = xdr.LedgerCloseMeta.fromXDR(bytes)
    assert.ok(Buffer.from(meta.toXDR()).equals(bytes), "bytes differ")
  })
}
```

```bash
npm install @stellar/stellar-sdk@17.4.0
node --test xdrproof.test.mjs
```

From an empty folder, on Node 25.9: the first run fetches the corpus (98 seconds here, most of it the download); a second run reads `.xdrproof/` and takes under 5 seconds.

A real run of `node --test xdrproof.test.mjs`, recorded 24 Nov 2026:

```text
✔ upgrade.config-lanes-and-freeze@p30-testnet-generated (0.165958ms)
✔ upgrade.config-lanes-and-freeze@p28-testnet-generated (0.246791ms)
✔ upgrade.config-restore-and-unfreeze@p30-mainnet-generated (0.270292ms)
✔ upgrade.config-restore-and-unfreeze@p28-mainnet-generated (0.178833ms)
✔ upgrade.config-restore-and-unfreeze@p30-testnet-generated (0.156792ms)
✔ upgrade.config-restore-and-unfreeze@p28-testnet-generated (0.231042ms)
✔ upgrade.config-settings-vote-mainnet@p29-mainnet-mined-l65080525 (196.
711958ms)
✔ upgrade.config-short-lifetimes@p30-mainnet-generated (1.166208ms)
✔ upgrade.config-short-lifetimes@p28-mainnet-generated (0.261ms)
✔ upgrade.config-short-lifetimes@p30-testnet-generated (0.387208ms)
✔ upgrade.config-short-lifetimes@p28-testnet-generated (0.208875ms)
✔ upgrade.frozen-keys-mainnet@p29-mainnet-mined-l65273932 (83.980959ms)
✔ upgrade.generated-header-fee-sizes-flags@p30-mainnet-generated (0.8324
59ms)
✔ upgrade.generated-header-fee-sizes-flags@p30-testnet-generated (0.1736
25ms)
✔ upgrade.generated-protocol-30@p30-mainnet-generated (1.149167ms)
✔ upgrade.generated-protocol-30@p30-testnet-generated (0.673208ms)
✔ upgrade.protocol-29-mainnet@p29-mainnet-mined-l64717645 (47.58325ms)
✔ upgrade.protocol-30-testnet@p30-testnet-mined-l5540313 (17.706042ms)
ℹ tests 634
ℹ suites 0
ℹ pass 634
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 98277.796
```

</Tab>
<Tab value="Go">

`github.com/stellar/go-stellar-sdk` v0.9.0. `xdr.SafeUnmarshal` keeps the SDK's default depth limit.

```go title="xdrproof_test.go"
// Every corpus ledger must decode and re-encode to the same bytes.
// Fetches the pinned corpus once into .xdrproof/, checking sha256.
// Run: go test ./...
package xdrproof_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klauspost/compress/zstd"
	"github.com/stellar/go-stellar-sdk/xdr"
)

const pin = "24810e7256fcf8da5d5cc6e0a8422b7c110820d0"
const raw = "https://raw.githubusercontent.com/XDRProof/xdrproof/" +
	pin + "/"

func get(path string) ([]byte, error) {
	file := filepath.Join(".xdrproof", pin, path)
	if b, err := os.ReadFile(file); err == nil {
		return b, nil
	}
	res, err := http.Get(raw + path)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: %s", path, res.Status)
	}
	b, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	os.MkdirAll(filepath.Dir(file), 0o755)
	return b, os.WriteFile(file, b, 0o644)
}

func TestCorpusRoundTrip(t *testing.T) {
	m, err := get("manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Rows []struct {
			ID     string `json:"entry_id"`
			File   string `json:"file"`
			Sha256 string `json:"sha256"`
		} `json:"rows"`
	}
	if err := json.Unmarshal(m, &manifest); err != nil {
		t.Fatal(err)
	}
	unzst, _ := zstd.NewReader(nil)
	for _, row := range manifest.Rows {
		t.Run(row.ID, func(t *testing.T) {
			t.Parallel() // fetches run side by side
			b, err := get(row.File)
			if err != nil {
				t.Fatal(err)
			}
			// mined ledgers: zstd-compressed; sha256 is of the ledger
			if strings.HasSuffix(row.File, ".zst") {
				if b, err = unzst.DecodeAll(b, nil); err != nil {
					t.Fatal(err)
				}
			}
			sum := sha256.Sum256(b)
			if hex.EncodeToString(sum[:]) != row.Sha256 {
				t.Fatal("not the pinned bytes")
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
```

```bash
go get github.com/stellar/go-stellar-sdk@v0.9.0
go mod tidy
go test ./...
```

`go mod tidy` is needed: `go get` on the SDK's root module leaves the `xdr` package's own dependencies out of `go.sum`, and a first try without it stopped with `missing go.sum entry`. From an empty folder, on Go 1.25.14 (the official `golang` Docker image, as this machine has no Go installed):

A real run of `go test ./...`, recorded 24 Nov 2026:

```text
ok  example.com/xdrproof-demo10.989s
```

`go test -v` lists 634 passing subtests, one per ledger, and no failures.

</Tab>
<Tab value="Rust">

`stellar-xdr` 30.0.0 has **no default depth limit**: you choose one in `Limits`. The deepest corpus ledgers need more than 500 levels (see [how deep is too deep](/docs/findings/reported)); 1500 reads them all.

```toml title="Cargo.toml"
[dev-dependencies]
stellar-xdr = "=30.0.0"
serde_json = "1"
sha2 = "0.10"
ureq = "2"
zstd = "0.13"
```

```rust title="tests/xdrproof.rs"
// Every corpus ledger must decode and re-encode to the same bytes.
// Fetches the pinned corpus once into .xdrproof/, checking sha256.
// Run: cargo test --release -- --nocapture
use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::Path};
use stellar_xdr::{LedgerCloseMeta, Limits, ReadXdr, WriteXdr};

const PIN: &str = "24810e7256fcf8da5d5cc6e0a8422b7c110820d0";

fn get(path: &str) -> Vec<u8> {
    let file = Path::new(".xdrproof").join(PIN).join(path);
    if let Ok(b) = fs::read(&file) {
        return b;
    }
    let url = format!(
        "https://raw.githubusercontent.com/XDRProof/xdrproof/{}/{}",
        PIN, path
    );
    let mut b = Vec::new();
    let res = ureq::get(&url).call().unwrap();
    res.into_reader().read_to_end(&mut b).unwrap();
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, &b).unwrap();
    b
}

// rs-stellar-xdr has no default depth limit: choose one.
// The deepest corpus ledgers need more than 500.
fn limits() -> Limits {
    Limits { depth: 1500, len: 256 * 1024 * 1024 }
}

#[test]
fn corpus_round_trips() {
    let m: serde_json::Value =
        serde_json::from_slice(&get("manifest.json")).unwrap();
    let rows = m["rows"].as_array().unwrap();
    // fetch the corpus 8 files at a time before the checks
    let files: Vec<&str> =
        rows.iter().map(|r| r["file"].as_str().unwrap()).collect();
    for chunk in files.chunks(8) {
        std::thread::scope(|s| {
            for f in chunk {
                s.spawn(move || get(f));
            }
        });
    }
    for row in rows {
        let id = row["entry_id"].as_str().unwrap();
        let file = row["file"].as_str().unwrap();
        let mut bytes = get(file);
        // mined ledgers ship zstd-compressed; sha256 is of the ledger
        if file.ends_with(".zst") {
            bytes = zstd::decode_all(&bytes[..]).unwrap();
        }
        let sha = format!("{:x}", Sha256::digest(&bytes));
        assert_eq!(sha, row["sha256"].as_str().unwrap(), "{id}");
        let meta = LedgerCloseMeta::from_xdr(&bytes, limits())
            .unwrap_or_else(|e| panic!("{id}: decode: {e}"));
        let out = meta.to_xdr(limits()).unwrap();
        assert_eq!(out, bytes, "{id}: bytes differ");
    }
    println!("{} corpus variants round-trip", rows.len());
}
```

```bash
cargo test --release -- --nocapture
```

The types are at the crate root in 30.0.0 (a first try with `stellar_xdr::curr::…` did not compile). From an empty folder, on cargo 1.98.1:

A real run of `cargo test --release -- --nocapture`, recorded 24 Nov 2026:

```text
    Finished `release` profile [optimized] target(s) in 0.33s
     Running unittests src/lib.rs (target/release/deps/xdrproof_demo-412
538738dd1c5b2)

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered o
ut; finished in 0.00s

     Running tests/xdrproof.rs (target/release/deps/xdrproof-c5f7c5e50d8
51f46)

running 1 test
634 corpus variants round-trip
test corpus_round_trips ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered o
ut; finished in 47.73s

   Doc-tests xdrproof_demo

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered o
ut; finished in 0.00s
```

</Tab>
<Tab value="Python">

`stellar-sdk` 17.0.1 (py-stellar-base), with `zstandard` for the mined ledgers.

```python title="test_xdrproof.py"
# Every corpus ledger must decode and re-encode to the same bytes.
# Fetches the pinned corpus once into .xdrproof/, checking sha256.
# Run: pytest -q
import hashlib
import json
import pathlib
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import pytest
import zstandard
from stellar_sdk import xdr

PIN = "24810e7256fcf8da5d5cc6e0a8422b7c110820d0"
RAW = f"https://raw.githubusercontent.com/XDRProof/xdrproof/{PIN}/"
CACHE = pathlib.Path(".xdrproof") / PIN


def get(path):
    file = CACHE / path
    if not file.exists():
        file.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(RAW + path) as res:
            file.write_bytes(res.read())
    return file.read_bytes()


ROWS = json.loads(get("manifest.json"))["rows"]
# fetch the corpus 8 files at a time before the tests start
with ThreadPoolExecutor(8) as pool:
    list(pool.map(get, [row["file"] for row in ROWS]))
IDS = [row["entry_id"] for row in ROWS]


@pytest.mark.parametrize("row", ROWS, ids=IDS)
def test_round_trip(row):
    data = get(row["file"])
    # mined ledgers ship zstd-compressed; sha256 is of the ledger
    if row["file"].endswith(".zst"):
        unzst = zstandard.ZstdDecompressor().decompressobj()
        data = unzst.decompress(data)
    assert hashlib.sha256(data).hexdigest() == row["sha256"]
    meta = xdr.LedgerCloseMeta.from_xdr_bytes(data)
    assert meta.to_xdr_bytes() == data
```

```bash
pip install stellar-sdk==17.0.1 zstandard pytest
pytest -q
```

From an empty folder, on Python 3.13.13, fetching included:

A real run of `pytest -q`, recorded 24 Nov 2026:

```text
................................................................ [ 10%]
................................................................ [ 20%]
................................................................ [ 30%]
................................................................ [ 40%]
................................................................ [ 50%]
................................................................ [ 60%]
................................................................ [ 70%]
................................................................ [ 80%]
................................................................ [ 90%]
..........................................................       [100%]
634 passed in 77.17s (0:01:17)
```

</Tab>
</Tabs>

</Step>
<Step>

### Go further

A byte round trip is the floor. Each entry also lists the **facts** a correct reader must find (`expected.facts` in its `entry.json`, at a JSON Pointer path in the SEP-0051 rendering), and some list SDK checks (`expected.sdk_checks`). [Conformance](/docs/tools/conformance) runs all of them, through the same bytes, in every build.

</Step>
</Steps>

<Callout title="Depth">
The deepest valid ledgers in the corpus need more than 500 levels of XDR nesting. js-stellar-sdk 17.4.0, go-stellar-sdk v0.9.0 and py-stellar-base 17.0.1 read all of them with their defaults. rs-stellar-xdr has no default, so pick a limit (1500 above). `@stellar/stellar-xdr-json` 30.0.0 refuses 13 of them: [F-1](/docs/findings/reported).
</Callout>

## Coming in the grant

<Callout type="warn" title="Planned, not published yet">
These packages are what the grant funds. None exists today; the usage below shows the plan, and names and syntax may change at release.

**Tranche 1, by 26 January 2027:** `xdrproof` on npm, the command-line tool (`verify`, `coverage`, `conformance`, `replay`, `guide check` and `check`), and `@xdrproof/corpus`, the corpus with `loadEntries({ hazards, caps, protocol })` and Vitest and Jest helpers.

**Tranche 2, by 9 March 2027:** the GitHub Action `XDRProof/action`, which runs `xdrproof check` against a pinned corpus in your CI and uploads SARIF to code scanning; a Go module with the corpus embedded and a table-test helper; and a Rust crate that loads a corpus release.
</Callout>

<PlannedHelp />

```bash
npx xdrproof check                                # planned, Tranche 1
```

```js
import { loadEntries } from "@xdrproof/corpus"   // planned, Tranche 1
const entries = loadEntries({ caps: ["CAP-0067"] })
```

```yaml
- uses: XDRProof/action@v1                        # planned, Tranche 2
```

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
