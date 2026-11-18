// xdrproof-native: line-delimited JSON over stdin/stdout.
// Request:  {"id": "...", "type": "LedgerCloseMeta", "xdr": "<base64>"}
// Response: {"id": "...", "status": "ok", "identical": true, "json": <SEP-0051 value>}
//        or {"id": "...", "status": "error", "stage": "decode"|"encode", "message": "..."}
// Request:  {"id": "...", "op": "tx_hashes", "xdr": "<LedgerCloseMeta base64>", "network_id": "<hex>"}
// Response: {"id": "...", "status": "ok", "hashes": [...]} in transaction-set order
// Limits: depth 1500 (the depth stellar-rpc's xdr2json uses), length 256 MiB.
use serde_json::{json, Value};
use std::io::{BufRead, BufWriter, Write};
use std::str::FromStr;
use sha2::{Digest, Sha256};
use stellar_xdr::{
    GeneralizedTransactionSet, Hash, LedgerCloseMeta, Limits, MuxedAccount, Preconditions, ReadXdr, Transaction, TransactionEnvelope,
    TransactionExt, TransactionPhase, TransactionSignaturePayload, TransactionSignaturePayloadTaggedTransaction, TxSetComponent, Type,
    TypeVariant, WriteXdr,
};

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

fn handle(req: &Value) -> Value {
    let id = req.get("id").cloned().unwrap_or(Value::Null);
    if req.get("op").and_then(Value::as_str) == Some("tx_hashes") { return handle_tx_hashes(id, req); }
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
