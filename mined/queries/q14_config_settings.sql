-- Q14 (B3, H-F10): ledgers where a Soroban config setting was last modified (settings votes)
SELECT last_modified_ledger, ARRAY_AGG(DISTINCT CAST(config_setting_id AS STRING) ORDER BY CAST(config_setting_id AS STRING)) AS settings, MIN(closed_at) AS closed_at
FROM `crypto-stellar.crypto_stellar.config_settings_v2`
GROUP BY last_modified_ledger ORDER BY last_modified_ledger DESC LIMIT 25
