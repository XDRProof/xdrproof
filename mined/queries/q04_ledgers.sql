-- Q04: protocol upgrade ledgers (all history) and biggest ledgers in last 30 days
(SELECT 'upgrade' k, protocol_version pv, MIN(sequence) seq, MIN(closed_at) t, NULL ops, NULL txs FROM `crypto-stellar.crypto_stellar.history_ledgers_v2` WHERE closed_at >= TIMESTAMP('2025-01-01') GROUP BY protocol_version)
UNION ALL
(SELECT 'big' k, protocol_version, sequence, closed_at, tx_set_operation_count, transaction_count FROM `crypto-stellar.crypto_stellar.history_ledgers_v2` WHERE closed_at >= TIMESTAMP('2026-10-17') ORDER BY tx_set_operation_count DESC LIMIT 8)
ORDER BY k, seq
