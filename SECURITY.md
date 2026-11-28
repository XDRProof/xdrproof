# Security

## Reporting a vulnerability in XDRProof

Please report it privately through GitHub: **Security → Report a vulnerability** on this repository, or open the form
directly at <https://github.com/XDRProof/xdrproof/security/advisories/new>. Don't open a public issue. XDRProof has one maintainer, so these are targets, not guarantees: a reply within 3 working days, and a
fix or a mitigation plan within 30 days. You'll be credited in the release notes unless you'd rather not be named.

In scope: anything in this repository that could mislead a user or harm their machine or CI. That includes a corpus
entry or expected value that is wrong; a tool, testee or adapter that runs or leaks more than it should; a workflow
that exposes a secret or can be hijacked; and, once they ship, the release artifacts and packages.

## Bugs XDRProof finds in other projects

Findings in SDKs, indexers and stellar-core follow [`findings/policy.md`](findings/policy.md). Anything that lets
someone halt or crash an indexer, an SDK or stellar-core is reported privately first, through the owner's security
channel, and isn't published until a fix ships or 90 days pass. Behaviour a project documents as by design is recorded
in the findings report, not filed. Everything else is filed publicly, with a figure, a reproduction and, where
possible, a tested fix.

## How the project is protected

[`THREAT-MODEL.md`](THREAT-MODEL.md) lists what XDRProof handles, the trust boundaries, the threats and their
mitigations, and the risks still open.
