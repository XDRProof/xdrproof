-- Q06: system contract events (executable_update = wasm upgrade) in 7 days
SELECT ledger_sequence, transaction_hash, contract_id, type_string, TO_JSON_STRING(topics_decoded) topics, SUBSTR(TO_JSON_STRING(data_decoded),1,300) data
FROM `crypto-stellar.crypto_stellar.history_contract_events_v2`
WHERE closed_at >= TIMESTAMP('2026-11-10') AND closed_at < TIMESTAMP('2026-11-17') AND type = 0
ORDER BY ledger_sequence DESC LIMIT 20
