# An offer match in a protocol-12 result decodes as ClaimOfferAtomV0: the seller is a raw ed25519 key (/docs/corpus/entries/backfill-claim-atom-v0-p12)

Where it sits, inside `LedgerCloseMeta` (CAP-0038):

- H-F8: ClaimAtom.CLAIM_ATOM_TYPE_V0 in a P12 result: the seller as raw ed25519, not an AccountID
- H-C7: an offer claim recorded as ClaimOfferAtomV0 (pre-P18 result bytes)

## The shape

Before protocol 18 an offer claim was a ClaimOfferAtom whose seller was an AccountID. CAP-0038 turned it into the ClaimAtom union and kept old bytes readable: the AccountID discriminant (0) now reads as CLAIM_ATOM_TYPE_V0, and the seller as a bare 32-byte ed25519 key (Stellar-transaction.x, "ClaimOfferAtomV0 is a ClaimOfferAtom with the AccountID discriminant stripped"). Old results in SDF's lake still carry it. Readers that only handle ORDER_BOOK and LIQUIDITY_POOL claim atoms, or that print the seller without converting it to a G address, fail on every pre-P18 trade.

## Variants

| Variant | Protocol | Network | Source | Size | sha256 |
|---|---|---|---|---|---|
| [`p12-mainnet-mined-l26588352`](https://github.com/XDRProof/xdrproof/blob/main/entries/backfill.claim-atom-v0-p12/p12-mainnet-mined-l26588352.xdr.zst) | P12 | mainnet passphrase | mined from history | 887,884 B | `039ba91a4dfd229cbbc58204ce16afed91eb066f4b88219b7d1932f08359b584` |

## What a correct reader returns

| A correct reader finds | Value | Backed by |
|---|---|---|
| The claimed offer's seller is a raw ed25519 key in a V0 claim atom. | `ad0713a07a84a069367932edf2b6155c69aed69446e564168ab8fcd78d728785` | snapshot, core, walker |
| The claimed offer is offer 127478113. | `127478113` | snapshot, core, walker |
| The same seller, as the offer's ledger entry names it, is the G address of that key. | some change where 2 fields match | snapshot, core, walker |
| The seller's account entry carries liabilities in extension v1 with no v2 extension. | some change where 1 fields match | snapshot |

## Check it yourself

```bash
make verify   # schema, hashes, the byte-for-byte round trip and every fact above
make oracle   # the facts' values, re-read by stellar-core and the schema walker
```

Entry id `backfill.claim-atom-v0-p12` · compiled from [`catalog/backfill.claim-atom-v0-p12.json`](https://github.com/XDRProof/xdrproof/blob/main/catalog/backfill.claim-atom-v0-p12.json) · [`entry.json`](https://github.com/XDRProof/xdrproof/blob/main/entries/backfill.claim-atom-v0-p12/entry.json)
