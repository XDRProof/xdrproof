// xdrproof-native: line-delimited JSON over stdin/stdout.
// Request:  {"id": "...", "type": "LedgerCloseMeta", "xdr": "<base64>"}
// Response: {"id": "...", "status": "ok", "identical": true, "json": <SEP-0051 value>}
//        or {"id": "...", "status": "error", "stage": "decode"|"encode", "message": "..."}
// Request:  {"id": "...", "op": "tx_hashes", "xdr": "<LedgerCloseMeta base64>", "network_id": "<hex>"}
// Response: {"id": "...", "status": "ok", "hashes": [...]} in transaction-set order
// Request:  {"id": "...", "op": "ledger_entries", "xdr": "<LedgerCloseMeta base64>"}
// Response: {"id": "...", "status": "ok", "entries": [{key, xdr, ext, last_modified, live_until?}], "removed": [key...]}:
//           the state every entry the ledger touches is left in, as stellar-rpc's getLedgerEntries reports it
//           (key = LedgerKey, xdr = LedgerEntryData, ext = LedgerEntryExt, all base64; live_until from the TTL entry)
// Request:  {"id": "...", "op": "ledger_header", "xdr": "<LedgerCloseMeta base64>"}
// Response: {"id": "...", "status": "ok", "header_xdr": "<LedgerHeaderHistoryEntry base64>"}, the bytes
//           stellar-rpc's getLedgers returns as headerXdr (it slices them out of the ledger; XDR is canonical,
//           so re-encoding the decoded entry gives the same bytes)
// Limits: depth 1500 (the depth stellar-rpc's xdr2json uses), length 256 MiB.
use serde_json::{json, Value};
use std::io::{BufRead, BufWriter, Write};
use std::str::FromStr;
use sha2::{Digest, Sha256};
use stellar_xdr::{
    GeneralizedTransactionSet, Hash, LedgerCloseMeta, LedgerEntry, LedgerEntryChange, LedgerEntryChanges, LedgerEntryData,
    LedgerKey, LedgerKeyAccount, LedgerKeyClaimableBalance, LedgerKeyConfigSetting, LedgerKeyContractCode, LedgerKeyContractData,
    LedgerKeyData, LedgerKeyLiquidityPool, LedgerKeyOffer, LedgerKeyTrustLine, LedgerKeyTtl, Limits, MuxedAccount, Preconditions,
    ReadXdr, Transaction, TransactionEnvelope, TransactionExt, TransactionMeta, TransactionPhase, TransactionSignaturePayload,
    TransactionSignaturePayloadTaggedTransaction, TxSetComponent, Type, TypeVariant, WriteXdr,
};
use std::collections::BTreeMap;

fn limits() -> Limits {
    Limits { depth: 1500, len: 256 * 1024 * 1024 }
}

// Transaction hash = sha256(TransactionSignaturePayload { network_id, tagged transaction }), as stellar-core
// computes it; a V0 envelope is hashed as the equivalent V1 transaction (ENVELOPE_TYPE_TX), as core does.
fn tx_hash(env: &TransactionEnvelope, network_id: &Hash) -> Result<String, String> {
    let tagged = match env {
        TransactionEnvelope::Tx(e) => TransactionSignaturePayloadTaggedTransaction::Tx(e.tx.clone()),
        TransactionEnvelope::TxFeeBump(e) => TransactionSignaturePayloadTaggedTransaction::TxFeeBump(e.tx.clone()),
        TransactionEnvelope::TxV0(e) => {
            let v0 = &e.tx;
            TransactionSignaturePayloadTaggedTransaction::Tx(Transaction {
                source_account: MuxedAccount::Ed25519(v0.source_account_ed25519.clone()),
                fee: v0.fee,
                seq_num: v0.seq_num.clone(),
                cond: match &v0.time_bounds { Some(tb) => Preconditions::Time(tb.clone()), None => Preconditions::None },
                memo: v0.memo.clone(),
                operations: v0.operations.clone(),
                ext: TransactionExt::V0,
            })
        }
    };
    let payload = TransactionSignaturePayload { network_id: network_id.clone(), tagged_transaction: tagged };
    let bytes = payload.to_xdr(limits()).map_err(|e| e.to_string())?;
    Ok(hex(&Sha256::digest(&bytes)))
}

fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{:02x}", x)).collect() }

// Every envelope of the ledger's transaction set, in the order its SEP-0051 JSON lists them
// (phases, then components or stages and clusters, then transactions).
fn envelopes(lcm: &LedgerCloseMeta) -> Vec<&TransactionEnvelope> {
    let gen = match lcm {
        LedgerCloseMeta::V0(m) => return m.tx_set.txs.iter().collect(),
        LedgerCloseMeta::V1(m) => &m.tx_set,
        LedgerCloseMeta::V2(m) => &m.tx_set,
    };
    let GeneralizedTransactionSet::V1(set) = gen;
    let mut out = Vec::new();
    for phase in set.phases.iter() {
        match phase {
            TransactionPhase::V0(components) => {
                for c in components.iter() {
                    let TxSetComponent::TxsetCompTxsMaybeDiscountedFee(c) = c;
                    out.extend(c.txs.iter());
                }
            }
            TransactionPhase::V1(p) => {
                for stage in p.execution_stages.iter() {
                    for cluster in stage.0.iter() { out.extend(cluster.0.iter()); }
                }
            }
        }
    }
    out
}

// {"op": "tx_hashes", "xdr": <LedgerCloseMeta base64>, "network_id": <hex>} -> {"hashes": [...]}
fn handle_tx_hashes(id: Value, req: &Value) -> Value {
    let lcm = match LedgerCloseMeta::from_xdr_base64(req["xdr"].as_str().unwrap_or(""), limits()) {
        Ok(v) => v,
        Err(e) => return json!({"id": id, "status": "error", "stage": "decode", "message": e.to_string()}),
    };
    let nid_hex = req["network_id"].as_str().unwrap_or("");
    let nid: Vec<u8> = (0..nid_hex.len() / 2).filter_map(|i| u8::from_str_radix(&nid_hex[2 * i..2 * i + 2], 16).ok()).collect();
    let Ok(nid) = <[u8; 32]>::try_from(nid) else {
        return json!({"id": id, "status": "error", "stage": "request", "message": "network_id must be 32 bytes hex"});
    };
    let network_id = Hash(nid);
    let mut hashes = Vec::new();
    for env in envelopes(&lcm) {
        match tx_hash(env, &network_id) {
            Ok(h) => hashes.push(h),
            Err(e) => return json!({"id": id, "status": "error", "stage": "hash", "message": e}),
        }
    }
    json!({"id": id, "status": "ok", "hashes": hashes})
}

// The LedgerKey of an entry, as stellar-core derives it (LedgerEntryKey in ledger/LedgerTypeUtils).
fn entry_key(d: &LedgerEntryData) -> LedgerKey {
    match d {
        LedgerEntryData::Account(a) => LedgerKey::Account(LedgerKeyAccount { account_id: a.account_id.clone() }),
        LedgerEntryData::Trustline(t) => LedgerKey::Trustline(LedgerKeyTrustLine { account_id: t.account_id.clone(), asset: t.asset.clone() }),
        LedgerEntryData::Offer(o) => LedgerKey::Offer(LedgerKeyOffer { seller_id: o.seller_id.clone(), offer_id: o.offer_id }),
        LedgerEntryData::Data(x) => LedgerKey::Data(LedgerKeyData { account_id: x.account_id.clone(), data_name: x.data_name.clone() }),
        LedgerEntryData::ClaimableBalance(c) => LedgerKey::ClaimableBalance(LedgerKeyClaimableBalance { balance_id: c.balance_id.clone() }),
        LedgerEntryData::LiquidityPool(p) => LedgerKey::LiquidityPool(LedgerKeyLiquidityPool { liquidity_pool_id: p.liquidity_pool_id.clone() }),
        LedgerEntryData::ContractData(c) => LedgerKey::ContractData(LedgerKeyContractData { contract: c.contract.clone(), key: c.key.clone(), durability: c.durability }),
        LedgerEntryData::ContractCode(c) => LedgerKey::ContractCode(LedgerKeyContractCode { hash: c.hash.clone() }),
        LedgerEntryData::ConfigSetting(c) => LedgerKey::ConfigSetting(LedgerKeyConfigSetting { config_setting_id: c.discriminant() }),
        LedgerEntryData::Ttl(t) => LedgerKey::Ttl(LedgerKeyTtl { key_hash: t.key_hash.clone() }),
    }
}

// Every change group of a transaction's apply, in order.
fn apply_groups(m: &TransactionMeta) -> Vec<&LedgerEntryChanges> {
    match m {
        TransactionMeta::V0(ops) => ops.iter().map(|o| &o.changes).collect(),
        TransactionMeta::V1(v) => std::iter::once(&v.tx_changes).chain(v.operations.iter().map(|o| &o.changes)).collect(),
        TransactionMeta::V2(v) => std::iter::once(&v.tx_changes_before).chain(v.operations.iter().map(|o| &o.changes)).chain(std::iter::once(&v.tx_changes_after)).collect(),
        TransactionMeta::V3(v) => std::iter::once(&v.tx_changes_before).chain(v.operations.iter().map(|o| &o.changes)).chain(std::iter::once(&v.tx_changes_after)).collect(),
        TransactionMeta::V4(v) => std::iter::once(&v.tx_changes_before).chain(v.operations.iter().map(|o| &o.changes)).chain(std::iter::once(&v.tx_changes_after)).collect(),
    }
}

// {"op": "ledger_entries", "xdr": <LedgerCloseMeta base64>} -> the state each touched entry is left in
fn handle_ledger_entries(id: Value, req: &Value) -> Value {
    let lcm = match LedgerCloseMeta::from_xdr_base64(req["xdr"].as_str().unwrap_or(""), limits()) {
        Ok(v) => v,
        Err(e) => return json!({"id": id, "status": "error", "stage": "decode", "message": e.to_string()}),
    };
    // apply order: every fee charge, every transaction's apply, every post-apply refund, upgrades, evictions
    let mut groups: Vec<&LedgerEntryChanges> = Vec::new();
    let evicted: Vec<&LedgerKey> = match &lcm {
        LedgerCloseMeta::V0(m) => {
            groups.extend(m.tx_processing.iter().map(|t| &t.fee_processing));
            for t in m.tx_processing.iter() { groups.extend(apply_groups(&t.tx_apply_processing)); }
            groups.extend(m.upgrades_processing.iter().map(|u| &u.changes));
            vec![]
        }
        LedgerCloseMeta::V1(m) => {
            groups.extend(m.tx_processing.iter().map(|t| &t.fee_processing));
            for t in m.tx_processing.iter() { groups.extend(apply_groups(&t.tx_apply_processing)); }
            groups.extend(m.upgrades_processing.iter().map(|u| &u.changes));
            m.evicted_keys.iter().collect()
        }
        LedgerCloseMeta::V2(m) => {
            groups.extend(m.tx_processing.iter().map(|t| &t.fee_processing));
            for t in m.tx_processing.iter() { groups.extend(apply_groups(&t.tx_apply_processing)); }
            groups.extend(m.tx_processing.iter().map(|t| &t.post_tx_apply_fee_processing));
            groups.extend(m.upgrades_processing.iter().map(|u| &u.changes));
            m.evicted_keys.iter().collect()
        }
    };
    // keyed by the key's XDR bytes, so equal keys collapse however they were reached
    let mut state: BTreeMap<Vec<u8>, (LedgerKey, Option<LedgerEntry>)> = BTreeMap::new();
    let enc = |k: &LedgerKey| k.to_xdr(limits()).unwrap_or_default();
    for g in groups {
        for c in g.iter() {
            match c {
                LedgerEntryChange::Created(e) | LedgerEntryChange::Updated(e) | LedgerEntryChange::Restored(e) => {
                    let k = entry_key(&e.data);
                    state.insert(enc(&k), (k, Some(e.clone())));
                }
                LedgerEntryChange::Removed(k) => { state.insert(enc(k), (k.clone(), None)); }
                LedgerEntryChange::State(_) => {}
            }
        }
    }
    for k in evicted { state.insert(enc(k), (k.clone(), None)); }
    // TTLs by the hash of the key they extend
    let mut ttl: BTreeMap<[u8; 32], u32> = BTreeMap::new();
    for (_, e) in state.values() {
        if let Some(LedgerEntry { data: LedgerEntryData::Ttl(t), .. }) = e { ttl.insert(t.key_hash.0, t.live_until_ledger_seq); }
    }
    let b64 = |r: Result<String, stellar_xdr::Error>| r.unwrap_or_default();
    let mut entries = Vec::new();
    let mut removed = Vec::new();
    for (k, (key, e)) in state.iter() {
        match e {
            None => removed.push(json!(b64(key.to_xdr_base64(limits())))),
            Some(e) => {
                let mut o = json!({
                    "key": b64(key.to_xdr_base64(limits())),
                    "xdr": b64(e.data.to_xdr_base64(limits())),
                    "ext": b64(e.ext.to_xdr_base64(limits())),
                    "last_modified": e.last_modified_ledger_seq,
                });
                if matches!(e.data, LedgerEntryData::ContractData(_) | LedgerEntryData::ContractCode(_)) {
                    let h: [u8; 32] = Sha256::digest(k).into();
                    if let Some(l) = ttl.get(&h) { o["live_until"] = json!(l); }
                }
                entries.push(o);
            }
        }
    }
    json!({"id": id, "status": "ok", "entries": entries, "removed": removed})
}

// {"op": "ledger_header", "xdr": <LedgerCloseMeta base64>} -> {"header_xdr": <LedgerHeaderHistoryEntry base64>}
fn handle_ledger_header(id: Value, req: &Value) -> Value {
    let lcm = match LedgerCloseMeta::from_xdr_base64(req["xdr"].as_str().unwrap_or(""), limits()) {
        Ok(v) => v,
        Err(e) => return json!({"id": id, "status": "error", "stage": "decode", "message": e.to_string()}),
    };
    let header = match &lcm {
        LedgerCloseMeta::V0(m) => &m.ledger_header,
        LedgerCloseMeta::V1(m) => &m.ledger_header,
        LedgerCloseMeta::V2(m) => &m.ledger_header,
    };
    match header.to_xdr_base64(limits()) {
        Ok(b) => json!({"id": id, "status": "ok", "header_xdr": b}),
        Err(e) => json!({"id": id, "status": "error", "stage": "encode", "message": e.to_string()}),
    }
}

fn handle(req: &Value) -> Value {
    let id = req.get("id").cloned().unwrap_or(Value::Null);
    if req.get("op").and_then(Value::as_str) == Some("tx_hashes") { return handle_tx_hashes(id, req); }
    if req.get("op").and_then(Value::as_str) == Some("ledger_header") { return handle_ledger_header(id, req); }
    if req.get("op").and_then(Value::as_str) == Some("ledger_entries") { return handle_ledger_entries(id, req); }
    let tv = match TypeVariant::from_str(req["type"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(_) => return json!({"id": id, "status": "error", "stage": "type", "message": "unknown XDR type"}),
    };
    let input = req["xdr"].as_str().unwrap_or("");
    let value = match Type::from_xdr_base64(tv, input, limits()) {
        Ok(v) => v,
        Err(e) => return json!({"id": id, "status": "error", "stage": "decode", "message": e.to_string()}),
    };
    let back = match value.to_xdr_base64(limits()) {
        Ok(x) => x,
        Err(e) => return json!({"id": id, "status": "error", "stage": "encode", "message": e.to_string()}),
    };
    let rendered = serde_json::to_value(&value).unwrap_or(Value::Null);
    json!({"id": id, "status": "ok", "identical": back == input, "json": rendered})
}

fn main() {
    let stdin = std::io::stdin();
    let mut out = BufWriter::new(std::io::stdout());
    for line in stdin.lock().lines() {
        let line = match line { Ok(l) => l, Err(_) => break };
        if line.trim().is_empty() { continue; }
        let resp = match serde_json::from_str::<Value>(&line) {
            Ok(req) => handle(&req),
            Err(e) => json!({"status": "error", "stage": "request", "message": e.to_string()}),
        };
        writeln!(out, "{}", resp).ok();
        out.flush().ok();
    }
}
