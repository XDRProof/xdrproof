-- Q10: Soroban ops whose op source or tx source is muxed (wallet-backend#753 shape), 14 days
SELECT o.ledger_sequence, o.id, o.type, o.source_account_muxed op_src_muxed, t.account_muxed tx_src_muxed, o.operation_trace_code trace
FROM `crypto-stellar.crypto_stellar.history_operations_v2` o
LEFT JOIN (SELECT id, account_muxed FROM `crypto-stellar.crypto_stellar.history_transactions_v2`
           WHERE closed_at >= TIMESTAMP('2026-11-03') AND closed_at < TIMESTAMP('2026-11-17') AND account_muxed IS NOT NULL AND account_muxed != '') t
  ON t.id = o.transaction_id
WHERE o.closed_at >= TIMESTAMP('2026-11-03') AND o.closed_at < TIMESTAMP('2026-11-17') AND o.type IN (24,25,26)
  AND ((o.source_account_muxed IS NOT NULL AND o.source_account_muxed != '') OR t.account_muxed IS NOT NULL)
ORDER BY IF(o.operation_trace_code LIKE '%Success',0,1), o.id DESC LIMIT 12
