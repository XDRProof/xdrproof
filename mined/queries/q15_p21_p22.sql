-- Q15 (B3, H-F8): one day of protocol 21 and 22 ledgers with the most operations (Soroban era, TxMeta v3)
SELECT protocol_version, sequence, closed_at, transaction_count, operation_count
FROM `crypto-stellar.crypto_stellar.history_ledgers_v2`
WHERE (closed_at BETWEEN TIMESTAMP('2024-09-10') AND TIMESTAMP('2024-09-11')) OR (closed_at BETWEEN TIMESTAMP('2025-03-10') AND TIMESTAMP('2025-03-11'))
QUALIFY ROW_NUMBER() OVER (PARTITION BY protocol_version ORDER BY operation_count DESC) <= 3
