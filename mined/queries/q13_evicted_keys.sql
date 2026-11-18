-- Q13 (B3, H-D6): recent mainnet ledgers whose LedgerCloseMeta carries evicted keys, most first
SELECT sequence, protocol_version, closed_at, ARRAY_LENGTH(evicted_ledger_keys_type) AS n, evicted_ledger_keys_type
FROM `crypto-stellar.crypto_stellar.history_ledgers_v2`
WHERE closed_at >= TIMESTAMP('2026-11-10') AND ARRAY_LENGTH(evicted_ledger_keys_type) > 0
ORDER BY n DESC LIMIT 15
