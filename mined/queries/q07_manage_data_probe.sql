-- Q07: how does Hubble store manage_data values? (1 day)
SELECT COUNT(*) n, COUNTIF(details.value IS NULL) n_null, COUNTIF(SAFE.FROM_BASE64(details.value) IS NULL AND details.value IS NOT NULL) n_notb64,
  COUNTIF(SAFE_CONVERT_BYTES_TO_STRING(SAFE.FROM_BASE64(details.value)) IS NULL AND details.value IS NOT NULL) n_bin,
  COUNTIF(STRPOS(SAFE_CONVERT_BYTES_TO_STRING(SAFE.FROM_BASE64(details.value)), '�')>0) n_repl,
  ARRAY_AGG(STRUCT(ledger_sequence, id, details.name, details.value) ORDER BY IF(STRPOS(SAFE_CONVERT_BYTES_TO_STRING(SAFE.FROM_BASE64(details.value)), '�')>0,0,1), LENGTH(details.value) DESC LIMIT 6) ex
FROM `crypto-stellar.crypto_stellar.history_operations_v2`
WHERE closed_at >= TIMESTAMP('2026-11-16') AND closed_at < TIMESTAMP('2026-11-17') AND type=10
