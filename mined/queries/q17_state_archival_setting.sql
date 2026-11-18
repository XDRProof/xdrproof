-- Q17 (B3 review): the state-archival settings in force on mainnet, with the ledger that last set them
SELECT last_modified_ledger, closed_at, max_entries_to_archive, eviction_scan_size, starting_eviction_scan_level, min_persistent_ttl, min_temporary_ttl
FROM `crypto-stellar.crypto_stellar.config_settings_v2`
WHERE config_setting_id = 10
ORDER BY last_modified_ledger DESC LIMIT 5
