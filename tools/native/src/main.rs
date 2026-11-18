// xdrproof-native: line-delimited JSON over stdin/stdout.
// Request:  {"id": "...", "type": "LedgerCloseMeta", "xdr": "<base64>"}
// Response: {"id": "...", "status": "ok", "identical": true, "json": <SEP-0051 value>}
//        or {"id": "...", "status": "error", "stage": "decode"|"encode", "message": "..."}
// Limits: depth 1500 (the depth stellar-rpc's xdr2json uses), length 256 MiB.
use serde_json::{json, Value};
use std::io::{BufRead, BufWriter, Write};
use std::str::FromStr;
use stellar_xdr::{Limits, Type, TypeVariant, WriteXdr};

fn limits() -> Limits {
    Limits { depth: 1500, len: 256 * 1024 * 1024 }
}

fn handle(req: &Value) -> Value {
    let id = req.get("id").cloned().unwrap_or(Value::Null);
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
