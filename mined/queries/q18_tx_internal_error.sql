-- Q18: transactions in closed mainnet ledgers whose result is rare enough that a standalone core cannot produce it
-- (txINTERNAL_ERROR: core threw while applying; txTOO_EARLY / txTOO_LATE at apply; and anything else not a plain
-- success or failure), January 2025 to November 2026. Run on 24 Nov 2026: one txINTERNAL_ERROR, in ledger 58357467;
-- no txTOO_EARLY or txTOO_LATE. About 157 GB scanned. transaction_result_code is the outer result: a fee-bumped
-- transaction whose inner transaction ended this way shows as txFEE_BUMP_INNER_FAILED, which this filter leaves out.
SELECT transaction_result_code AS code, COUNT(*) AS n, MIN(ledger_sequence) AS first_ledger, MAX(ledger_sequence) AS last_ledger
FROM `crypto-stellar.crypto_stellar.history_transactions`
WHERE batch_run_date >= '2025-01-01'
  AND transaction_result_code NOT IN ('TransactionResultCodeTxSuccess', 'TransactionResultCodeTxFeeBumpInnerSuccess',
                                      'TransactionResultCodeTxFailed', 'TransactionResultCodeTxFeeBumpInnerFailed')
GROUP BY code ORDER BY n DESC;

-- then the transaction itself:
SELECT transaction_hash, ledger_sequence, closed_at, operation_count, fee_charged
FROM `crypto-stellar.crypto_stellar.history_transactions`
WHERE batch_run_date >= '2025-01-01' AND ledger_sequence = 58357467
  AND transaction_result_code = 'TransactionResultCodeTxInternalError';
