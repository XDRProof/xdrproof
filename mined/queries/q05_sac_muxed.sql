-- Q05: token transfers to a muxed destination that came from a contract invocation (2 days)
SELECT t.ledger_sequence, t.transaction_hash, t.operation_id, t.event_topic, t.`from`, t.`to`, t.to_muxed, t.to_muxed_id, t.asset, t.amount_raw, t.contract_id
FROM `crypto-stellar.crypto_stellar.token_transfers_raw_v2` t
WHERE t.closed_at >= TIMESTAMP('2026-11-15') AND t.closed_at < TIMESTAMP('2026-11-17')
  AND t.to_muxed IS NOT NULL AND t.to_muxed != ''
  AND (t.`from` LIKE 'C%' OR t.asset_type IS NULL OR t.asset_type NOT IN ('native','credit_alphanum4','credit_alphanum12') OR t.operation_id IN (
     SELECT id FROM `crypto-stellar.crypto_stellar.history_operations_v2` WHERE closed_at >= TIMESTAMP('2026-11-15') AND closed_at < TIMESTAMP('2026-11-17') AND type=24))
ORDER BY t.ledger_sequence DESC LIMIT 20
