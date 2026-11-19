# Layer C: Transaction lifecycle and results (/docs/hazards/layer-c)

Failed transactions that still change state, fee bumps, sponsorship, Soroban failures, order-book matching, liquidity pools, claimable balances, and fees that differ from what was bid.

### H-C1: Failed transactions in ledgers (fees charged, no effects, result codes)

In the corpus. Checks: replay probe, verify facts.

Evidence: [stellar-etl#455](https://github.com/stellar/stellar-etl/issues/455)

Test: Failure suite C41–C49: one result code per tx, about 45 codes; `tx_failed` C32

### H-C2: Fee-bump inner success and failure

In the corpus. Checks: replay probe, verify facts.

Evidence: [stellar-etl#464](https://github.com/stellar/stellar-etl/issues/464)

Test: C30, C31, mainnet

### H-C3: Sponsorship sandwiches, revocation, `txBAD_SPONSORSHIP`

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#323](https://github.com/stellar/stellar-etl/issues/323) (sponsor missing in state tables)

Test: C22, C23, C40 (signer), C44 revoke signer, C45 failures, mainnet `M:sponsorship`

### H-C4: Preconditions v2 (ledger bounds, min seq, extra signers) and no preconditions

In the corpus. Checks: conformance, replay probe.

Evidence: CAP-0021

Test: C33, PRECOND_NONE C44

### H-C5: Several operations with different sources in one tx

In the corpus. Checks: replay probe.

Evidence: participants-from-envelope rule

Test: C9 (three op sources), C22

### H-C6: Soroban failures: trapped, resource exceeded, archived entry

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#452](https://github.com/stellar/stellar-etl/issues/452) (`in_successful_contract_call` hard-coded true)

Test: Trapped S23; mainnet `M:soroban-failed` (3 ledgers); archived entry todo

### H-C7: Order-book matching: one op claims many offers; offers removed by crossing

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#456](https://github.com/stellar/stellar-etl/issues/456) (spurious offer effects)

Test: C12 (3 offers), C14, mainnet `M:offer-crosses-many`

### H-C8: Liquidity pools: deposit, withdraw, pool claim atoms, pool-share trustline without pool row

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#451](https://github.com/stellar/stellar-etl/issues/451), [wallet-backend#755](https://github.com/stellar/wallet-backend/issues/755)

Test: C13, C15, C44 (strict receive through pool), mainnet; pool-share limit-only ChangeTrust c-base `pool-share-limit-only-change-trust`

### H-C9: Claimable balances: nested predicates, claim, clawback, flags

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#441](https://github.com/stellar/stellar-etl/issues/441)

Test: C16–C19, C40 (expired predicate) + C45 cannot-claim, mainnet

### H-C10: Clawback and trustline authorization states (authorized, maintain-liabilities, deauthorized)

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#457](https://github.com/stellar/stellar-etl/issues/457) (allow_trust effect types)

Test: C20, C21, allow_trust C44, mainnet `M:clawback-and-trustline-flags`; full deauthorization (authorized and maintain-liabilities both cleared): c-base `revoke-trustline-with-offers-and-pool-shares`

### H-C11: Sequence bumps and account merges (entry removed)

In the corpus. Checks: replay probe.

Evidence: 

Test: C37, C38, mainnet

### H-C12: Transaction apply order differs from transaction-set order

In the corpus. Checks: replay probe.

Evidence: R02

Test: Multi-tx ledgers C40–C45, mainnet

### H-C13: Soroban fee charged at the maximum, refunded in `post_tx_apply_fee_processing`; `fee_charged` is net

In the corpus. Checks: replay probe, verify facts.

Evidence: [stellar-etl#453](https://github.com/stellar/stellar-etl/issues/453), #511; CAP-0063; measured on S10

Test: Facts on existing S-ledgers; Soroban fee bump with a muxed fee source, charge and refund both on the fee source: s-base `soroban-fee-bump-muxed-fee-source`; fee source merged earlier in the same ledger: no refund, no refund event, fee_charged is the full maximum (TransactionFrame.cpp:998-1001): s-base `race-victim-txNO_ACCOUNT`

### H-C14: Fee-bump identity: outer hash in `TransactionResultPair`, inner hash in `InnerTransactionResultPair`; inner source seq consumed even on failure, fee source seq not

In the corpus. Checks: replay probe.

Evidence: [stellar-etl#464](https://github.com/stellar/stellar-etl/issues/464), #477, #465; measured on C31

Test: Facts on C30/C31

### H-C15: Failed transactions still change state: sequence bump in `tx_changes_before`; pre-auth signer removed even when the transaction fails (CAP-0028)

In the corpus. Checks: replay probe.

Evidence: measured on C32, C35; wallet-backend.md:143

Test: New: a pre-auth transaction that fails

### H-C16: Transaction-level failures at apply time: `txBAD_SEQ`, `txNO_ACCOUNT`, `txBAD_AUTH`, `opBAD_AUTH` (state changed earlier in the same ledger or tx)

In the corpus. Checks: verify facts.

Evidence: 15 TransactionResultResult arms uncovered

Test: One ledger, classic attackers then Soroban victims (core applies the classic phase first; within a phase the order is a hash shuffle): txBAD_SEQ, txNO_ACCOUNT, txBAD_AUTH, txBAD_MIN_SEQ_AGE_OR_GAP, and txFAILED with opBAD_AUTH and opNO_ACCOUNT, all valid at submission (TransactionFrame::commonValid, OperationFrame::checkSignature forApply): s-base `race-victim-*`

### H-C17: Liabilities: available ≠ balance (`UNDERFUNDED` with balance > amount; `LINE_FULL` from buying liabilities)

In the corpus. Checks: replay probe, verify facts.

Evidence: CAP-0003

Test: Account with an open offer pays balance − liabilities + 1

### H-C18: Fee paid ≠ fee bid: generalized tx-set component `baseFee` (surge pricing)

In the corpus. Checks: verify facts.

Evidence: [stellar-etl#465](https://github.com/stellar/stellar-etl/issues/465)

Test: Classic: oversubscribed ledger with distinct bids: component baseFee 2000 against header base_fee 100, the 3000 bidder charged below its bid, the 1000 bidder applied one ledger later: c-base `surge-priced-oversubscribed`, `surge-left-over-applies-next-ledger` (equal bids are broken by a random seed, SurgePricingUtils.cpp:122). Soroban: ledgerMaxTxCount 2 with bids 3000/2000/1000: phase base_fee 2000, both kept transactions charged the same, the third one ledger later at 100: s-base `soroban-surge-priced`, `soroban-surge-left-over-applies-next-ledger`

### H-C19: An operation result whose type differs from its operation: CREATE_PASSIVE_SELL_OFFER returns a MANAGE_SELL_OFFER result

In the corpus. Checks: conformance, replay probe.

Evidence: stellar-core CreatePassiveSellOfferOpFrame.cpp:13 sets the operation body type to MANAGE_SELL_OFFER, so the OperationResult arm is manage_sell_offer; measured on c-base CREATE_PASSIVE_SELL_OFFER

Test: c-base `CREATE_PASSIVE_SELL_OFFER`: envelope create_passive_sell_offer, result arm manage_sell_offer

The hazards come straight from [`caps/registry.json`](https://github.com/XDRProof/xdrproof/blob/main/caps/registry.json). A tag says which check will exercise each one: **replay probe**, **conformance**, **linter**, **guide** or **verify facts**. **In the corpus** means an entry already targets it.
