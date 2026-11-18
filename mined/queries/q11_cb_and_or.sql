-- Q11: create_claimable_balance with and/or predicates (and ideally relative time), 7 days
SELECT ledger_sequence, id, operation_trace_code trace,
  (SELECT COUNT(*) FROM UNNEST(details.claimants) c, UNNEST(c.predicate) p WHERE ARRAY_LENGTH(p.`and`)>0) n_and,
  (SELECT COUNT(*) FROM UNNEST(details.claimants) c, UNNEST(c.predicate) p WHERE ARRAY_LENGTH(p.`or`)>0) n_or,
  (SELECT COUNT(*) FROM UNNEST(details.claimants) c, UNNEST(c.predicate) p, UNNEST(p.`and`) a WHERE a.rel_before IS NOT NULL OR ARRAY_LENGTH(a.`not`)>0 OR ARRAY_LENGTH(a.`or`)>0 OR ARRAY_LENGTH(a.`and`)>0) n_and_deep,
  (SELECT COUNT(*) FROM UNNEST(details.claimants) c, UNNEST(c.predicate) p, UNNEST(p.`or`) a WHERE a.rel_before IS NOT NULL OR ARRAY_LENGTH(a.`not`)>0 OR ARRAY_LENGTH(a.`or`)>0 OR ARRAY_LENGTH(a.`and`)>0) n_or_deep,
  TO_JSON_STRING(details.claimants) claimants
FROM `crypto-stellar.crypto_stellar.history_operations_v2`
WHERE closed_at >= TIMESTAMP('2026-11-10') AND closed_at < TIMESTAMP('2026-11-17') AND type=14
  AND EXISTS(SELECT 1 FROM UNNEST(details.claimants) c, UNNEST(c.predicate) p WHERE ARRAY_LENGTH(p.`and`)>0 OR ARRAY_LENGTH(p.`or`)>0)
ORDER BY IF(operation_trace_code LIKE '%Success',0,1), n_and_deep + n_or_deep DESC, n_and*n_or DESC, id DESC LIMIT 8
