# Threat model

Draft, 19 Nov 2026. It states what is in place today, what is planned, and what is still open. Tranche 2 completes it
in SDF's STRIDE template, adding a data-flow diagram, a numbered threat list, verification evidence, and a monitoring
plan (what is watched, what triggers action, who responds and how fast), as SCF asks of every Tranche 2. Report a
problem through [`SECURITY.md`](SECURITY.md).

## What XDRProof runs

- **The corpus:** ledger files with expected values, which teams will use as the right answers.
- **The generator:** a standalone stellar-core (no peers) in Docker. It uses test-only keys committed in the recipes and
  no real funds; its HTTP port is published on the host while it runs.
- **Three readers:** native rs-stellar-xdr, stellar-core's own `dump-xdr`, and a schema walker.
- **The conformance runner:** published SDK packages run as testees. The JavaScript and Rust testees run on the host;
  Python and Go run in containers.
- **The replay harness:** builds a real indexer from its source and runs it in Docker with a PostgreSQL database,
  serving ledgers from a local mock stellar-rpc.
- **The linter:** type-checks and analyses other projects' Go source in a pinned Go container.
- **Hosting:** CI on GitHub Actions; static docs on GitHub Pages.

Releases, npm packages and the GitHub Action come with the grant. Nothing runs as a hosted service.

## What we protect

| Asset | Why it matters |
|---|---|
| Corpus bytes and expected values | Teams use them as ground truth. A wrong value makes a correct reader look broken, or hides a real bug. |
| Pinned expectations and verdicts (`conformance/expectations/`, `replay/expectations/`, `linter/expectations.json`) | They decide whether a run is green. Tampering would hide a regression. |
| Users' machines and CI | The tools, and later the Action, run there. |
| Maintainer accounts | GitHub, npm (later), and the xdrproof.dev domain. |
| Embargoed findings | Details of halts or crashes not yet fixed upstream. |
| Accuracy of upstream reports | A wrong report costs maintainers' time and trust. |

## Trust boundaries

1. **Third-party code we execute:** SDK packages from npm, PyPI, crates.io and the Go proxy; indexer source from GitHub; the stellar-core and toolchain images.
2. **Imported data:** ledgers mined from SDF's public data lake.
3. **Contributions:** pull requests to this repository.
4. **CI:** GitHub-hosted runners and third-party actions.
5. **Distribution:** GitHub, GitHub Pages and DNS; later npm, the Go proxy and crates.io.

## Threats

| ID | Threat | In place today | Planned |
|---|---|---|---|
| T1 | A wrong or tampered corpus entry or expected value | Every variant carries its sha256. `make verify` round-trips every variant through the native reader and checks every fact at its exact field; CI runs it on every push to `main` and every pull request. `make oracle` finds each value-checkable fact in stellar-core's own decoding and with an independent walker. In the last recorded run, all 51 expected 64-bit values, each changed in its last digit, were rejected by both readers. Generated entries are rebuilt from recipes. | Make the oracle's planted-value check require every value to be caught; run the oracle in CI; signed release tags and build attestations (T2) |
| T2 | Tampered expectations hiding a regression | Expectations are written from a measured run and reviewed by hand. A full replay checks a hash of the judged set, so a silently dropped variant fails the run (partial runs skip this check). | Required review on changes to `expectations/` |
| T3 | Supply chain: a compromised SDK package, toolchain image or action | Exact versions for every testee: JavaScript and Rust have committed lockfiles; Python pins exact versions (without artifact hashes); Go resolves pinned module versions at build time, with no committed lock. The stellar-core, Go toolchain and testee images are pinned by digest. Actions are pinned by commit SHA. The workflow token is read-only, and the repository has no CI secrets. GitHub's dependency graph and Dependabot alerts are on. Their first scan (19 Nov) flagged two old pins in the generator's test contract (`recipes/soroban/contract/Cargo.lock`, `soroban-sdk =25.3.0`): GHSA-x57h-xx53-v53w (medium, `stellar-xdr` ≤ 25.0.0) and GHSA-pm4j-7r4q-ccg8 (low, `soroban-env-host` < 26.0.0). That contract runs only inside the standalone generator and is never shipped; its compiled bytes are part of existing corpus ledgers, so it stays pinned. A new contract version would go out as a new recipe. Both alerts are dismissed as "not used", with this reason attached. | Hash-pinned Python installs; committed Go lock files; a review on every pin change |
| T4 | Indexer code under test misbehaving during replay | Each session runs in its own container, with a memory and swap limit, read-only mounts for the source and binary, and no secrets passed in. A process that dies or stops advancing ends its session with a verdict (crashed, or halted after one retry). | An internal network per session; a separate database per session with authentication |
| T5 | Hostile or extreme XDR crashing our own tools | The native reader decodes with a depth limit (1,500) and a 256 MiB size limit. Invalid-input vectors run in conformance (truncated values, trailing bytes, oversized lengths). | A memory gate for the replay in CI (T1); request-size limits in the mock RPC |
| T6 | Leaking an embargoed finding | [`findings/policy.md`](findings/policy.md): reported privately first, and nothing in the public repository until a fix ships or 90 days pass. | — |
| T7 | Secrets in the repository or its history | The repository needs no secrets. A `gitleaks` scan of the full history is clean. `.gitleaks.toml` allowlists three files of public test data by path (SEP-0023 vectors, strkey vectors, mined ledger index). GitHub secret scanning and push protection are on (no open alerts on 19 Nov). | — |
| T8 | Release tampering or look-alike packages | — | npm trusted publishing (no long-lived tokens) with provenance; the scoped `@xdrproof/` name; checksums and attestations on every release (T1–T2) |
| T9 | A wrong upstream report | Each report quotes only output that was run, says exactly what was measured, and comes with a one-command reproduction. So far each one was reviewed by a second reviewer and approved by the maintainer before posting; when an overstatement was found later, the posted text was corrected. | — |
| T10 | Account takeover (GitHub, npm, domain) | — | Two-factor authentication on every account, confirmed in the Tranche 2 monitoring plan |
| T11 | Expensive or abusive CI runs | Job timeouts. Only the fast checks run on pull requests. | Heavy workflows only on `main`, nightly or by label (T2) |
| T12 | Third-party code reaching the host or the repository | Testee and linter versions are pinned. | Run the JavaScript and Rust testees in containers with a clean environment; mount the repository read-only for the linter, apart from its work directory |

## Open risks

- **Replay sessions are not isolated from each other or from the network.** Sessions share one Docker network and one
  PostgreSQL server with trust authentication, and outbound traffic is not blocked. A malicious indexer revision could
  read or change another session's data, which would corrupt its verdicts, or reach the internet. Today we only build
  pinned revisions of SDF's wallet-backend. Planned: T4 above.
- **The mock RPC listens on all interfaces** (`0.0.0.0`, a random port) during a session, and doesn't limit request
  size. Another machine on the local network could query it or exhaust its memory for that session. It serves only
  public ledger data. Planned: bind it to the Docker bridge address and cap request size.
- **JavaScript and Rust testees run on the host** with the user's environment, and **the linter mounts the
  repository writable**. A compromised pinned package could read the environment or write to the checkout.
  Planned: T12.
- **An out-of-memory kill is recorded without its peak.** The indexer's peak memory is read while it runs, so a killed
  container leaves only its verdict. Planned: read the peak from the kill event.
- **One maintainer.** Private vulnerability reporting is on, but there is no backup responder for security reports. Everything is reproducible from a clone, with no
  service in the path, and a maintenance runbook comes in Tranche 3.
- **Generated shapes** come from a standalone stellar-core, some with raised Soroban test limits. Each entry records its
  source and emitter flags, so no ledger is presented as public-network history unless it was mined from it.
