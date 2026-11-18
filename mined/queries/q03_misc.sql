-- Q03a: offers crossing many offers in one op (2 days of trades)
SELECT 'multi_cross' k, CAST(history_operation_id AS STRING) a, CAST(COUNT(*) AS STRING) b, CAST(MIN(trade_type) AS STRING) c
FROM `crypto-stellar.crypto_stellar.history_trades_v2`
WHERE closed_at >= TIMESTAMP('2026-11-15') AND closed_at < TIMESTAMP('2026-11-17')
GROUP BY history_operation_id HAVING COUNT(*)>=5 ORDER BY COUNT(*) DESC LIMIT 15
