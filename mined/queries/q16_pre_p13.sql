-- Q16 (B3, H-F8): pre-protocol-13 mainnet ledgers (TransactionEnvelope V0 only) with many transactions
SELECT protocol_version, sequence, closed_at, transaction_count, operation_count
FROM `crypto-stellar.crypto_stellar.history_ledgers_v2`
WHERE closed_at BETWEEN TIMESTAMP('2019-11-01') AND TIMESTAMP('2019-11-02') AND protocol_version < 13
ORDER BY transaction_count DESC LIMIT 3
