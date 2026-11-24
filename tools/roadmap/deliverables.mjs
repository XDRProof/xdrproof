// The 13 deliverables of the SCF #46 proposal, as their roadmap issues show them (format "R1 + R3", chosen 24 Nov
// 2026): the facts, a diagram of how the parts fit, what ships, the parts as future sub-issues, "done when" in the
// proposal's own words, what is not included, and what exists today. Budgets stay in the proposal, not in issues.
//
// Planned weeks come from each deliverable's days in the proposal (six days a week, one developer), in this order:
// Tranche 1: 1 guide, 2 per-CAP and goldens, 3 npm, 4 memory gate. Tranche 2: 5 CI, 6 Action, 7 stellar-etl,
// 8 Go and Rust. Tranche 3: 10 SDK runners, 11 Horizon, 9 guide v1.0, 12 docs, 13 v1.0 and drill.
//
// Diagram nodes: col 0, 1 or 2; kind 'ships' (in this deliverable), 'there' (already in XDRProof, or from an earlier
// deliverable) or 'outside' (someone else's code, people, or upstream). Edges join neighbouring columns, or two
// neighbouring boxes in one column (a short vertical arrow).

export const TRANCHES = {
  1: { name: '1: MVP', weeks: '1–6', due: '26 January 2027', short: '26 Jan 2027' },
  2: { name: '2: Testnet', weeks: '7–12', due: '9 March 2027', short: '9 Mar 2027' },
  3: { name: '3: Mainnet, v1.0', weeks: '13–20', due: '4 May 2027', short: '4 May 2027' },
};

export const DELIVERABLES = [
  {
    n: 1, tranche: 1, weeks: '1–3', name: 'Indexer-hardening guide, draft v0.9, sent for expert review', short: 'guide draft v0.9',
    summary: 'A guide for teams whose code reads Stellar ledgers: one section per hazard layer (eight), each saying what can go wrong, what to check, and which corpus entries test it. A tool keeps it honest: `xdrproof guide check` fails when a hazard has no section or a section cites an entry that does not exist.',
    diagram: {
      nodes: [
        { id: 'reg', col: 0, kind: 'there', title: 'Hazard registry', sub: '78 hazards · 8 layers' },
        { id: 'core', col: 0, kind: 'outside', title: 'stellar-core', sub: 'its validation code' },
        { id: 'corpus', col: 0, kind: 'there', title: 'Corpus entries', sub: 'what the guide cites' },
        { id: 'table', col: 1, kind: 'ships', title: 'Field table, checklist', sub: 'generated, with sources' },
        { id: 'guide', col: 1, kind: 'ships', title: 'Guide draft v0.9', sub: 'one section per layer' },
        { id: 'check', col: 1, kind: 'ships', title: 'xdrproof guide check', sub: 'fails on a gap, in CI' },
        { id: 'review', col: 2, kind: 'outside', title: 'Expert review', sub: 'a core or platform engineer' },
        { id: 'teams', col: 2, kind: 'outside', title: 'Indexer and SDK teams', sub: 'read and apply it' },
      ],
      edges: [['reg', 'table'], ['core', 'table'], ['corpus', 'check'], ['table', 'guide'], ['check', 'guide'], ['guide', 'review'], ['guide', 'teams']],
    },
    ships: [
      'The guide draft v0.9: one section per hazard layer (eight)',
      'The validated-versus-unvalidated field table and the language-neutral checklist, generated from the hazard registry and stellar-core\'s validation code, with source lines and protocol versions',
      '`xdrproof guide check`, which fails when a hazard has no section or a section cites a missing entry',
      'A dated review request to a core or platform engineer',
    ],
    parts: [
      ['Field table and checklist', 'Generated from the registry and stellar-core\'s validation code, with source lines', 'weeks 1–2'],
      ['The eight sections', 'One per hazard layer, citing the corpus entries that test it', 'weeks 1–3'],
      ['`guide check`', 'Fails on a hazard without a section or a missing entry; runs in CI', 'week 3'],
      ['Review request', 'Sent, dated and linked here', 'week 3'],
    ],
    done: 'The draft and its generated field table are in the repository, labelled unpublished pending expert review; `guide check` passes in CI; a dated review request to a core or platform engineer is linked.',
    notIn: ['The reviewed guide v1.0 and its publication: Deliverable 9, Tranche 3'],
    today: 'The hazard registry (78 hazards in 8 layers, `caps/registry.json`) and the corpus entries the guide will cite exist today. The guide itself does not yet.',
  },
  {
    n: 2, tranche: 1, weeks: '3–4', name: 'Per-CAP coverage and golden agreement', short: 'per-CAP coverage and goldens',
    summary: 'Two reports. One maps every CAP to the corpus entries, protocols and shapes that cover it, and to its gaps. The other runs stellar-core\'s own golden ledgers through `--check-lcm` at a pinned revision and compares their decoded fields and values with the corpus, for the shapes both hold.',
    diagram: {
      nodes: [
        { id: 'caps', col: 0, kind: 'there', title: 'CAP registry', sub: 'caps/registry.json' },
        { id: 'corpus', col: 0, kind: 'there', title: 'Corpus', sub: '264 entries, 635 variants' },
        { id: 'gold', col: 0, kind: 'outside', title: 'Core golden ledgers', sub: 'at a pinned revision' },
        { id: 'percap', col: 1, kind: 'ships', title: 'Per-CAP report', sub: 'entries, shapes and gaps' },
        { id: 'cmp', col: 1, kind: 'ships', title: 'Golden comparison', sub: 'matched · divergent · unmatched' },
        { id: 'gate', col: 2, kind: 'ships', title: 'CI gate', sub: 'fails on any divergence' },
      ],
      edges: [['caps', 'percap'], ['corpus', 'percap'], ['corpus', 'cmp'], ['gold', 'cmp'], ['percap', 'gate'], ['cmp', 'gate']],
    },
    ships: [
      'A generated manifest of every CAP to its entries, protocols, covered shapes and gaps',
      'At a pinned stellar-core revision, `--check-lcm` on its golden files, and a comparison of decoded field paths and values for the shapes the corpus shares with them',
      'The matched, divergent and unmatched counts, with fixture IDs',
      'A CI check that fails on any divergence or unclassified arm',
    ],
    parts: [
      ['Per-CAP manifest', 'Every CAP to its entries, protocols, shapes and gaps', 'week 3'],
      ['`--check-lcm` on the goldens', 'stellar-core\'s golden files, at a pinned revision', 'weeks 3–4'],
      ['Field and value comparison', 'Matched, divergent and unmatched counts, with fixture IDs', 'week 4'],
      ['CI gate', 'Fails on a divergence or an unclassified arm', 'week 4'],
    ],
    done: 'The per-CAP report, the golden comparison report, the pinned core revision and the CI run.',
    notIn: ['The rest of the CI workflows: Deliverable 5, Tranche 2'],
    today: '`make coverage-goldens` already measures which union arms stellar-core\'s golden files reach (254 of 499), and `make coverage-report` accounts for every arm (418 reached by an entry, 81 classified). Neither compares values yet.',
  },
  {
    n: 3, tranche: 1, weeks: '4–6', name: 'npm release of the xdrproof CLI and @xdrproof/corpus', short: 'npm release',
    summary: 'Puts XDRProof on npm, so a team can test its code against the corpus without cloning this repository.',
    diagram: {
      nodes: [
        { id: 'tar', col: 0, kind: 'ships', title: 'Corpus v0.9', sub: 'tarball + SHA256SUMS' },
        { id: 'pkg', col: 1, kind: 'ships', title: '@xdrproof/corpus', sub: 'loadEntries(filters)' },
        { id: 'cli', col: 1, kind: 'ships', title: 'xdrproof CLI', sub: 'verify · conformance · replay' },
        { id: 'test', col: 2, kind: 'outside', title: 'Your Vitest or Jest test', sub: 'in your repo' },
        { id: 'sdk', col: 2, kind: 'outside', title: 'Your SDK or indexer', sub: 'through an adapter or testee' },
      ],
      edges: [['tar', 'pkg'], ['tar', 'cli'], ['pkg', 'test'], ['cli', 'sdk']],
    },
    ships: [
      '`xdrproof`, the command-line tool: `verify`, `coverage`, `conformance`, `replay`, `guide check`, `check`',
      '`@xdrproof/corpus`: the corpus with `loadEntries({hazards, caps, protocol})`, Vitest and Jest helpers and an example test',
      'Corpus v0.9, published as a tarball with `SHA256SUMS`',
    ],
    parts: [
      ['The CLI', 'Every command, in the look the make targets use today', 'weeks 4–5'],
      ['`@xdrproof/corpus`', '`loadEntries` and its filters', 'week 5'],
      ['Test helpers', 'Vitest and Jest helpers, and the example test', 'week 6'],
      ['Release', 'The v0.9 tarball and `SHA256SUMS`; both packages on npm', 'week 6'],
    ],
    done: 'Both packages on npm; the example test passes in a fresh project.',
    notIn: ['The Go module and the Rust crate: Deliverable 8, Tranche 2', 'The GitHub Action: Deliverable 6, Tranche 2'],
    today: 'Four of these already run from a clone, as `make verify`, `make coverage`, `make conformance` and `make replay`, each with a recorded run on xdrproof.dev. `check`, one command that runs every check, is new here, and `guide check` comes with the guide (Deliverable 1).',
  },
  {
    n: 4, tranche: 1, weeks: '6', name: 'Replay memory gate', short: 'replay memory gate',
    summary: 'The full-corpus replay runs in CI with a stated memory budget for the harness and one for the indexer, and fails when either is exceeded.',
    diagram: {
      nodes: [
        { id: 'corpus', col: 0, kind: 'there', title: 'Corpus', sub: '635 ledger variants' },
        { id: 'harness', col: 0, kind: 'there', title: 'Replay harness', sub: 'one session per ledger' },
        { id: 'wb', col: 0, kind: 'outside', title: 'wallet-backend', sub: 'a pinned revision' },
        { id: 'ci', col: 1, kind: 'ships', title: 'Replay in CI', sub: 'the whole corpus' },
        { id: 'budget', col: 1, kind: 'ships', title: 'Memory budgets', sub: 'harness · indexer' },
        { id: 'gate', col: 2, kind: 'ships', title: 'The gate', sub: 'fails over budget' },
      ],
      edges: [['corpus', 'ci'], ['harness', 'ci'], ['wb', 'ci'], ['ci', 'gate'], ['budget', 'gate']],
    },
    ships: [
      'The full-corpus replay as a CI job',
      'A stated memory budget for the harness and one for the indexer, from measured peaks',
      'A gate that fails the run when either budget is exceeded',
    ],
    parts: [
      ['Replay in CI', 'The whole corpus into wallet-backend, as a CI job', 'week 6'],
      ['Budgets', 'One for the harness, one for the indexer, from measured peaks', 'week 6'],
      ['The gate', 'Fails when either is exceeded, shown failing on a budget set too low', 'week 6'],
    ],
    done: 'A CI run that shows the gate and the measured peaks.',
    notIn: ['Sharding the replay across CI jobs: Deliverable 5, Tranche 2'],
    today: '`make replay` measures both locally: on 24 Nov 2026 the harness peaked at 124 MiB for the whole corpus and wallet-backend at 101 MiB in any session. Nothing fails on them yet.',
  },
  {
    n: 5, tranche: 2, weeks: '7–8', name: 'CI workflows, threat model and monitoring plan', short: 'CI, threat model, monitoring',
    summary: 'Everything that runs on a laptop today runs in CI, plus what keeps the kit current and safe: an upstream watch that opens a pull request when stellar-xdr, stellar-core or an SDK tags a release, a release workflow, a threat model and a monitoring plan. XDRProof has no contracts, so its monitors are off-chain.',
    diagram: {
      nodes: [
        { id: 'up', col: 0, kind: 'outside', title: 'Upstream releases', sub: 'stellar-xdr · core · SDKs' },
        { id: 'push', col: 0, kind: 'outside', title: 'Every push and PR', sub: 'to this repository' },
        { id: 'watch', col: 1, kind: 'ships', title: 'Upstream watch', sub: 'opens a PR; SDK-pin check' },
        { id: 'checks', col: 1, kind: 'ships', title: 'Check workflows', sub: 'verify · conformance · replay' },
        { id: 'tm', col: 2, kind: 'ships', title: 'Threat model, monitoring', sub: 'SDF templates' },
        { id: 'release', col: 2, kind: 'ships', title: 'Release workflow', sub: 'SHA256SUMS · attestation' },
      ],
      edges: [['up', 'watch'], ['push', 'checks'], ['watch', 'checks'], ['checks', 'release'], ['watch', 'tm']],
    },
    ships: [
      'Check (verify, oracle, novelty, coverage gate, linter self-test), conformance, replay (sharded, with the memory gate), determinism and golden agreement workflows',
      'An upstream watch that opens a pull request when stellar-xdr, stellar-core or an SDK tags a release, with an SDK-pin check (`sdk-support.json`: which SDK releases read every corpus variant)',
      'A release workflow: tarball, `SHA256SUMS`, build attestation, npm provenance',
      'Actions pinned by SHA, with read-only permissions',
      'A threat model in SDF\'s STRIDE template and a monitoring plan in SDF\'s monitoring template for builders. XDRProof has no contracts, so the monitors are off-chain: upstream stellar-xdr, stellar-core and SDK releases, the corpus and replay CI, and release integrity',
    ],
    parts: [
      ['Check and conformance workflows', 'verify, oracle, novelty, coverage gate, linter self-test, conformance, determinism, goldens', 'week 7'],
      ['Sharded replay', 'The whole corpus across CI jobs, with the memory gate', 'weeks 7–8'],
      ['Upstream watch', 'A PR on each upstream release, and the SDK-pin table', 'week 8'],
      ['Release workflow', 'Tarball, `SHA256SUMS`, attestation, npm provenance', 'week 8'],
      ['Threat model and monitoring plan', 'In SDF\'s templates, with off-chain monitors', 'week 8'],
    ],
    done: 'Green workflow runs; the SDK-pin table published; `THREAT-MODEL.md` and the monitoring plan in the repository; and a pull request the upstream watch opens from a pinned release-event fixture (a real upstream release\'s pull request is linked as well when one occurs). The linter job runs on the then-current wallet-backend revision, unmodified, and the report lists each remaining finding with its upstream status; a patched fork is never presented as a clean upstream run.',
    notIn: ['Running XDRProof in other projects\' CI: Deliverable 6'],
    today: '`check.yml` already runs `make verify`, `make novelty`, the linter self-test and the bug-table check on every push to `main` and every pull request. A first `THREAT-MODEL.md` is in the repository; the final one, in SDF\'s template, comes here.',
  },
  {
    n: 6, tranche: 2, weeks: '8–9', name: 'GitHub Action', short: 'GitHub Action',
    summary: '`XDRProof/action` runs `xdrproof check` against a pinned corpus in another project\'s CI and uploads its findings to GitHub code scanning (SARIF). A pre-commit hook and a golangci-lint plugin run the linter on a developer\'s machine.',
    diagram: {
      nodes: [
        { id: 'corpus', col: 0, kind: 'there', title: 'Pinned corpus', sub: 'a release with checksums' },
        { id: 'repo', col: 0, kind: 'outside', title: 'Your repository', sub: 'a push or pull request' },
        { id: 'action', col: 1, kind: 'ships', title: 'XDRProof/action', sub: 'runs xdrproof check' },
        { id: 'hooks', col: 1, kind: 'ships', title: 'Local hooks', sub: 'pre-commit · golangci-lint' },
        { id: 'sarif', col: 2, kind: 'outside', title: 'Code scanning', sub: 'findings as SARIF' },
        { id: 'demo', col: 2, kind: 'ships', title: 'Demo repository', sub: 'fails before a fix, then passes' },
      ],
      edges: [['repo', 'action'], ['corpus', 'action'], ['repo', 'hooks'], ['action', 'sarif'], ['action', 'demo']],
    },
    ships: [
      '`XDRProof/action`: runs `xdrproof check` against a pinned corpus in another project\'s CI and uploads SARIF to code scanning',
      'A demo repository where it fails on a wallet-backend commit before an upstream fix and passes after',
      'A pre-commit hook and a golangci-lint plugin that run the linter locally',
    ],
    parts: [
      ['The Action', '`xdrproof check` against a pinned corpus, with the SARIF upload', 'weeks 8–9'],
      ['Demo repository', 'Fails on a wallet-backend commit before an upstream fix, passes after', 'week 9'],
      ['Local hooks', 'A pre-commit hook and a golangci-lint plugin', 'week 9'],
    ],
    done: 'The Action\'s repository and the demo\'s workflow runs.',
    notIn: ['The CI workflows of this repository: Deliverable 5'],
    today: 'xplint, the linter for Go indexer source, runs here with `make lint`, and its self-test with `make lint-selftest`. Nothing runs in other projects\' CI yet.',
  },
  {
    n: 7, tranche: 2, weeks: '9–11', name: 'stellar-etl replay adapter', short: 'stellar-etl adapter',
    summary: 'stellar-etl joins the replay harness as the second indexer: its exports for each corpus ledger are judged against the ledger\'s meta, with the same probes and verdicts as wallet-backend. Every result that is not "handled" is triaged, and new bugs are reported upstream.',
    diagram: {
      nodes: [
        { id: 'harness', col: 0, kind: 'there', title: 'Replay harness', sub: 'probes and verdicts' },
        { id: 'corpus', col: 0, kind: 'there', title: 'Corpus', sub: '635 ledger variants' },
        { id: 'adapter', col: 1, kind: 'ships', title: 'stellar-etl adapter', sub: 'its exports, judged' },
        { id: 'run', col: 1, kind: 'ships', title: 'Full-corpus run', sub: 'non-handled ones triaged' },
        { id: 'table', col: 2, kind: 'ships', title: 'Verdict table', sub: 'recorded, in the repo' },
        { id: 'up', col: 2, kind: 'outside', title: 'Upstream reports', sub: 'new bugs, to stellar-etl' },
      ],
      edges: [['harness', 'adapter'], ['corpus', 'run'], ['adapter', 'run'], ['run', 'table'], ['run', 'up']],
    },
    ships: [
      'A stellar-etl adapter for the replay harness',
      'The full-corpus run, with every verdict recorded',
      'Every result that is not "handled", triaged; new bugs reported upstream',
    ],
    parts: [
      ['The adapter', 'stellar-etl fed each corpus ledger', 'weeks 9–10'],
      ['Probes for its exports', 'The same probes and verdicts as wallet-backend', 'week 10'],
      ['Full-corpus run', 'Recorded verdicts, every non-handled one triaged', 'weeks 10–11'],
      ['Reports upstream', 'New bugs filed in stellar-etl', 'week 11'],
    ],
    done: '`make replay` covers stellar-etl, with recorded verdicts and linked reports.',
    notIn: ['Horizon: Deliverable 11, Tranche 3'],
    today: '`make replay` runs the whole corpus into wallet-backend: 618 of 635 variants handled, every other result pinned with its cause. xplint already checks stellar-etl\'s source (`make lint`).',
  },
  {
    n: 8, tranche: 2, weeks: '11–12', name: 'Go and Rust packages', short: 'Go and Rust packages',
    summary: 'The corpus as a Go module, embedded with a table-test helper, and as a Rust crate that loads a corpus release. Each has a runnable example.',
    diagram: {
      nodes: [
        { id: 'rel', col: 0, kind: 'there', title: 'Corpus release', sub: 'tarball + SHA256SUMS' },
        { id: 'go', col: 1, kind: 'ships', title: 'Go module', sub: 'corpus embedded, table tests' },
        { id: 'rs', col: 1, kind: 'ships', title: 'Rust crate', sub: 'loads a corpus release' },
        { id: 'got', col: 2, kind: 'outside', title: 'Your Go tests', sub: 'go test' },
        { id: 'rst', col: 2, kind: 'outside', title: 'Your Rust tests', sub: 'cargo test' },
      ],
      edges: [['rel', 'go'], ['rel', 'rs'], ['go', 'got'], ['rs', 'rst']],
    },
    ships: [
      'A Go module with the corpus embedded and a table-test helper',
      'A Rust crate that loads a corpus release',
      'A runnable example for each, run in CI',
    ],
    parts: [
      ['Go module', 'The corpus embedded, with a table-test helper', 'weeks 11–12'],
      ['Rust crate', 'Loads a corpus release', 'week 12'],
      ['Examples', 'One for each, passing in CI', 'week 12'],
    ],
    done: 'pkg.go.dev and crates.io pages; the examples pass in CI.',
    notIn: ['The npm packages: Deliverable 3, Tranche 1'],
    today: 'The docs already give a copy-paste Go and Rust test that reads the corpus at a pinned commit, with no clone. A package makes that one import.',
  },
  {
    n: 9, tranche: 3, weeks: '16–17', name: 'Reviewed guide v1.0', short: 'reviewed guide v1.0',
    summary: 'The guide draft from Deliverable 1, after an expert\'s review: the review is incorporated and recorded before publication, and the guide is published on xdrproof.dev, with an export ready to offer to developers.stellar.org.',
    diagram: {
      nodes: [
        { id: 'draft', col: 0, kind: 'there', title: 'Guide draft v0.9', sub: 'from Deliverable 1' },
        { id: 'review', col: 0, kind: 'outside', title: 'Expert review', sub: 'a core or platform engineer' },
        { id: 'v1', col: 1, kind: 'ships', title: 'Guide v1.0', sub: 'review incorporated' },
        { id: 'resp', col: 1, kind: 'ships', title: 'Responses', sub: 'to every review comment' },
        { id: 'site', col: 2, kind: 'ships', title: 'On xdrproof.dev', sub: 'published' },
        { id: 'export', col: 2, kind: 'ships', title: 'Export', sub: 'for developers.stellar.org' },
      ],
      edges: [['draft', 'v1'], ['review', 'resp'], ['resp', 'v1'], ['v1', 'site'], ['v1', 'export']],
    },
    ships: [
      'The expert\'s review, incorporated and recorded before publication, with a response to each comment',
      'The guide v1.0 published on xdrproof.dev',
      'An export ready to offer to developers.stellar.org',
    ],
    parts: [
      ['Responses to the review', 'One for each comment, recorded', 'weeks 16–17'],
      ['Guide v1.0', 'Published on xdrproof.dev', 'week 17'],
      ['Export', 'Ready to offer to developers.stellar.org', 'week 17'],
    ],
    done: 'The review, the responses to its comments, the published guide and the export, linked.',
    notIn: ['Publishing on developers.stellar.org itself: that is SDF\'s call; we offer the export'],
    today: 'Nothing yet: the draft comes in Deliverable 1.',
  },
  {
    n: 10, tranche: 3, weeks: '13–15', name: 'Conformance runners for the other official SDKs', short: 'five more SDK runners',
    summary: 'Testees for the Java, Swift (iOS and macOS), Flutter/Dart, PHP and .NET SDKs, run over the whole corpus, with every difference pinned in the expectations and new bugs reported upstream. When one SDK breaks on an entry, the same entry runs through every other SDK, and a sibling issue is filed in each one it also breaks, as the RFP asks.',
    diagram: {
      nodes: [
        { id: 'corpus', col: 0, kind: 'there', title: 'Corpus and vectors', sub: '635 variants, strkeys, depth' },
        { id: 'runner', col: 0, kind: 'there', title: 'Conformance runner', sub: '6 SDK builds today' },
        { id: 'testees', col: 1, kind: 'ships', title: 'Five new testees', sub: 'Java · Swift · Dart · PHP · .NET' },
        { id: 'exp', col: 2, kind: 'ships', title: 'Expectations', sub: 'every result, with its reason' },
        { id: 'sib', col: 2, kind: 'outside', title: 'Sibling issues', sub: 'in each SDK that breaks' },
      ],
      edges: [['corpus', 'testees'], ['runner', 'testees'], ['testees', 'exp'], ['testees', 'sib']],
    },
    ships: [
      'Testees for the Java, Swift (iOS and macOS), Flutter/Dart, PHP and .NET SDKs, over the whole corpus',
      'Every difference pinned in the expectations; new bugs reported upstream',
      'The sibling sweep: an entry that breaks one SDK runs through every other, with an issue in each it also breaks',
    ],
    parts: [
      ['Java and PHP testees', 'java-stellar-sdk and stellar-php-sdk', 'weeks 13–14'],
      ['Swift testee', 'iOS and macOS', 'week 14'],
      ['Flutter/Dart testee', 'The Flutter SDK', 'weeks 14–15'],
      ['.NET testee', 'The .NET SDK', 'week 15'],
      ['Sibling sweep and reports', 'Issues filed in each SDK an entry also breaks', 'week 15'],
    ],
    done: '`make conformance` shows the five new columns, where every variant gets a recorded pass, known divergence or unsupported result with its reason; reports are linked.',
    notIn: ['Indexers: Deliverables 7 and 11'],
    today: '`make conformance` runs 6 SDK builds over the whole corpus (JavaScript, WebAssembly, Rust, Go, Python). Two sweeps on 19 Nov 2026 already read it with java-stellar-sdk 6.0.0 (13 deep ledgers refused at its default depth) and stellar-php-sdk 1.18.0 (every variant then); those become testees here.',
  },
  {
    n: 11, tranche: 3, weeks: '15–16', name: 'Horizon replay adapter', short: 'Horizon adapter',
    summary: 'SDF\'s Horizon ingestion becomes the third indexer in the replay harness: a pinned revision fed each corpus ledger and judged on what it stores, with the same probes and verdicts. New bugs are filed upstream.',
    diagram: {
      nodes: [
        { id: 'harness', col: 0, kind: 'there', title: 'Replay harness', sub: 'probes and verdicts' },
        { id: 'corpus', col: 0, kind: 'there', title: 'Corpus', sub: '635 ledger variants' },
        { id: 'adapter', col: 1, kind: 'ships', title: 'Horizon adapter', sub: 'a pinned revision' },
        { id: 'run', col: 1, kind: 'ships', title: 'Full-corpus run', sub: 'judged on what it stores' },
        { id: 'table', col: 2, kind: 'ships', title: 'Verdict table', sub: 'with the triage' },
        { id: 'up', col: 2, kind: 'outside', title: 'Upstream reports', sub: 'new bugs, to Horizon' },
      ],
      edges: [['harness', 'adapter'], ['corpus', 'run'], ['adapter', 'run'], ['run', 'table'], ['run', 'up']],
    },
    ships: [
      'A Horizon adapter in `replay/adapters/horizon`, at a pinned revision',
      'Its full-corpus verdict table and the triage',
      'New bugs filed upstream',
    ],
    parts: [
      ['The adapter', 'Horizon at a pinned revision, fed each corpus ledger', 'week 15'],
      ['Probes for what it stores', 'The same probes and verdicts as the other indexers', 'weeks 15–16'],
      ['Full-corpus run', 'Recorded verdicts and the triage', 'week 16'],
      ['Reports upstream', 'New bugs filed', 'week 16'],
    ],
    done: 'The adapter in `replay/adapters/horizon` with recorded verdicts and linked reports.',
    notIn: ['stellar-etl: Deliverable 7, Tranche 2'],
    today: 'Horizon reads ledger changes through go-stellar-sdk\'s `GetChanges()`, which includes `txChangesAfter`, so it is expected not to have the #834 refund bug; this replay settles it.',
  },
  {
    n: 12, tranche: 3, weeks: '17–18', name: 'Documentation site v1.0', short: 'docs site v1.0',
    summary: 'xdrproof.dev at v1.0: a page for every corpus entry, the schema reference, coverage, the adapter and testee guides, the findings and the guide, rebuilt from CI on every release, with a README badge teams can add.',
    diagram: {
      nodes: [
        { id: 'data', col: 0, kind: 'there', title: 'Corpus and reports', sub: 'entries, coverage, findings' },
        { id: 'guide', col: 0, kind: 'there', title: 'Guide v1.0', sub: 'from Deliverable 9' },
        { id: 'guides', col: 1, kind: 'ships', title: 'Adapter, testee guides', sub: 'how to add yours' },
        { id: 'build', col: 1, kind: 'ships', title: 'Docs build in CI', sub: 'on every release' },
        { id: 'site', col: 2, kind: 'ships', title: 'xdrproof.dev v1.0', sub: 'a page per entry' },
        { id: 'badge', col: 2, kind: 'outside', title: 'Your README', sub: 'with the badge' },
      ],
      edges: [['data', 'build'], ['guide', 'build'], ['guides', 'site'], ['build', 'site'], ['build', 'badge']],
    },
    ships: [
      'A page for every corpus entry, the schema reference, coverage, the findings and the guide',
      'The adapter and testee guides',
      'Publishing from CI on every release',
      'A README badge teams can add',
    ],
    parts: [
      ['Entry pages and schema', 'Every entry, the schema reference, coverage and findings', 'week 17'],
      ['Adapter and testee guides', 'How to add an indexer or an SDK', 'weeks 17–18'],
      ['Publish from CI', 'Rebuilt on every release', 'week 18'],
      ['README badge', 'One line a team can add', 'week 18'],
    ],
    done: 'The live site, and the CI job that publishes it.',
    notIn: ['The guide\'s content: Deliverables 1 and 9'],
    today: 'xdrproof.dev is live with a page for each of the 264 entries, the schema, coverage, a recorded run of every command, the findings and a guide to replaying your own indexer. It is built and published by hand; v1.0 adds a guide for SDK testees, brings the adapter guide up to date, and adds the badge and publishing from CI.',
  },
  {
    n: 13, tranche: 3, weeks: '19–20', name: 'v1.0 release and upgrade drill', short: 'v1.0 and upgrade drill',
    summary: 'Corpus and tools v1.0, with checksums and attestation, and a drill for the next protocol upgrade: against pinned newer stellar-xdr and stellar-core fixtures, the coverage gate fails, then new entries or justified exclusions close it. An upgrade-readiness report and a public maintenance runbook come with it.',
    diagram: {
      nodes: [
        { id: 'newer', col: 0, kind: 'outside', title: 'Newer stellar-xdr, core', sub: 'pinned fixtures' },
        { id: 'gate', col: 0, kind: 'there', title: 'Coverage gate', sub: 'fails on a new arm' },
        { id: 'drill', col: 1, kind: 'ships', title: 'Upgrade drill', sub: 'the gate fails, then closes' },
        { id: 'ready', col: 1, kind: 'ships', title: 'Readiness report', sub: 'which SDKs read the shapes' },
        { id: 'rel', col: 2, kind: 'ships', title: 'v1.0 release', sub: 'checksums · attestation' },
        { id: 'runbook', col: 2, kind: 'ships', title: 'Maintenance runbook', sub: 'public' },
      ],
      edges: [['newer', 'drill'], ['gate', 'drill'], ['drill', 'ready'], ['drill', 'rel'], ['ready', 'runbook']],
    },
    ships: [
      'Corpus and tools v1.0, with checksums and attestation',
      'The upgrade drill against pinned newer stellar-xdr and stellar-core fixtures: the coverage gate failing, then closed by new entries or justified exclusions',
      'An upgrade-readiness report: which SDK and indexer versions read the next protocol\'s shapes',
      'A public maintenance runbook',
      'Findings made after the award, filed upstream with severity, CAP and a minimal corpus entry; any fix a maintainer asks for, linked separately',
    ],
    parts: [
      ['The drill', 'The gate fails on the newer fixtures, then closes', 'weeks 19–20'],
      ['Readiness report', 'Which SDK and indexer versions read the next protocol\'s shapes', 'week 20'],
      ['Runbook', 'How an upgrade is handled, in public', 'week 20'],
      ['v1.0 release', 'Checksums and attestation', 'week 20'],
      ['Findings upstream', 'With severity, CAP and a minimal corpus entry', 'weeks 19–20'],
    ],
    done: 'The release page, the drill\'s pull request, the runbook and the linked reports.',
    notIn: ['Maintenance after v1.0: 18 months, outside this grant'],
    today: '`make coverage` already fails on an arm that is neither reached nor classified (499 arms: 418 reached, 81 classified). The drill shows that gate working on a new protocol.',
  },
];
