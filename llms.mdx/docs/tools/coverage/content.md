# Coverage (/docs/tools/coverage)

**What it is.** A count of every kind of data a ledger can hold (every branch of every XDR union), and whether the corpus has a real example of each.

**Why it matters.** It turns "we test the rare cases" into a number. Every branch the corpus lacks has a written reason, with the stellar-core source line behind it.

```bash
make coverage          # arms in the corpus and the mined ledgers
make coverage-report   # writes COVERAGE.md; fails on any arm that is
                       # neither reached by an entry nor classified
make coverage-goldens  # plus core's own golden ledgers (76 MB, once)
```

A walker reads the rs-stellar-xdr definitions for v30.0, and lists every union arm and enum member reachable from `LedgerCloseMeta`. It then walks real ledgers and records which arms they meet.

| Ledgers | Union arms |
|---|---|
| Reachable from `LedgerCloseMeta` | **499** (and 411 enum members) |
| Entry files (698 variant files: raw `.xdr`, alternate change orderings, and `.xdr.zst` decompressed) | 417 of 499 |
| The [mined ledgers](/docs/corpus/mined) (37 files) | 289 of 499 |
| Entries and mined ledgers together | 417 of 499 |
| stellar-core's goldens (866 files, 15,306 ledgers, commit `f2b91947`) | 254 of 499 |

The corpus rows are computed from the corpus at commit <code>0e23f4c</code>, the same way `make coverage` computes them. The goldens row is a fixed measurement at stellar-core commit `f2b91947`. The goldens are the ledgers stellar-core's own tests produce.

## Every arm accounted for

`make coverage` counts every arm in an entry's file, including arms from other transactions that happen to share its ledger. `make coverage-report` is stricter. An entry **reaches** an arm only when its own transaction (envelope, fee changes, apply meta) or its ledger's own shape (header, transaction-set phases, upgrades, evicted keys) contains it. Every arm no entry reaches is classified in `coverage/exclusions.json`, with the stellar-core source line that decides it. The run fails if an arm is in neither list, or in both.

| Union arms reachable from LedgerCloseMeta | Arms |
|---|---|
| Reached by an entry: its own transaction, or its ledger's header and transaction-set shape | 417 |
| `todo`: core can write it at protocol 30 and a standalone recipe can produce it; not yet in an entry | 0 |
| `network-only`: reachable in closed ledgers, but only under live-network conditions a standalone core cannot set up; to be mined | 8 |
| `historical`: only in ledgers of older protocols (range in the note) | 18 |
| `validation-only`: set only where a transaction is validated for inclusion; a closed ledger never carries it at protocol 30 | 39 |
| `not-emitted`: in the type graph, but stellar-core 30 never writes it into ledger-close meta | 17 |
| Total | 499 |

Enum members reached by an entry: 333 of 411. The report is written to [`COVERAGE.md`](https://github.com/XDRProof/xdrproof/blob/main/COVERAGE.md), with the entries that target each hazard.

No `todo` arm is left: every arm stellar-core can still write at protocol 30 on a standalone network is in an entry. Only the 8 `network-only` arms, which need a live network, are out of reach. A closed protocol-30 ledger never carries a `validation-only` or `not-emitted` arm, and a `historical` one appears only in ledgers of older protocols.

### todo (0 arms)

core can write it at protocol 30 and a standalone recipe can produce it; not yet in an entry.

| Arm | Why | Source line |
|---|---|---|

### network-only (8 arms)

reachable in closed ledgers, but only under live-network conditions a standalone core cannot set up; to be mined.

| Arm | Why | Source line |
|---|---|---|
| `ContractCodeEntryExt.0` | Code uploaded under protocol 20 can retain extension 0 and later appear in protocol-30 restore metadata; a fresh protocol-30 network lacks that old code state. | `src/transactions/test/InvokeHostFunctionTests.cpp:7383 REQUIRE(code.ext.v() == 0);` |
| `InnerTransactionResultResult.txINTERNAL_ERROR` | As for the outer code: only an exception at apply produces it. | `src/transactions/TransactionFrame.cpp:2303 txResult.setInnermostError(txINTERNAL_ERROR);` |
| `InnerTransactionResultResult.txTOO_EARLY` | The agreed close time can fall before an inner transaction's lower bound after queue admission; reproducing that consensus timing on a fresh network is difficult. | `src/transactions/TransactionFrame.cpp:1448 txResult.setInnermostError(txTOO_EARLY);` |
| `InnerTransactionResultResult.txTOO_LATE` | The agreed close time can pass an inner transaction's upper bound after admission; reproducing that timing on a fresh network is difficult. | `src/transactions/TransactionFrame.cpp:1454 txResult.setInnermostError(txTOO_LATE);` |
| `StellarValueExt.STELLAR_VALUE_EMPTY_TX_SET_MS` | SCP can substitute an empty transaction set for a signed millisecond value; exercising that consensus fallback on a fresh standalone network is difficult. | `src/herder/HerderSCPDriver.cpp:741 sv.ext.v(STELLAR_VALUE_EMPTY_TX_SET_MS);` |
| `TransactionResultResult.txINTERNAL_ERROR` | Set when apply throws, which a correct core does not do; the forcing memo exists only in BUILD_TESTS builds, not in the pinned release image. Mine it if a closed ledger has one. | `src/transactions/TransactionFrame.cpp:2303 txResult.setInnermostError(txINTERNAL_ERROR);` |
| `TransactionResultResult.txTOO_EARLY` | The agreed close time can fall before an accepted transaction's lower bound; reproducing that consensus timing on a fresh network is difficult. | `src/transactions/TransactionFrame.cpp:1448 txResult.setInnermostError(txTOO_EARLY);` |
| `TransactionResultResult.txTOO_LATE` | The agreed close time can pass an accepted transaction's upper bound; reproducing that timing on a fresh network is difficult. | `src/transactions/TransactionFrame.cpp:1454 txResult.setInnermostError(txTOO_LATE);` |

### historical (18 arms)

only in ledgers of older protocols (range in the note).

| Arm | Why | Source line |
|---|---|---|
| `AllowTrustResult.ALLOW_TRUST_SELF_NOT_ALLOWED` | Apply emitted this for self trust in protocols 3–15; protocol 16 onward rejects it in validation. Old mined lake ledgers could contain it. | `src/transactions/TrustFlagsOpFrameBase.cpp:68 if (getOpTrustor() == getSourceID())` |
| `AllowTrustResult.ALLOW_TRUST_TRUST_NOT_REQUIRED` | This apply result is gated to protocols 1–15. Old mined lake ledgers could contain it. | `src/transactions/AllowTrustOpFrame.cpp:115 if (protocolVersionIsBefore(header.current().ledgerVersion,` |
| `ChangeTrustResult.CHANGE_TRUST_SELF_NOT_ALLOWED` | Apply could emit this for issuer self trust in protocols 3–15; protocol 16 onward rejects that case as malformed. Old mined lake ledgers could contain it. | `src/transactions/ChangeTrustOpFrame.cpp:167 innerResult(res).code(CHANGE_TRUST_SELF_NOT_ALLOWED);` |
| `InflationResult.INFLATION_NOT_TIME` | Inflation was supported in protocols 1–11; an early invocation could emit this. Old mined lake ledgers could contain it. | `src/transactions/InflationOpFrame.cpp:47 innerResult(res).code(INFLATION_NOT_TIME);` |
| `InflationResult.INFLATION_SUCCESS` | Successful inflation was possible in protocols 1–11. Old mined lake ledgers could contain it. | `src/transactions/InflationOpFrame.cpp:74 innerResult(res).code(INFLATION_SUCCESS);` |
| `ManageBuyOfferResult.MANAGE_BUY_OFFER_BUY_NO_ISSUER` | Only before protocol 13: the issuer-existence check is gated by protocolVersionIsBefore(V_13), so no ledger from protocol 13 on carries it. SDF's lake holds the 2015-2020 ledgers where it can appear. | `src/transactions/ManageOfferOpFrameBase.cpp:82 if (protocolVersionIsBefore(ledgerVersion, ProtocolVersion::V_13))` |
| `ManageBuyOfferResult.MANAGE_BUY_OFFER_SELL_NO_ISSUER` | Only before protocol 13: the issuer-existence check is gated by protocolVersionIsBefore(V_13), so no ledger from protocol 13 on carries it. SDF's lake holds the 2015-2020 ledgers where it can appear. | `src/transactions/ManageOfferOpFrameBase.cpp:51 if (protocolVersionIsBefore(ledgerVersion, ProtocolVersion::V_13))` |
| `ManageSellOfferResult.MANAGE_SELL_OFFER_BUY_NO_ISSUER` | Only before protocol 13: the issuer-existence check is gated by protocolVersionIsBefore(V_13), so no ledger from protocol 13 on carries it. SDF's lake holds the 2015-2020 ledgers where it can appear. | `src/transactions/ManageOfferOpFrameBase.cpp:82 if (protocolVersionIsBefore(ledgerVersion, ProtocolVersion::V_13))` |
| `ManageSellOfferResult.MANAGE_SELL_OFFER_SELL_NO_ISSUER` | Only before protocol 13: the issuer-existence check is gated by protocolVersionIsBefore(V_13), so no ledger from protocol 13 on carries it. SDF's lake holds the 2015-2020 ledgers where it can appear. | `src/transactions/ManageOfferOpFrameBase.cpp:51 if (protocolVersionIsBefore(ledgerVersion, ProtocolVersion::V_13))` |
| `OperationBody.INFLATION` | Inflation operations were supported in protocols 1–11. Old mined lake ledgers could contain this body. | `src/transactions/InflationOpFrame.cpp:143 return protocolVersionIsBefore(header.ledgerVersion, ProtocolVersion::V_12);` |
| `OperationResultTr.INFLATION` | Inflation result payloads were possible in protocols 1–11. Old mined lake ledgers could contain them. | `src/transactions/OperationFrame.cpp:90 case INFLATION:` |
| `PathPaymentStrictReceiveResult.PATH_PAYMENT_STRICT_RECEIVE_NO_ISSUER` | Only before protocol 13: the issuer-existence check is gated by protocolVersionIsBefore(V_13), so no ledger from protocol 13 on carries it. SDF's lake holds the 2015-2020 ledgers where it can appear. | `src/transactions/PathPaymentOpFrameBase.cpp:83 if (protocolVersionIsBefore(ledgerVersion, ProtocolVersion::V_13) &&` |
| `PathPaymentStrictSendResult.PATH_PAYMENT_STRICT_SEND_NO_ISSUER` | Only before protocol 13: the issuer-existence check is gated by protocolVersionIsBefore(V_13), so no ledger from protocol 13 on carries it. SDF's lake holds the 2015-2020 ledgers where it can appear. | `src/transactions/PathPaymentOpFrameBase.cpp:83 if (protocolVersionIsBefore(ledgerVersion, ProtocolVersion::V_13) &&` |
| `PaymentResult.PAYMENT_NO_ISSUER` | Only before protocol 13: the issuer-existence check is gated by protocolVersionIsBefore(V_13), so no ledger from protocol 13 on carries it. SDF's lake holds the 2015-2020 ledgers where it can appear. | `src/transactions/PaymentOpFrame.cpp:117 case PATH_PAYMENT_STRICT_RECEIVE_NO_ISSUER:` |
| `StellarValueExt.STELLAR_VALUE_EMPTY_TX_SET` | The whole-second empty-set value applies to protocols 28–29; protocol 30 uses the millisecond arm. Lake ledgers from that range could contain it. | `src/herder/HerderSCPDriver.cpp:751 sv.ext.v(STELLAR_VALUE_EMPTY_TX_SET);` |
| `TransactionMeta.2` | Core selects version 2 for pre-Soroban protocols 1–19 without event backfill. The stated public-lake re-emission uses version 4 instead. | `src/transactions/TransactionMeta.cpp:542 else` |
| `TransactionMeta.3` | Core selects version 3 for protocols 20–22 without event backfill. The stated public-lake re-emission uses version 4 instead. | `src/transactions/TransactionMeta.cpp:537 else if (protocolVersionStartsFrom(protocolVersion,` |
| `TransactionResultResult.txINSUFFICIENT_BALANCE` | From protocol 9, apply asks only that the available balance is not negative (the fee was charged before apply), and every operation that raises an account's reserve or liabilities checks it can afford them; before protocol 9 apply re-checked the full fee, so pre-P9 ledgers can carry it. | `src/transactions/TransactionFrame.cpp:1710 (applying && protocolVersionStartsFrom(header.current().ledgerVersion,` |

### validation-only (39 arms)

set only where a transaction is validated for inclusion; a closed ledger never carries it at protocol 30.

| Arm | Why | Source line |
|---|---|---|
| `AccountMergeResult.ACCOUNT_MERGE_MALFORMED` | A merge into the source account fails doCheckValid before submission; apply cannot receive that accepted operation. | `src/transactions/MergeOpFrame.cpp:283 innerResult(res).code(ACCOUNT_MERGE_MALFORMED);` |
| `AllowTrustResult.ALLOW_TRUST_MALFORMED` | The malformed asset or flags fail doCheckValid before submission. | `src/transactions/AllowTrustOpFrame.cpp:161 innerResult(res).code(ALLOW_TRUST_MALFORMED);` |
| `BeginSponsoringFutureReservesResult.BEGIN_SPONSORING_FUTURE_RESERVES_MALFORMED` | The malformed sponsorship operation fails doCheckValid before submission. | `src/transactions/BeginSponsoringFutureReservesOpFrame.cpp:111 innerResult(res).code(BEGIN_SPONSORING_FUTURE_RESERVES_MALFORMED);` |
| `BumpSequenceResult.BUMP_SEQUENCE_BAD_SEQ` | A negative bump target fails doCheckValid before submission. | `src/transactions/BumpSequenceOpFrame.cpp:77 innerResult(res).code(BUMP_SEQUENCE_BAD_SEQ);` |
| `ChangeTrustAsset.ASSET_TYPE_NATIVE` | At protocol 30, native ChangeTrust assets fail doCheckValid, so the operation body cannot enter a closed ledger. | `src/transactions/ChangeTrustOpFrame.cpp:330 innerResult(res).code(CHANGE_TRUST_MALFORMED);` |
| `ChangeTrustResult.CHANGE_TRUST_MALFORMED` | An invalid limit or asset fails doCheckValid before submission. | `src/transactions/ChangeTrustOpFrame.cpp:317 innerResult(res).code(CHANGE_TRUST_MALFORMED);` |
| `ClawbackResult.CLAWBACK_MALFORMED` | The malformed clawback fails doCheckValid before submission. | `src/transactions/ClawbackOpFrame.cpp:69 innerResult(res).code(CLAWBACK_MALFORMED);` |
| `CreateAccountResult.CREATE_ACCOUNT_MALFORMED` | The malformed create-account operation fails doCheckValid before submission. | `src/transactions/CreateAccountOpFrame.cpp:182 innerResult(res).code(CREATE_ACCOUNT_MALFORMED);` |
| `CreateClaimableBalanceResult.CREATE_CLAIMABLE_BALANCE_MALFORMED` | Malformed amount or claimant data fails doCheckValid before submission. | `src/transactions/CreateClaimableBalanceOpFrame.cpp:272 innerResult(res).code(CREATE_CLAIMABLE_BALANCE_MALFORMED);` |
| `ExtendFootprintTTLResult.EXTEND_FOOTPRINT_TTL_MALFORMED` | An invalid footprint fails doCheckValidForSoroban before submission. | `src/transactions/ExtendFootprintTTLOpFrame.cpp:334 innerResult(res).code(EXTEND_FOOTPRINT_TTL_MALFORMED);` |
| `InnerTransactionResultResult.txFROZEN_KEY_ACCESSED` | The established frozen-key admission check rejects the inner transaction before it enters a closed ledger. | `src/transactions/TransactionFrame.cpp:1488 txResult.setInnermostError(txFROZEN_KEY_ACCESSED);` |
| `InnerTransactionResultResult.txMALFORMED` | Malformed inner envelope properties are fixed at admission and fail validation before inclusion. | `src/transactions/TransactionFrame.cpp:1283 txResult.setInnermostError(txMALFORMED);` |
| `InnerTransactionResultResult.txMISSING_OPERATION` | An inner transaction with no operations fails admission validation. | `src/transactions/TransactionFrame.cpp:1300 txResult.setInnermostError(txMISSING_OPERATION);` |
| `InnerTransactionResultResult.txNOT_SUPPORTED` | Unsupported inner envelope forms are rejected in validation before inclusion. | `src/transactions/TransactionFrame.cpp:1264 txResult.setInnermostError(txNOT_SUPPORTED);` |
| `InnerTransactionResultResult.txSOROBAN_INVALID` | As for the outer code: the checks depend only on the transaction and the Soroban config, which cannot change between nomination and apply. | `src/transactions/TransactionFrame.cpp:1333 txResult.setInnermostError(txSOROBAN_INVALID);` |
| `LiquidityPoolDepositResult.LIQUIDITY_POOL_DEPOSIT_MALFORMED` | Invalid deposit bounds fail doCheckValid before submission. | `src/transactions/LiquidityPoolDepositOpFrame.cpp:383 innerResult(res).code(LIQUIDITY_POOL_DEPOSIT_MALFORMED);` |
| `LiquidityPoolWithdrawResult.LIQUIDITY_POOL_WITHDRAW_MALFORMED` | Invalid withdrawal bounds fail doCheckValid before submission. | `src/transactions/LiquidityPoolWithdrawOpFrame.cpp:172 innerResult(res).code(LIQUIDITY_POOL_WITHDRAW_MALFORMED);` |
| `ManageBuyOfferResult.MANAGE_BUY_OFFER_MALFORMED` | Invalid offer parameters fail doCheckValid before submission. | `src/transactions/ManageBuyOfferOpFrame.cpp:102 res.tr().manageBuyOfferResult().code(MANAGE_BUY_OFFER_MALFORMED);` |
| `ManageDataResult.MANAGE_DATA_INVALID_NAME` | An empty or invalid data name fails doCheckValid before submission. | `src/transactions/ManageDataOpFrame.cpp:117 innerResult(res).code(MANAGE_DATA_INVALID_NAME);` |
| `ManageDataResult.MANAGE_DATA_NOT_SUPPORTED_YET` | This pre-protocol-2 check occurs in doCheckValid; it rejects submission and cannot arise from protocol-30 apply. | `src/transactions/ManageDataOpFrame.cpp:110 innerResult(res).code(MANAGE_DATA_NOT_SUPPORTED_YET);` |
| `ManageSellOfferResult.MANAGE_SELL_OFFER_MALFORMED` | Invalid offer parameters fail doCheckValid before submission. | `src/transactions/ManageSellOfferOpFrame.cpp:114 res.tr().manageSellOfferResult().code(MANAGE_SELL_OFFER_MALFORMED);` |
| `OperationResult.opNOT_SUPPORTED` | Unsupported operation types fail OperationFrame::checkValid before submission at protocol 30. | `src/transactions/OperationFrame.cpp:308 res.code(opNOT_SUPPORTED);` |
| `PathPaymentStrictReceiveResult.PATH_PAYMENT_STRICT_RECEIVE_MALFORMED` | Malformed path-payment parameters fail doCheckValid before submission. Apply also sets it in updateSourceBalance when the source account is missing (unreachable: OperationFrame::checkValid at apply fails such an op with opNO_ACCOUNT first) and in updateDestBalance before protocol 11 only. | `src/transactions/PathPaymentStrictReceiveOpFrame.cpp:223 innerResult(res).code(PATH_PAYMENT_STRICT_RECEIVE_MALFORMED);` |
| `PathPaymentStrictSendResult.PATH_PAYMENT_STRICT_SEND_MALFORMED` | Malformed path-payment parameters fail doCheckValid before submission. Apply also sets it in updateSourceBalance when the source account is missing (unreachable: OperationFrame::checkValid at apply fails such an op with opNO_ACCOUNT first) and in updateDestBalance before protocol 11 only. | `src/transactions/PathPaymentStrictSendOpFrame.cpp:215 innerResult(res).code(PATH_PAYMENT_STRICT_SEND_MALFORMED);` |
| `PaymentResult.PAYMENT_MALFORMED` | Malformed payment parameters fail doCheckValid before submission. | `src/transactions/PaymentOpFrame.cpp:143 innerResult(res).code(PAYMENT_MALFORMED);` |
| `RestoreFootprintResult.RESTORE_FOOTPRINT_MALFORMED` | An invalid restore footprint fails doCheckValidForSoroban before submission. | `src/transactions/RestoreFootprintOpFrame.cpp:440 innerResult(res).code(RESTORE_FOOTPRINT_MALFORMED);` |
| `RevokeSponsorshipResult.REVOKE_SPONSORSHIP_MALFORMED` | A malformed revoke-sponsorship target fails doCheckValid before submission. | `src/transactions/RevokeSponsorshipOpFrame.cpp:420 innerResult(res).code(REVOKE_SPONSORSHIP_MALFORMED);` |
| `SetOptionsResult.SET_OPTIONS_BAD_FLAGS` | Conflicting flag settings fail doCheckValid before submission. | `src/transactions/SetOptionsOpFrame.cpp:247 innerResult(res).code(SET_OPTIONS_BAD_FLAGS);` |
| `SetOptionsResult.SET_OPTIONS_BAD_SIGNER` | An invalid signer key or weight fails doCheckValid before submission. | `src/transactions/SetOptionsOpFrame.cpp:298 innerResult(res).code(SET_OPTIONS_BAD_SIGNER);` |
| `SetOptionsResult.SET_OPTIONS_INVALID_HOME_DOMAIN` | An invalid home-domain string fails doCheckValid before submission. | `src/transactions/SetOptionsOpFrame.cpp:322 innerResult(res).code(SET_OPTIONS_INVALID_HOME_DOMAIN);` |
| `SetOptionsResult.SET_OPTIONS_THRESHOLD_OUT_OF_RANGE` | An out-of-range threshold fails doCheckValid before submission. | `src/transactions/SetOptionsOpFrame.cpp:256 innerResult(res).code(SET_OPTIONS_THRESHOLD_OUT_OF_RANGE);` |
| `SetOptionsResult.SET_OPTIONS_UNKNOWN_FLAG` | Unsupported flag bits fail doCheckValid before submission. | `src/transactions/SetOptionsOpFrame.cpp:239 innerResult(res).code(SET_OPTIONS_UNKNOWN_FLAG);` |
| `SetTrustLineFlagsResult.SET_TRUST_LINE_FLAGS_MALFORMED` | Invalid asset, issuer, trustor, or flag masks fail doCheckValid before submission. | `src/transactions/SetTrustLineFlagsOpFrame.cpp:106 innerResult(res).code(SET_TRUST_LINE_FLAGS_MALFORMED);` |
| `TransactionResultResult.txFROZEN_KEY_ACCESSED` | The established frozen-key admission check rejects the transaction before inclusion. | `src/transactions/TransactionFrame.cpp:1488 txResult.setInnermostError(txFROZEN_KEY_ACCESSED);` |
| `TransactionResultResult.txINSUFFICIENT_FEE` | Apply re-runs the minimum-fee check against the same header base fee the transaction set was validated with at nomination; base-fee upgrades apply after a ledger's transactions, so an included transaction always passes. | `src/transactions/TransactionFrame.cpp:1458 if (chargeFee &&` |
| `TransactionResultResult.txMALFORMED` | Malformed envelope XDR fails checkValid before inclusion. | `src/transactions/TransactionFrame.cpp:1922 return MutableTransactionResult::createTxError(txMALFORMED);` |
| `TransactionResultResult.txMISSING_OPERATION` | A transaction with no operations fails admission validation. | `src/transactions/TransactionFrame.cpp:1300 txResult.setInnermostError(txMISSING_OPERATION);` |
| `TransactionResultResult.txNOT_SUPPORTED` | An unsupported envelope form fails admission validation at protocol 30. | `src/transactions/TransactionFrame.cpp:1264 txResult.setInnermostError(txNOT_SUPPORTED);` |
| `TransactionResultResult.txSOROBAN_INVALID` | Every txSOROBAN_INVALID check depends only on the transaction and the Soroban config. Apply re-runs them with the config the set was validated against: config upgrades apply after a ledger's transactions. | `src/transactions/TransactionFrame.cpp:1333 txResult.setInnermostError(txSOROBAN_INVALID);` |

### not-emitted (17 arms)

in the type graph, but stellar-core 30 never writes it into ledger-close meta.

| Arm | Why | Source line |
|---|---|---|
| `ConfigSettingEntry.CONFIG_SETTING_FREEZE_BYPASS_TXS_DELTA` | The upgrade applies the delta to the stored base setting and continues; no delta ConfigSettingEntry is written to ledger metadata. | `src/herder/Upgrades.cpp:1499 if (id == ConfigSettingID::CONFIG_SETTING_FREEZE_BYPASS_TXS_DELTA)` |
| `ConfigSettingEntry.CONFIG_SETTING_FROZEN_LEDGER_KEYS_DELTA` | Core applies this delta to the stored frozen-keys setting instead of storing the delta entry. | `src/herder/Upgrades.cpp:1467 // Delta entries are not stored config entries. They modify the` |
| `InnerTransactionResultResult.txINSUFFICIENT_BALANCE` | At protocol 30, fee-bump inner apply does not charge the inner source, and this balance result is guarded by chargeFee. | `src/transactions/FeeBumpTransactionFrame.cpp:94 /*chargeFee=*/false, app, ls, meta, txResult, getContentsHash(),` |
| `InnerTransactionResultResult.txINSUFFICIENT_FEE` | At protocol 30, the fee-bump inner path passes chargeFee false, so it cannot set this inner fee code. Before protocol 23 the !chargeFee branch could set it, but validation runs the same check, so it never reached a closed ledger either. | `src/transactions/FeeBumpTransactionFrame.cpp:94 /*chargeFee=*/false, app, ls, meta, txResult, getContentsHash(),` |
| `InvokeHostFunctionResult.INVOKE_HOST_FUNCTION_MALFORMED` | The protocol-30 host-function implementation has no setter for MALFORMED; its apply failure paths set other result codes. | `src/transactions/InvokeHostFunctionOpFrame.cpp:757 mOpFrame.innerResult(mRes).code(INVOKE_HOST_FUNCTION_TRAPPED);` |
| `LedgerKey.CONFIG_SETTING` | Core uses config keys internally for upgrades, while transaction footprints reject them; the config update records an entry change, not a CONFIG_SETTING LedgerKey arm. | `src/transactions/TransactionFrame.cpp:872 case CONFIG_SETTING:` |
| `OperationResult.opTOO_MANY_SPONSORING` | Needs an account sponsoring more than 2^32 - 1 entries; no ledger can hold that state. | `src/transactions/SponsorshipUtils.cpp:36 if (getNumSponsoring(acc) > UINT32_MAX - mult)` |
| `OperationResultTr.CREATE_PASSIVE_SELL_OFFER` | A passive offer is applied as a MANAGE_SELL_OFFER and its result carries the MANAGE_SELL_OFFER arm; measured in entry result.passive-offer-returns-manage-sell-offer (hazard H-C19). | `src/transactions/CreatePassiveSellOfferOpFrame.cpp:13 mCreateOp.body.type(MANAGE_SELL_OFFER);` |
| `SCError.SCE_EVENTS` | The host uses it only as an internal-error placeholder when a diagnostic argument cannot be rendered, and in debug-only paths; no contract-reachable path produces it. | `soroban-env-host-28.0.2/src/host/error.rs:407 Error::from_type_and_code(ScErrorType::Events, ScErrorCode::InternalError).into()` |
| `SCPHistoryEntry.0` | Core writes SCPHistoryEntry arm 0 to a separate SCP history file; it does not populate LedgerCloseMeta.scpInfo. | `src/herder/HerderPersistenceImpl.cpp:255 hEntryV.v(0);` |
| `SCPStatementPledges.SCP_ST_CONFIRM` | SCP pledges are written to the separate SCP history stream; the ledger-close metadata scpInfo array is not populated. | `src/herder/HerderPersistenceImpl.cpp:314 scpHistory.writeOne(hEntryV);` |
| `SCPStatementPledges.SCP_ST_EXTERNALIZE` | SCP pledges are written to the separate SCP history stream; the ledger-close metadata scpInfo array is not populated. | `src/herder/HerderPersistenceImpl.cpp:314 scpHistory.writeOne(hEntryV);` |
| `SCPStatementPledges.SCP_ST_NOMINATE` | SCP pledges are written to the separate SCP history stream; the ledger-close metadata scpInfo array is not populated. | `src/herder/HerderPersistenceImpl.cpp:314 scpHistory.writeOne(hEntryV);` |
| `SCPStatementPledges.SCP_ST_PREPARE` | SCP pledges are written to the separate SCP history stream; the ledger-close metadata scpInfo array is not populated. | `src/herder/HerderPersistenceImpl.cpp:314 scpHistory.writeOne(hEntryV);` |
| `TransactionMeta.0` | This core never constructs transaction metadata version 0, including when re-emitting older ledgers. | `src/transactions/TransactionMeta.cpp:529 // not support 0 or 1 at all -- core does not produce it anymore and we have` |
| `TransactionMeta.1` | This core never constructs transaction metadata version 1, including when re-emitting older ledgers. | `src/transactions/TransactionMeta.cpp:529 // not support 0 or 1 at all -- core does not produce it anymore and we have` |
| `TrustLineAsset.ASSET_TYPE_NATIVE` | Core rejects native trustlines and native trustline footprint keys, so it does not write this TrustLineAsset arm into ledger-close metadata. | `src/ledger/TrustLineWrapper.cpp:84 if (asset.type() == ASSET_TYPE_NATIVE)` |
