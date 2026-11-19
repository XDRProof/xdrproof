# Generate (/docs/tools/generate)

```bash
make generate        # recipes/regenerate.sh, about 10 minutes
make generate-quick  # only the two mainnet base P30 pairs, about 3 minutes
```

It needs Docker, Node ≥ 22.15, npm, curl, jq and perl, and host ports 21700–21719. The stellar-core image is pinned by digest in `recipes/core-image`, and every run refuses anything but stellar-core v30.0.0.

## The matrix

`make generate` runs **10 pairs**, which is 20 fresh standalone cores, 6 at a time. There is no RPC, no network, and no keys or funds.

| Lane | Protocol | Passphrase | Flag profile |
|---|---|---|---|
| Classic | P30 | mainnet, testnet | base |
| Classic | P30 | mainnet | galexie, bare |
| Soroban | P30 | mainnet, testnet | base |
| Soroban | P28 | mainnet, testnet | base |
| Soroban | P30 | mainnet | galexie, bare |

## What must hold

<Steps>
<Step>

### Each pair agrees

The two runs of a pair are compared ledger by ledger. They must be byte-identical, or identical after normalising. Normalising sorts the order of changes within an operation and zeroes the diagnostic `invoke_time_nsecs` timing value.

</Step>
<Step>

### Every shipped variant is reproduced

The list of shipped generated variants is read from `entries/` (`tools/shipped-checks.mjs`), so the testnet and protocol-28 variants are re-checked too. A full run also fails if any shipped variant was not assigned to a pair.

</Step>
<Step>

### The profiles are compared

The same recipe ledgers under the three flag profiles are compared, and the result is recorded in `recipes/<lane>/profiles/p30-mainnet.json`. Every ledger keeps the same header hash; only the metadata changes. See [Found while building](/docs/findings).

</Step>
</Steps>

It ends with `OK: every run reproduced; every shipped generated variant reproduced`.
