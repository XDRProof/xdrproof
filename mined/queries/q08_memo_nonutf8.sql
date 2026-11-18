-- Q08: memo text carrying U+FFFD (Go json replaces invalid UTF-8 bytes with it) or escape sequences, 61 days (P28-P29 era)
SELECT ledger_sequence, transaction_hash, memo, TO_HEX(CAST(memo AS BYTES)) memo_utf8_hex, closed_at
FROM `crypto-stellar.crypto_stellar.history_transactions_v2`
WHERE closed_at >= TIMESTAMP('2026-09-17') AND closed_at < TIMESTAMP('2026-11-17')
  AND memo_type='MemoTypeMemoText' AND (STRPOS(memo, '�')>0 OR REGEXP_CONTAINS(memo, r'\\x[0-9a-fA-F]{2}|\\u00'))
ORDER BY ledger_sequence DESC LIMIT 30
