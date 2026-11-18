-- Q09: Soroban invocations whose top-level args include a muxed (M...) address (CAP-0067 transfer to muxed), 4 weeks
SELECT ledger_sequence, id, details.contract_id, details.parameters_decoded[SAFE_OFFSET(1)].value fn, operation_trace_code trace,
  (SELECT p.value FROM UNNEST(details.parameters_decoded) p WHERE STARTS_WITH(p.value,'M') AND LENGTH(p.value)=69 LIMIT 1) muxed
FROM `crypto-stellar.crypto_stellar.history_operations_v2`
WHERE closed_at >= TIMESTAMP('2026-10-20') AND closed_at < TIMESTAMP('2026-11-17') AND type=24
  AND EXISTS(SELECT 1 FROM UNNEST(details.parameters_decoded) p WHERE STARTS_WITH(p.value,'M') AND LENGTH(p.value)=69)
ORDER BY IF(operation_trace_code LIKE '%Success',0,1), id DESC LIMIT 20
