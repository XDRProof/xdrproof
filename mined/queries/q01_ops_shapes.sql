-- Q01: one pass over 7 days of mainnet operations, up to 3 example rows per shape
WITH ops AS (
  SELECT id, ledger_sequence, type, source_account_muxed, operation_result_code, operation_trace_code, closed_at,
    CASE
      WHEN type=1 AND details.to_muxed IS NOT NULL THEN 'muxed_payment_dest'
      WHEN type=14 AND EXISTS(SELECT 1 FROM UNNEST(details.claimants) c, UNNEST(c.predicate) p WHERE ARRAY_LENGTH(p.`and`)>0 OR ARRAY_LENGTH(p.`or`)>0 OR ARRAY_LENGTH(p.`not`)>0) THEN 'cb_nested_predicate'
      WHEN type=15 THEN 'cb_claim'
      WHEN type=22 THEN 'lp_deposit'
      WHEN type=23 THEN 'lp_withdraw'
      WHEN type=6 AND details.asset_type='liquidity_pool_shares' AND details.`limit`=0 THEN 'lp_trust_remove'
      WHEN type=6 AND details.asset_type='liquidity_pool_shares' THEN 'lp_trust_add'
      WHEN type IN (2,13) AND ARRAY_LENGTH(details.path)>=3 THEN CONCAT('path3_', CAST(type AS STRING))
      WHEN type=8 THEN 'account_merge'
      WHEN type=11 THEN 'bump_sequence'
      WHEN type=10 AND details.value IS NOT NULL AND SAFE_CONVERT_BYTES_TO_STRING(SAFE.FROM_BASE64(details.value)) IS NULL THEN 'manage_data_binary'
      WHEN type=19 THEN 'clawback'
      WHEN type=20 THEN 'clawback_cb'
      WHEN type=21 THEN 'set_trust_line_flags'
      WHEN type=16 THEN 'begin_sponsoring'
      WHEN type=18 THEN 'revoke_sponsorship'
      WHEN type=5 AND details.signer_key LIKE 'X%' AND details.signer_weight>0 THEN 'signer_hashx'
      WHEN type=5 AND details.signer_key LIKE 'T%' AND details.signer_weight>0 THEN 'signer_preauth'
      WHEN type=5 AND details.signer_key LIKE 'P%' THEN 'signer_signed_payload'
      WHEN type=26 THEN 'restore_footprint'
      WHEN type=25 THEN 'extend_footprint_ttl'
      WHEN type=24 AND details.type='upload_wasm' THEN 'upload_wasm'
      WHEN type=24 AND details.type='create_contract' THEN 'create_contract'
      WHEN type=24 AND details.type='create_contract_v2' THEN 'create_contract_v2'
      WHEN type=24 AND details.parameters_decoded[SAFE_OFFSET(1)].value IN ('upgrade','update','update_contract','upgrade_contract','update_wasm','upgrade_wasm') THEN 'soroban_fn_upgrade'
      WHEN type=24 AND operation_trace_code NOT LIKE '%Success' THEN CONCAT('soroban_failed_', operation_trace_code)
      WHEN type IN (1,6) AND details.asset_type='credit_alphanum12' THEN CONCAT('alphanum12_', CAST(type AS STRING))
      WHEN type=9 THEN 'inflation'
      WHEN type=7 THEN 'allow_trust'
      WHEN type=4 THEN 'create_passive_sell_offer'
    END AS shape,
    details.type AS dtype, details.signer_key, details.asset_code, details.to_muxed, ARRAY_LENGTH(details.path) AS pathlen
  FROM `crypto-stellar.crypto_stellar.history_operations_v2`
  WHERE closed_at >= TIMESTAMP('2026-11-10') AND closed_at < TIMESTAMP('2026-11-17')
)
SELECT shape, COUNT(*) n,
  ARRAY_AGG(STRUCT(id, ledger_sequence, operation_trace_code AS trace, signer_key, asset_code, to_muxed, pathlen) ORDER BY IF(operation_trace_code LIKE '%Success' OR shape LIKE 'soroban_failed%',0,1), pathlen DESC, id DESC LIMIT 3) ex
FROM ops WHERE shape IS NOT NULL GROUP BY shape ORDER BY shape
