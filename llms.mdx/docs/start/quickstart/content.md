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
make oracle          # facts confirmed by core and the walker
make coverage        # the union arms the corpus reaches
make coverage-report # every arm reached, or classified
make novelty         # no entry is redundant
make generate        # rebuild every generated variant, twice
make order-scan      # which ledgers vary in change order
make conformance     # the corpus and vectors through the SDKs
make replay          # the corpus into wallet-backend, every fix
make lint-selftest   # the linter's seeded violations and mutants
make lint            # the linter on real indexer code
```

Each target has its own page under [Tools](/docs/tools). `make all` runs verify, oracle, coverage, generate, conformance, replay, lint-selftest and lint.

</Step>
</Steps>

<Callout title="Testing your own SDK or indexer?">
The steps above run XDRProof's own checks. To run the corpus in **your** test suite, lint **your** Go indexer, or replay it into **your** indexer, start at [Use it on your code](/docs/use): a copy-paste test for JavaScript, Go, Rust and Python, and the one-line linter command.
</Callout>
