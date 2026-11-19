# Disclosure policy

- **Ordinary bugs** (an SDK renders a value wrongly, accepts invalid input, refuses valid input) are written up in
  [REPORT.md](REPORT.md) and reported upstream as public issues, after a search for duplicates. Each one stays
  pinned in `conformance/expectations/` until it is fixed.
- **Halts and crashes anyone can trigger** (a ledger, transaction or value that stops a live indexer or crashes an
  SDK) are reported privately first, through the project's security contact or SDF's security channel, and are not
  committed to this repository, its issues or its corpus until a fix ships or 90 days pass, whichever comes first.
  The corpus entry that reproduces it is added with the public write-up.
- **Behaviour by design** that still trips readers (for example hazard H-B16) is documented in the corpus and the
  guide, with the design rationale linked, and not reported as a bug.
