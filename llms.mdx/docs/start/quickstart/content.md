# Quickstart (/docs/start/quickstart)

**What it is.** The shortest path from nothing to a checked corpus: clone the repository, run one command, read the result.

**Why it matters.** You don't have to trust any number on this site. `make verify` re-checks every entry on your own machine in seconds.

<Steps>
<Step>

### Get the code

```bash
git clone https://github.com/XDRProof/xdrproof
cd xdrproof
```

</Step>
<Step>

### Check what you have

| Target | Needs |
|---|---|
| `make verify` | Node ≥ 22.15 and Rust (cargo) |
| `make coverage` | Python 3 and Node ≥ 22.15 (`coverage-goldens` also needs git and the network) |
| `make coverage-report`, `make novelty`, `make build` | Node ≥ 22.15, npm and Rust (cargo) |
| `make oracle` | Docker, Node ≥ 22.15, npm |
| `make generate`, `make generate-quick`, `make order-scan` | Docker, Node ≥ 22.15, npm, curl, jq, perl |
| `make conformance` | Node, Rust, Docker |
| `make replay` | Docker, Node ≥ 22.15, Rust, git; the network on the first run only |
| `make lint-selftest`, `make lint` | Docker (a pinned Go image); `make lint` also Node ≥ 22.15 and git |

</Step>
<Step>

### Verify the corpus

```bash
make verify
```

The first run installs the tool dependencies (`npm ci`) and builds the native reader (`cargo build --release`), about a minute. Then it checks:

- every SEP-0023 strkey test vector;
- every entry against the schema, and its hazards against the registry;
- size and sha256;
- a decode and re-encode through **native rs-stellar-xdr 30.0.0** that must reproduce identical bytes;
- that the focus transaction is in the ledger;
- every expected fact;
- that the WASM build `@stellar/stellar-xdr-json`, wherever it can decode, renders the same JSON;
- that `manifest.json` is current;
- every [mined ledger](/docs/corpus/mined) and its findings.

</Step>
<Step>

### Go further

```bash
make oracle        # facts confirmed by stellar-core's own decoder and the schema walker
make coverage      # how many XDR union arms the entries and mined ledgers reach
make coverage-report  # every arm reached by an entry, or classified with a core source line
make novelty       # no entry is redundant
make generate      # rebuild every generated variant from scratch, twice
make order-scan    # which ledgers vary in change order
make conformance   # every corpus variant and vector through the SDK builds
make replay        # the whole corpus into wallet-backend, and every fix before and after
make lint-selftest # the linter against its seeded violations and mutants
make lint          # the linter on wallet-backend, stellar-etl and go-stellar-sdk
```

Each target has its own page under [Tools](/docs/tools). `make all` runs verify, oracle, coverage, generate, conformance, replay, lint-selftest and lint.

</Step>
</Steps>
