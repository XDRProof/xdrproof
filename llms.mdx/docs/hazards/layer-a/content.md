# Layer A: Addresses and identities (/docs/hazards/layer-a)

Muxed accounts, signed-payload, hash-x and pre-auth signers, contract, liquidity-pool and claimable-balance addresses, and fee-bump sources: the places where an address is longer, or stranger, than a G key.

**Why it matters.** An address is the key an indexer files everything under. When it is longer or stranger than a G… key, rows land under the wrong account, or the insert fails.

### H-A1: Muxed account (`M…`) treated as a plain account: ID dropped, truncated, or used as identity

In the corpus. Checks: conformance, linter, replay probe.

Evidence: [wallet-backend#716](https://github.com/stellar/wallet-backend/issues/716) (AddressBytea truncation), #693 (two muxed over one base → PK collision), [stellar-etl#263](https://github.com/stellar/stellar-etl/issues/263)/#477 (fee account muxed)

Test: Muxed in every position: tx source C5, op source C5, payment dest C5, path-payment dest C14, account-merge dest C38, fee-bump fee source c-base `fee-bump-muxed-fee-source` and s-base `soroban-fee-bump-muxed-fee-source`, SAC transfer dest S11, muxed contract `W` S27; two different muxed IDs over one base account in one ledger c-base `two-muxed-ids-one-base-account-one-ledger`; muxed tx and operation sources on Soroban TTL and restore operations s-base `ttl-extend-muxed-source-text-memo`, `restore-muxed-op-source-text-memo`

### H-A2: Muxed ID extremes and non-canonical forms

In the corpus. Checks: conformance.

Evidence: [js-stellar-sdk#1785](https://github.com/stellar/js-stellar-sdk/issues/1785) (IDs that encode a different ID)

Test: IDs 0, 1, 2^63, 2^64−1 (C5 has 1, 2^63, 2^64−1; 0 in c-base `muxed-id-zero`); non-canonical strings as API vectors (exists in conformance)

### H-A3: Signed-payload signer (`P…`) stored as 32/33 bytes, payload lost, or halts ingestion

In the corpus. Checks: conformance, replay probe.

Evidence: [wallet-backend#729](https://github.com/stellar/wallet-backend/issues/729) (halt), #716 (33 bytes)

Test: Payload lengths 1 (c-base `signed-payload-length-1`), 3 (mined testnet 4437357), 29 (needs padding, C6), 64 (max, C6); as account signer C6 + mined mainnet `M:signed-payload-signer`; as extra signer (CAP-21) C33

### H-A4: Hash-x (`X…`) and pre-auth (`T…`) signers; pre-auth signer removed by core with no operation

In the corpus. Checks: replay probe.

Evidence: CAP-0021/CAP-0019; removal is a state change no op explains

Test: Add both C34; pre-auth tx executes and the signer disappears C35; hash-x-signed tx C36; mainnet `M:signer-hashx-preauth`

### H-A5: Contract (`C…`), liquidity-pool (`L…`) and claimable-balance (`B…`) addresses where readers expect accounts

In the corpus. Checks: conformance, linter, replay probe.

Evidence: [wallet-backend#745](https://github.com/stellar/wallet-backend/issues/745) (CB/LP ScAddress as deployer), #756 (CB/LP address in event topic)

Test: Contract addresses throughout S-recipes; LP and claimable-balance addresses in classic event topics (CAP-0067); CB/LP ScAddress as deployer: s-base `deploy-from-liquidity-pool-address`, `deploy-from-claimable-balance-address` (included, trapped: the host refuses both kinds)

### H-A6: Fabricated muxed destination from a text or hash memo

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#450](https://github.com/stellar/stellar-etl/issues/450) (token_transfer invents muxed id=0)

Test: Memo text, hash, return and id on payments C26–C29; the memo carried into the CAP-0067 transfer event as to_muxed_id: text as a string (non-UTF-8 in C26), id as u64 (C27), hash and return both as bytes and so indistinguishable (C28, C29)

### H-A7: Forged auth entries put a transaction into an unrelated address's history

In the corpus. Checks: linter, replay probe.

Evidence: [wallet-backend#739](https://github.com/stellar/wallet-backend/issues/739)

Test: s-base `auth-tree-depth-245-max`: its 244 never-called sub-invocations name kits[1] 244 times in the envelope auth and 0 times in results or meta

### H-A8: Fee-bump: fee source vs inner source confusion; inner signers captured nowhere

In the corpus. Checks: replay probe, verify facts.

Evidence: [stellar-etl#464](https://github.com/stellar/stellar-etl/issues/464), #453, #263

Test: Fee bump success C30, inner failed C31 + mainnet `M:fee-bump-inner-failed`; muxed fee source: c-base `fee-bump-muxed-fee-source`; Soroban fee bump with a muxed fee source: s-base `soroban-fee-bump-muxed-fee-source`

### H-A9: Muxed placements missing: `Clawback.from` (MuxedAccount); muxed source and text memo on ExtendFootprintTTL/RestoreFootprint (valid; wallet-backend#753 halted on them; the JS builder refuses them)

In the corpus. Checks: conformance, replay probe.

Evidence: strkey-sep-0023.md:268; stellar-core-validation.md:217-218

Test: Clawback from M: c-base `clawback-from-muxed`; muxed tx source + text memo on EXTEND_FOOTPRINT_TTL and muxed op source + text memo on RESTORE_FOOTPRINT, envelopes built by hand: s-base `ttl-extend-muxed-source-text-memo`, `restore-muxed-op-source-text-memo`

### H-A10: Claimable-balance ID forms (union vs B strkey vs hex); derived from base account + seq + op index

In the corpus. Checks: conformance.

Evidence: strkey-sep-0023.md §2

Test: Claimable balance at op index 1, muxed op source, inside a fee bump

### H-A11: Muxed `ScAddress` rejected inside a contract-data key; events split M into `to` + `to_muxed_id` (u64, bytes or string)

In the corpus. Checks: conformance, replay probe.

Evidence: strkey-sep-0023.md:275-300; measured C26 (string), C28 (bytes)

Test: Trapped kit `put` with a muxed key (the key also sits in the footprint and the invoke arguments): s-base `kit-put-muxed-address-key-trapped`; facts on C26/C28

The hazards come straight from [`caps/registry.json`](https://github.com/XDRProof/xdrproof/blob/main/caps/registry.json). A tag says which check will exercise each one: **replay probe**, **conformance**, **linter**, **guide** or **verify facts**. **In the corpus** means an entry already targets it.
