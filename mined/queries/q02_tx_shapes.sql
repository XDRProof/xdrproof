-- Q02: 7 days of mainnet transactions: fee-bump inner failed, muxed source, memo kinds
WITH t AS (
  SELECT transaction_hash, ledger_sequence, id, memo_type, memo, account_muxed, fee_account_muxed, transaction_result_code,
    CASE
      WHEN transaction_result_code LIKE '%FeeBumpInnerFailed' THEN 'fee_bump_inner_failed'
      WHEN memo_type='MemoTypeMemoReturn' THEN 'memo_return'
      WHEN memo_type='MemoTypeMemoHash' THEN 'memo_hash'
      WHEN memo_type='MemoTypeMemoText' AND (REGEXP_CONTAINS(memo, r'\\x[0-9a-fA-F]{2}') OR STRPOS(memo, '�')>0) THEN 'memo_text_nonutf8_candidate'
      WHEN fee_account_muxed IS NOT NULL AND fee_account_muxed != '' THEN 'muxed_fee_source'
      WHEN account_muxed IS NOT NULL AND account_muxed != '' THEN 'muxed_tx_source'
    END shape
  FROM `crypto-stellar.crypto_stellar.history_transactions_v2`
  WHERE closed_at >= TIMESTAMP('2026-11-10') AND closed_at < TIMESTAMP('2026-11-17')
)
SELECT shape, COUNT(*) n, ARRAY_AGG(STRUCT(transaction_hash, ledger_sequence, memo, account_muxed, fee_account_muxed, transaction_result_code AS code) ORDER BY id DESC LIMIT 4) ex
FROM t WHERE shape IS NOT NULL GROUP BY shape ORDER BY shape
