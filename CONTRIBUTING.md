# Contributing to XDRProof

Thanks for helping. XDRProof is a test kit for code that reads Stellar ledgers. The most useful contributions are a
ledger that broke your code, an expected value you think is wrong, and fixes.

## Reporting

- **Something in XDRProof is wrong:** open an issue with the "Something in XDRProof is wrong" form.
- **A ledger broke your SDK or indexer:** open an issue with its network and sequence number, and what went wrong. We'd
  like to add it to the corpus.
- **A bug XDRProof found in another project:** that belongs to the other project. [`findings/policy.md`](findings/policy.md)
  says how we report those.
- **Anything that lets someone halt or crash an indexer, an SDK or stellar-core:** report it privately, as
  [`SECURITY.md`](SECURITY.md) describes. Don't open a public issue.

## How changes land

`main` only changes through pull requests. Nobody pushes to it directly, the maintainer included.

1. Branch from `main`, make the change, and open a pull request. The template asks what changed, why, and how it was
   checked.
2. CI must pass: the `check` workflow's two jobs, `verify and novelty` and `linter self-test`. The branch must be up to
   date with `main`.
3. Pull requests are squash-merged, and the branch is deleted after.

## Running the checks yourself

| Command | What it checks |
|---|---|
| `make verify` | Schema, hashes, the round trip of every variant, every expected fact, the mined ledgers |
| `make novelty` | No entry is redundant |
| `make lint-selftest` | xplint catches every seeded violation and mutant, and flags no good case |
| `node tools/upstream-table.mjs --check` | The upstream table in the README matches `findings/upstream.json` |

The longer runs (`make conformance`, `make replay`) need Docker; the [README](README.md) explains them.

## Licence

Contributions are made under the repository's licence, [Apache-2.0](LICENSE).
